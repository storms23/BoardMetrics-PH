"""
Claude Vision extraction for scanned PRC Performance-of-Schools PDFs.

Renders each page to PNG, sends to Anthropic vision, returns school rows
(school name + Overall pass/fail/total/rate only).
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from normalize import infer_region

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env.local")
load_dotenv(_root / ".env")

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
VISION_MODEL = os.getenv(
    "ANTHROPIC_VISION_MODEL",
    os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
)
PAGE_PAUSE_SEC = float(os.getenv("ANTHROPIC_PAGE_PAUSE", "0.4"))

VISION_PROMPT = (
    "This image is one page from a PRC Philippines 'Performance of Schools' PDF. "
    "The table has 14 columns grouped as: School | First Timers (passed, failed, "
    "total, %) | Repeaters (passed, failed, total, %) | Overall (passed, failed, "
    "total, %).\n\n"
    "Extract ONLY data rows with a real school or institution name and the "
    "OVERALL group (last 4 numeric columns: passers, failed, takers, pass_rate%). "
    "Do NOT use First Timers or Repeaters columns.\n\n"
    "Skip cover text, headers, footnotes, and rows without a school name.\n"
    "passers must be <= takers. pass_rate is 0-100.\n\n"
    "Return ONLY a JSON array, no markdown fences:\n"
    '[{"school":"SCHOOL NAME","takers":100,"passers":80,"pass_rate":80.0}]'
)


def _parse_json_array(text: str) -> list[dict]:
    cleaned = re.sub(r"```json|```", "", text.strip()).strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "schools" in data:
            inner = data["schools"]
            return inner if isinstance(inner, list) else []
    except json.JSONDecodeError:
        pass
    m = re.search(r"\[[\s\S]*\]", cleaned)
    if m:
        try:
            data = json.loads(m.group(0))
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            pass
    return []


def pdf_pages_to_png_bytes(
    pdf_bytes: bytes,
    *,
    dpi: int = 300,
    skip_first_page: bool = True,
) -> list[tuple[int, bytes]]:
    """Return list of (page_index_1based, png_bytes)."""
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    out: list[tuple[int, bytes]] = []
    start = 1 if skip_first_page and doc.page_count > 1 else 0
    scale = dpi / 72.0
    mat = fitz.Matrix(scale, scale)
    for idx in range(start, doc.page_count):
        pix = doc[idx].get_pixmap(matrix=mat, alpha=False)
        out.append((idx + 1, pix.tobytes("png")))
    doc.close()
    return out


def _normalize_row(raw: dict) -> dict | None:
    name = str(raw.get("school", "")).strip()
    if not name or len(name) < 3:
        return None
    if re.search(r"^(school|performance|overall|first timers|repeaters)\b", name, re.I):
        return None
    try:
        takers = int(str(raw.get("takers", "")).replace(",", ""))
        passers = int(str(raw.get("passers", "")).replace(",", ""))
        rate = float(str(raw.get("pass_rate", "")).replace("%", "").replace(",", ""))
    except (TypeError, ValueError):
        return None
    if takers <= 0 or passers > takers or rate < 0 or rate > 100:
        return None
    rank = raw.get("rank")
    try:
        rank_i = int(rank) if rank is not None else None
    except (TypeError, ValueError):
        rank_i = None
    return {
        "rank": rank_i,
        "school": name,
        "takers": takers,
        "passers": passers,
        "pass_rate": round(rate, 4),
        "region": infer_region(name),
    }


def extract_page_vision(client, png_bytes: bytes) -> list[dict]:
    """Call Anthropic vision for one page PNG."""
    b64 = base64.standard_b64encode(png_bytes).decode()
    msg = client.messages.create(
        model=VISION_MODEL,
        max_tokens=8192,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": b64,
                    },
                },
                {"type": "text", "text": VISION_PROMPT},
            ],
        }],
    )
    parts = []
    for block in msg.content:
        if hasattr(block, "text"):
            parts.append(block.text)
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    text = "".join(parts)
    rows = []
    for raw in _parse_json_array(text):
        if isinstance(raw, dict):
            norm = _normalize_row(raw)
            if norm:
                rows.append(norm)
    return rows


def _is_fatal_api_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(
        phrase in msg
        for phrase in (
            "credit balance",
            "invalid_api_key",
            "authentication",
            "permission",
        )
    )


def extract_schools_vision_pdf(
    pdf_bytes: bytes,
    *,
    dpi: int = 300,
    skip_first_page: bool = True,
    verbose: bool = True,
) -> tuple[list[dict], dict]:
    """
    Page-by-page Claude Vision extraction.

    Returns (schools, meta) where meta has pages_processed, pages_with_rows, etc.
    """
    if not ANTHROPIC_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. Add it to .env.local for vision extraction."
        )

    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    pages = pdf_pages_to_png_bytes(
        pdf_bytes, dpi=dpi, skip_first_page=skip_first_page,
    )
    merged: dict[str, dict] = {}
    pages_with_rows = 0
    errors: list[str] = []

    for page_num, png in pages:
        try:
            rows = extract_page_vision(client, png)
            if rows:
                pages_with_rows += 1
            for row in rows:
                key = row["school"].upper()
                merged[key] = row
            if verbose:
                print(f"    vision page {page_num}/{pages[-1][0]}: {len(rows)} schools")
        except Exception as exc:
            errors.append(f"page {page_num}: {exc}")
            if verbose:
                print(f"    vision page {page_num}: error — {exc}")
            if _is_fatal_api_error(exc):
                raise RuntimeError(
                    "Anthropic API unavailable (check credits or API key). "
                    f"Last error: {exc}"
                ) from exc
        time.sleep(PAGE_PAUSE_SEC)

    schools = list(merged.values())
    for i, row in enumerate(schools, start=1):
        row["rank"] = row.get("rank") or i

    meta = {
        "model": VISION_MODEL,
        "pages_processed": len(pages),
        "pages_with_rows": pages_with_rows,
        "errors": errors,
    }
    return schools, meta
