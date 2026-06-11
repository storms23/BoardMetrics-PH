"""
LLM vision OCR — DeepSeek API (OpenAI-compatible).

Used for national stat images and school-table OCR fallback.
"""

from __future__ import annotations

import base64
import json
import os
import re

import requests
from dotenv import load_dotenv
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env.local")
load_dotenv(_root / ".env")

DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
OCR_SPACE_KEY = os.getenv("OCR_SPACE_API_KEY", "")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}


def _parse_json_response(text: str) -> dict | list | None:
    cleaned = re.sub(r"```json|```", "", text.strip()).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{[^{}]*\}", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None


def _ocrspace_text(
    *,
    url: str | None = None,
    base64_data: str | None = None,
    timeout: int = 90,
) -> str:
    """OCR via OCR.space (DeepSeek chat API is text-only — no image_url support)."""
    if not OCR_SPACE_KEY:
        return ""
    payload: dict = {
        "apikey": OCR_SPACE_KEY,
        "language": "eng",
        "isTable": "true",
        "OCREngine": "3",
        "scale": "true",
    }
    if url:
        payload["url"] = url
    elif base64_data:
        payload["base64Image"] = base64_data
    else:
        return ""
    try:
        resp = requests.post(
            "https://api.ocr.space/parse/image",
            data=payload,
            timeout=timeout,
        )
        result = resp.json()
        if result.get("IsErroredOnProcessing"):
            return ""
        parsed = result.get("ParsedResults") or []
        if not parsed or parsed[0].get("FileParseExitCode") != 1:
            return ""
        return parsed[0].get("ParsedText") or ""
    except Exception as exc:
        print(f"  OCR.space error: {exc}")
        return ""


def _deepseek_text(prompt: str) -> str | None:
    if not DEEPSEEK_KEY:
        return None
    try:
        resp = requests.post(
            f"{DEEPSEEK_BASE}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEEPSEEK_MODEL,
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=120,
        )
        if resp.status_code != 200:
            print(f"  DeepSeek API HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        print(f"  DeepSeek text error: {exc}")
        return None


def extract_national_summary_from_image_url(image_url: str) -> dict | None:
    """OCR national pass-rate stats from a result announcement image."""
    try:
        from national_extract import get_summary

        text = _ocrspace_text(url=image_url)
        if not text:
            resp = requests.get(image_url, headers=HEADERS, timeout=30)
            if resp.status_code != 200:
                return None
            media = "image/png" if image_url.lower().endswith(".png") else "image/jpeg"
            b64 = base64.standard_b64encode(resp.content).decode()
            text = _ocrspace_text(base64_data=f"data:{media};base64,{b64}")
        return get_summary(text) if text else None
    except Exception as exc:
        print(f"  National image OCR error: {exc}")
        return None


def _school_table_from_ocr_text(text: str) -> list:
    if not text.strip():
        return []
    if DEEPSEEK_KEY:
        prompt = (
            "Extract every row from this school performance table OCR text. "
            "Return ONLY valid JSON array, no markdown:\n"
            '[{"rank":1,"school":"School Name","takers":100,"passers":80,"pass_rate":80.0}]\n\n'
            f"OCR text:\n{text[:12000]}"
        )
        txt = _deepseek_text(prompt)
        data = _parse_json_response(txt) if txt else None
        if isinstance(data, list):
            return data
    return []


def ocr_school_table_from_pdf(pdf_bytes: bytes) -> list:
    """Extract school performance rows from a scanned PDF via OCR.space + DeepSeek text."""
    b64 = base64.standard_b64encode(pdf_bytes).decode()
    text = _ocrspace_text(base64_data=f"data:application/pdf;base64,{b64}", timeout=180)
    return _school_table_from_ocr_text(text)


def ocr_school_table_from_image(image_bytes: bytes, media_type: str = "image/jpeg") -> list:
    """Extract school performance rows from an image via OCR.space + DeepSeek text."""
    b64 = base64.standard_b64encode(image_bytes).decode()
    text = _ocrspace_text(base64_data=f"data:{media_type};base64,{b64}")
    return _school_table_from_ocr_text(text)
