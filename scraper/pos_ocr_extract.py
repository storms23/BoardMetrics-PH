"""
Local OCR extraction for scanned PRC Performance-of-Schools PDFs.

Pipeline: PyMuPDF render (300 DPI) → Tesseract OCR → existing PRC parsers.

Requires Tesseract on PATH or at the default Windows install path.
"""

from __future__ import annotations

import io
import os
import re
import shutil
from pathlib import Path

from prc_gov_ph import parse_prc_pos_pdf, parse_prc_pos_text

TESSERACT_CANDIDATES = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
)

# PRC POS row after OCR (simplified 5-col layout: school + overall stats)
POS_SIMPLE_RE = re.compile(
    r"^\s*(\d+)?\s*(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s*%?\s*$",
    re.I,
)


def configure_tesseract() -> str | None:
    """Return resolved tesseract binary path, or None if unavailable."""
    import pytesseract

    found = shutil.which("tesseract")
    if found:
        pytesseract.pytesseract.tesseract_cmd = found
        return found
    for candidate in TESSERACT_CANDIDATES:
        if os.path.isfile(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            return candidate
    return None


def pdf_has_text_layer(pdf_bytes: bytes, *, min_chars: int = 40) -> bool:
    try:
        import pdfplumber
    except ImportError:
        return False
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return False
            sample = (pdf.pages[0].extract_text() or "").strip()
            return len(sample) >= min_chars
    except Exception:
        return False


def ocr_page_image(page, *, dpi: int = 300) -> str:
    """OCR one PyMuPDF page to plain text."""
    import pytesseract
    from PIL import Image

    pix = page.get_pixmap(dpi=dpi, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    # PSM 6 = uniform text block; good for dense POS tables
    return pytesseract.image_to_string(
        img,
        lang="eng",
        config="--oem 3 --psm 6",
    )


def _preprocess_image(img):
    from PIL import ImageOps
    return ImageOps.autocontrast(ImageOps.grayscale(img))


def _ocr_column_strips(page, *, dpi: int = 400) -> tuple[list[str], list[str]]:
    """
    OCR school name (left) and overall stats (right) in separate vertical strips.
    PRC POS PDFs use ~14 columns; we only need school + overall pass/fail/total/rate.
    """
    import pytesseract
    from PIL import Image

    pix = page.get_pixmap(dpi=dpi, alpha=False)
    img = _preprocess_image(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    w, h = img.size
    # Empirical splits for PRC POS letter layout
    school_img = img.crop((0, int(h * 0.08), int(w * 0.42), h))
    overall_img = img.crop((int(w * 0.72), int(h * 0.08), w, h))

    cfg = "--oem 3 --psm 6 -c preserve_interword_spaces=1"
    school_lines = [
        ln.strip()
        for ln in pytesseract.image_to_string(school_img, lang="eng", config=cfg).splitlines()
        if ln.strip()
    ]
    overall_lines = [
        ln.strip()
        for ln in pytesseract.image_to_string(overall_img, lang="eng", config=cfg).splitlines()
        if ln.strip()
    ]
    return school_lines, overall_lines


def _merge_school_overall_lines(
    school_lines: list[str],
    overall_lines: list[str],
) -> list[str]:
    """Pair school names with overall numeric columns by row index."""
    merged: list[str] = []
    # Skip header lines (contain PASSED, OVERALL, etc.)
    def is_data_line(s: str) -> bool:
        if re.search(r"\b(PASSED|FAILED|OVERALL|PERFORMANCE|TIMERS|school)\b", s, re.I):
            return False
        return len(s) >= 4

    def is_stats_line(s: str) -> bool:
        return bool(re.search(r"\d", s)) and not re.search(
            r"\b(PASSED|FAILED|OVERALL|PERFORMANCE|TIMERS)\b", s, re.I
        )

    schools = [ln for ln in school_lines if is_data_line(ln)]
    stats = [ln for ln in overall_lines if is_stats_line(ln)]

    # Align by index; allow stats to lag by skipping junk school lines
    si = 0
    for st in stats:
        while si < len(schools) and not re.search(r"[A-Za-z]{4}", schools[si]):
            si += 1
        if si >= len(schools):
            break
        school = re.sub(r"^\d+\s+", "", schools[si]).strip()
        si += 1
        if len(school) < 4:
            continue
        merged.append(f"{school} {st}")
    return merged


def _parse_merged_pos_lines(lines: list[str]) -> list[dict]:
    """Parse merged 'SCHOOL ... nums ... rate%' lines."""
    from normalize import infer_region

    schools: list[dict] = []
    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        nums = re.findall(r"[\d,]+\.?\d*", line.replace("%", " "))
        pcts = re.findall(r"([\d.]+)\s*%", line)
        if not pcts:
            continue
        rate = float(pcts[-1])
        # Last 3 integers before rate are often passers, failed, takers (overall)
        ints = [int(n.replace(",", "")) for n in nums if re.match(r"^[\d,]+$", n)]
        if len(ints) >= 3:
            passers, failed, takers = ints[-3], ints[-2], ints[-1]
        elif len(ints) == 2:
            passers, takers = ints[-2], ints[-1]
            failed = takers - passers
        elif len(ints) == 1:
            takers = ints[-1]
            passers = round(takers * rate / 100)
            failed = takers - passers
        else:
            continue
        if takers <= 0 or passers > takers:
            continue
        # School = text before first number cluster
        m = re.match(r"^(.+?)\s+[\d,]", line)
        name = _clean_school_from_ocr(m.group(1) if m else line.split()[0])
        if not name or len(name) < 4:
            continue
        schools.append({
            "school": name,
            "takers": takers,
            "passers": passers,
            "pass_rate": rate,
            "rank": len(schools) + 1,
            "region": infer_region(name),
        })
    return schools


def _clean_school_from_ocr(name: str) -> str:
    name = re.sub(r"^\d+\s+", "", name.strip())
    name = re.sub(r"[^A-Za-z0-9\s&().,\-/']", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def ocr_pdf_bytes(pdf_bytes: bytes, *, dpi: int = 300, max_pages: int | None = None) -> tuple[str, int]:
    """OCR all pages; returns (combined_text, pages_ocrd)."""
    import fitz

    if configure_tesseract() is None:
        raise RuntimeError(
            "Tesseract not found. Install from https://github.com/UB-Mannheim/tesseract/wiki"
        )

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    chunks: list[str] = []
    pages = doc.page_count if max_pages is None else min(doc.page_count, max_pages)
    for idx in range(pages):
        text = ocr_page_image(doc[idx], dpi=dpi)
        if text.strip():
            chunks.append(text)
    doc.close()
    return "\n".join(chunks), pages


def ocr_pdf_column_strips(
    pdf_bytes: bytes,
    *,
    dpi: int = 400,
    max_pages: int | None = None,
) -> tuple[list[dict], int]:
    """Column-sliced OCR tuned for PRC POS scanned tables."""
    import fitz

    if configure_tesseract() is None:
        raise RuntimeError("Tesseract not found")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    all_schools: list[dict] = []
    pages = doc.page_count if max_pages is None else min(doc.page_count, max_pages)
    for idx in range(pages):
        if idx == 0:
            continue  # page 1 is cover/header in most PRC POS PDFs
        school_lines, overall_lines = _ocr_column_strips(doc[idx], dpi=dpi)
        merged = _merge_school_overall_lines(school_lines, overall_lines)
        page_schools = _parse_merged_pos_lines(merged)
        seen = {s["school"].upper() for s in all_schools}
        for row in page_schools:
            key = row["school"].upper()
            if key not in seen:
                seen.add(key)
                all_schools.append(row)
    doc.close()
    for i, row in enumerate(all_schools, start=1):
        row["rank"] = i
    return all_schools, pages


def _parse_simple_pos_lines(text: str) -> list[dict]:
    """Fallback parser for OCR text that lost multi-column structure."""
    from normalize import infer_region

    schools: list[dict] = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if len(line) < 15:
            continue
        if re.search(r"^(seq|school|first timers|repeaters|overall|performance)\b", line, re.I):
            continue
        m = POS_SIMPLE_RE.match(line)
        if not m:
            continue
        rank_s, school, _p1, _p2, takers, rate = m.groups()
        try:
            takers_i = int(takers.replace(",", ""))
            rate_f = float(rate.replace("%", ""))
        except ValueError:
            continue
        if takers_i <= 0:
            continue
        passers = round(takers_i * rate_f / 100)
        schools.append({
            "rank": int(rank_s) if rank_s else len(schools) + 1,
            "school": school.strip(),
            "takers": takers_i,
            "passers": passers,
            "pass_rate": rate_f,
            "region": infer_region(school),
        })
    return schools


def parse_schools_from_text(text: str) -> tuple[list[dict], str]:
    """Apply PRC parsers to OCR/plain text."""
    merged: dict[str, dict] = {}
    for row in parse_prc_pos_text(text):
        name = str(row.get("school", "")).strip()
        if name:
            merged[name.upper()] = row

    parser = "parse_prc_pos_text"
    if len(merged) < 20:
        for row in _parse_simple_pos_lines(text):
            name = str(row.get("school", "")).strip()
            if name:
                merged[name.upper()] = row
        if len(merged) >= 20:
            parser = "parse_prc_pos_text+simple_fallback"

    out = list(merged.values())
    for i, row in enumerate(out, start=1):
        row["rank"] = row.get("rank") or i
    return out, parser


def extract_schools_local_ocr(
    pdf_bytes: bytes,
    *,
    dpi: int = 300,
    max_pages: int | None = None,
) -> dict:
    """
    Full local-OCR extraction for one POS PDF.

    Returns dict with schools, parser label, page count, and diagnostics.
    """
    if pdf_has_text_layer(pdf_bytes):
        schools = parse_prc_pos_pdf(pdf_bytes)
        if len(schools) >= 5:
            return {
                "schools": schools,
                "parser": "parse_prc_pos_pdf",
                "pages_ocrd": 0,
                "text_chars": 0,
                "method": "text_layer",
            }

    text, pages_ocrd = ocr_pdf_bytes(pdf_bytes, dpi=dpi, max_pages=max_pages)
    schools, parser = parse_schools_from_text(text)

    if len(schools) < 20:
        strip_schools, _ = ocr_pdf_column_strips(
            pdf_bytes, dpi=max(dpi, 400), max_pages=max_pages,
        )
        if len(strip_schools) > len(schools):
            schools = strip_schools
            parser = "column_strip_ocr"

    return {
        "schools": schools,
        "parser": f"local_ocr_{parser}",
        "pages_ocrd": pages_ocrd,
        "text_chars": len(text),
        "method": "pymupdf_tesseract",
        "sample_text": text[:800] if text else "",
    }
