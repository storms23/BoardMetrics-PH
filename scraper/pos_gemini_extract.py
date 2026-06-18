"""
Gemini Vision extraction for scanned PRC Performance-of-Schools PDFs.

Renders each page to PNG (PyMuPDF), sends to Gemini API, returns school rows.
"""

from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

from pos_vision_extract import (
    VISION_PROMPT,
    _normalize_row,
    _parse_json_array,
    pdf_pages_to_png_bytes,
)

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env.local")
load_dotenv(_root / ".env")

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash")
PAGE_PAUSE_SEC = float(os.getenv("GEMINI_PAGE_PAUSE", "4.0"))
GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent / "output" / "gemini_page_cache"


def _cache_path(cache_dir: Path, pdf_bytes: bytes, page_num: int) -> Path:
    import hashlib
    digest = hashlib.sha256(pdf_bytes).hexdigest()[:16]
    return cache_dir / f"{digest}_p{page_num}.json"


def check_gemini_available() -> None:
    """Fail fast when the API key is missing or quota is exhausted."""
    if not GEMINI_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")
    url = f"{GEMINI_API}/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"
    resp = requests.post(
        url,
        json={"contents": [{"parts": [{"text": "Reply with OK"}]}]},
        timeout=30,
    )
    if resp.status_code == 200:
        return
    body = resp.text[:500]
    if resp.status_code == 429 and "quota" in body.lower():
        raise RuntimeError(
            "Gemini API quota exceeded. Wait for rate-limit reset or enable billing. "
            f"Details: {body[:200]}"
        )
    if resp.status_code in (401, 403):
        raise RuntimeError(f"Gemini API auth failed ({resp.status_code}): {body[:200]}")
    raise RuntimeError(f"Gemini API check failed ({resp.status_code}): {body[:200]}")


def _quota_exceeded(resp: requests.Response) -> bool:
    if resp.status_code != 429:
        return False
    return "quota" in resp.text.lower()


def _is_fatal_api_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    if "max retries exceeded" in msg or "connection" in msg or "getaddrinfo" in msg:
        return False
    return any(
        phrase in msg
        for phrase in (
            "api key not valid",
            "invalid api key",
            "api_key_invalid",
            "permission denied",
            "quota exceeded",
            "billing",
            "resource_exhausted",
        )
    )


def extract_page_gemini(png_bytes: bytes, *, attempts: int = 3) -> list[dict]:
    """Call Gemini vision for one page PNG."""
    if not GEMINI_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    b64 = base64.standard_b64encode(png_bytes).decode()
    url = f"{GEMINI_API}/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/png", "data": b64}},
                {"text": VISION_PROMPT},
            ],
        }],
        "generationConfig": {
            "maxOutputTokens": 8192,
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            resp = requests.post(url, json=payload, timeout=180)
            if _quota_exceeded(resp):
                raise RuntimeError(
                    f"Gemini quota exceeded: {resp.text[:300]}"
                )
            if resp.status_code == 429:
                last_exc = RuntimeError(f"Gemini HTTP 429: rate limited")
                time.sleep(8 * (attempt + 1))
                continue
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text[:400]}")

            data = resp.json()
            candidates = data.get("candidates") or []
            if not candidates:
                block = (data.get("promptFeedback") or {}).get("blockReason")
                raise RuntimeError(f"Gemini empty response (block={block})")

            parts = (candidates[0].get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
            rows = []
            for raw in _parse_json_array(text):
                if isinstance(raw, dict):
                    norm = _normalize_row(raw)
                    if norm:
                        rows.append(norm)
            return rows
        except Exception as exc:
            last_exc = exc
            if _is_fatal_api_error(exc):
                raise
            if attempt + 1 < attempts:
                time.sleep(5 * (attempt + 1))
    raise last_exc or RuntimeError("Gemini page OCR failed after retries")


def extract_schools_gemini_pdf(
    pdf_bytes: bytes,
    *,
    dpi: int = 300,
    skip_first_page: bool = True,
    verbose: bool = True,
    cache_dir: Path | None = DEFAULT_CACHE_DIR,
) -> tuple[list[dict], dict]:
    """Page-by-page Gemini Vision extraction."""
    if not GEMINI_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY not set. Add it to .env.local for Gemini vision extraction."
        )

    if cache_dir:
        cache_dir.mkdir(parents=True, exist_ok=True)

    pages = pdf_pages_to_png_bytes(
        pdf_bytes, dpi=dpi, skip_first_page=skip_first_page,
    )
    merged: dict[str, dict] = {}
    pages_with_rows = 0
    pages_from_cache = 0
    errors: list[str] = []
    failed_page_nums: set[int] = set()
    last_page = pages[-1][0] if pages else 0

    def _apply_rows(page_num: int, rows: list[dict], *, cached: bool) -> None:
        nonlocal pages_with_rows, pages_from_cache
        if rows:
            pages_with_rows += 1
            if cached:
                pages_from_cache += 1
        for row in rows:
            merged[row["school"].upper()] = row
        if verbose:
            tag = "cached" if cached else f"{len(rows)} schools"
            print(f"    gemini page {page_num}/{last_page}: {tag}")

    for page_num, png in pages:
        cache_file = _cache_path(cache_dir, pdf_bytes, page_num) if cache_dir else None
        if cache_file and cache_file.is_file():
            try:
                rows = json.loads(cache_file.read_text(encoding="utf-8"))
                if isinstance(rows, list):
                    _apply_rows(page_num, rows, cached=True)
                    continue
            except (json.JSONDecodeError, OSError):
                pass
        try:
            rows = extract_page_gemini(png)
            _apply_rows(page_num, rows, cached=False)
            if cache_file and rows:
                cache_file.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:
            errors.append(f"page {page_num}: {exc}")
            failed_page_nums.add(page_num)
            if verbose:
                print(f"    gemini page {page_num}: error — {exc}")
            if _is_fatal_api_error(exc) or "quota exceeded" in str(exc).lower():
                break
        time.sleep(PAGE_PAUSE_SEC)

    if failed_page_nums:
        if verbose:
            print(f"    gemini retry: {len(failed_page_nums)} failed page(s)")
        time.sleep(10)
        for page_num, png in pages:
            if page_num not in failed_page_nums:
                continue
            try:
                rows = extract_page_gemini(png, attempts=4)
                _apply_rows(page_num, rows, cached=False)
                if cache_dir:
                    cf = _cache_path(cache_dir, pdf_bytes, page_num)
                    if rows:
                        cf.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
                errors = [e for e in errors if not e.startswith(f"page {page_num}:")]
                failed_page_nums.discard(page_num)
            except Exception as exc:
                if verbose:
                    print(f"    gemini page {page_num} (retry): error — {exc}")
                if _is_fatal_api_error(exc) or "quota exceeded" in str(exc).lower():
                    break
            time.sleep(PAGE_PAUSE_SEC)

    schools = list(merged.values())
    for i, row in enumerate(schools, start=1):
        row["rank"] = row.get("rank") or i

    meta = {
        "model": GEMINI_MODEL,
        "pages_processed": len(pages),
        "pages_with_rows": pages_with_rows,
        "pages_from_cache": pages_from_cache,
        "errors": errors,
    }
    return schools, meta
