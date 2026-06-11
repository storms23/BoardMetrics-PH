#!/usr/bin/env python3
"""
Ingest Performance of Schools PDFs from a local folder (manual Drive export).

Usage:
  python ingest_manual_pos.py CELE scraper/input/cele_pos --dry-run
  python ingest_manual_pos.py CELE scraper/input/cele_pos
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import sys
import time
from pathlib import Path

import db
from national_extract import get_summary
from national_validate import validate_stats
from normalize import infer_region
from prc_gov_ph import parse_prc_pos_pdf, parse_prc_pos_text
from programs import resolve_exam_code

OCR_SPACE_KEY = os.getenv("OCR_SPACE_API_KEY", "K87217505288957")
OCR_PAUSE = 1.5

DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1nlmlyXLDZSzQJWbiB2ZSMBbAKS8MrN2v"

FILENAME_RE = re.compile(
    r"(?i)^(march|may|nov|november|april)_(\d{4})_cele\.pdf$",
)

MONTH_MAP = {
    "march": "March",
    "may": "May",
    "nov": "November",
    "november": "November",
    "april": "April",
}


def parse_filename(path: Path) -> tuple[str, int] | None:
    m = FILENAME_RE.match(path.name)
    if not m:
        return None
    month = MONTH_MAP.get(m.group(1).lower())
    if not month:
        return None
    return month, int(m.group(2))


def _ensure_ocr_key() -> None:
    if OCR_SPACE_KEY:
        os.environ.setdefault("OCR_SPACE_API_KEY", OCR_SPACE_KEY)
        import ocr_llm
        ocr_llm.OCR_SPACE_KEY = OCR_SPACE_KEY


def _ocr_page_png(page, *, timeout: int = 120) -> str:
    from ocr_llm import _ocrspace_text

    _ensure_ocr_key()
    if not OCR_SPACE_KEY:
        return ""
    buf = io.BytesIO()
    page.to_image(resolution=200).save(buf, format="PNG")
    b64 = base64.standard_b64encode(buf.getvalue()).decode()
    for attempt in range(2):
        text = _ocrspace_text(
            base64_data=f"data:image/png;base64,{b64}",
            timeout=timeout,
        )
        if text:
            return text
        if attempt == 0:
            time.sleep(3)
    return ""


def _pdf_has_text_layer(pdf_bytes: bytes) -> bool:
    try:
        import pdfplumber
    except ImportError:
        return False
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return False
            sample = (pdf.pages[0].extract_text() or "").strip()
            return len(sample) >= 40
    except Exception:
        return False


def _parse_school_table_from_text(text: str) -> list[dict]:
    schools: list[dict] = []
    for line in [ln.strip() for ln in text.split("\n") if ln.strip()]:
        if "|" in line and line.count("|") >= 5:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 5:
                try:
                    if parts[0].upper() in ("RANK", "---") or "SCHOOL" in parts[1].upper():
                        continue
                    schools.append({
                        "rank": int(parts[0].replace(",", "")),
                        "school": parts[1].strip(),
                        "takers": int(parts[2].replace(",", "")),
                        "passers": int(parts[3].replace(",", "")),
                        "pass_rate": float(parts[4].replace("%", "").replace(",", "")),
                        "region": infer_region(parts[1]),
                    })
                    continue
                except (ValueError, IndexError):
                    pass
        match = re.match(
            r"^\s*(\d+)\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s*%?\s*$",
            line,
            re.I,
        )
        if match:
            rank, school, takers, passers, rate = match.groups()
            schools.append({
                "rank": int(rank),
                "school": school.strip(),
                "takers": int(takers.replace(",", "")),
                "passers": int(passers.replace(",", "")),
                "pass_rate": float(rate),
                "region": infer_region(school),
            })
    return schools


def extract_schools_from_pdf(pdf_bytes: bytes) -> tuple[list[dict], str]:
    """Return (schools, parser_label)."""
    _ensure_ocr_key()
    schools = parse_prc_pos_pdf(pdf_bytes)
    if len(schools) >= 5:
        return schools, "parse_prc_pos_pdf"

    if _pdf_has_text_layer(pdf_bytes):
        return schools, "parse_prc_pos_pdf_partial"

    try:
        import pdfplumber
    except ImportError:
        return [], "pdfplumber_missing"

    merged: dict[str, dict] = {}
    ocr_pages = 0
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages):
            text = (page.extract_text() or "").strip()
            if len(text) < 40:
                text = _ocr_page_png(page)
                if text:
                    ocr_pages += 1
                    time.sleep(OCR_PAUSE)
            if not text:
                continue
            for row in parse_prc_pos_text(text) + _parse_school_table_from_text(text):
                name = str(row.get("school", "")).strip()
                if not name:
                    continue
                merged[name.upper()] = row

    if not merged:
        return [], "ocr_empty"

    out = list(merged.values())
    for i, row in enumerate(out, start=1):
        row["rank"] = row.get("rank") or i
        if "region" not in row:
            row["region"] = infer_region(row.get("school", ""))
    label = f"ocr_pages_{ocr_pages}" if ocr_pages else "text_fallback"
    return out, label


def extract_summary_from_pdf_bytes(pdf_bytes: bytes) -> dict | None:
    try:
        import pdfplumber
    except ImportError:
        return None
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return None
            chunks: list[str] = []
            for page in pdf.pages[:2]:
                text = page.extract_text() or ""
                if len(text.strip()) < 20:
                    text = _ocr_page_png(page)
                if text:
                    chunks.append(text)
            combined = "\n".join(chunks)
            return get_summary(combined) if combined else None
    except Exception:
        return None


def filter_schools(schools: list[dict]) -> tuple[list[dict], list[str]]:
    ok: list[dict] = []
    warnings: list[str] = []
    for s in schools:
        name = str(s.get("school", "")).strip()
        takers = s.get("takers")
        passers = s.get("passers")
        if not name:
            warnings.append("skipped empty school name")
            continue
        try:
            t = int(takers)
            p = int(passers)
        except (TypeError, ValueError):
            warnings.append(f"skipped invalid numbers: {name}")
            continue
        if p > t or t <= 0:
            warnings.append(f"skipped passers>takers: {name}")
            continue
        ok.append(s)
    return ok, warnings


def ingest_pdf(
    exam_code: str,
    path: Path,
    *,
    dry_run: bool,
) -> dict:
    parsed = parse_filename(path)
    if not parsed:
        return {
            "file": path.name,
            "status": "skipped",
            "detail": "filename not recognized",
        }

    month, year = parsed
    pdf_bytes = path.read_bytes()
    schools, parser_used = extract_schools_from_pdf(pdf_bytes)

    schools, school_warnings = filter_schools(schools)
    stats = extract_summary_from_pdf_bytes(pdf_bytes)
    stats_ok = False
    stats_detail = ""
    if stats:
        stats_ok, stats_detail = validate_stats(stats)

    source_url = f"{DRIVE_FOLDER_URL}#{path.name}"
    top_sample = [
        {
            "rank": s.get("rank"),
            "school": s.get("school"),
            "takers": s.get("takers"),
            "passers": s.get("passers"),
            "pass_rate": s.get("pass_rate"),
        }
        for s in schools[:3]
    ]

    result: dict = {
        "file": path.name,
        "month": month,
        "year": year,
        "status": "pending",
        "parser": parser_used,
        "schools_parsed": len(schools),
        "national": stats if stats_ok else None,
        "national_missing": not stats_ok,
        "national_note": stats_detail if stats and not stats_ok else (
            "no summary in PDF text" if not stats else ""
        ),
        "top_schools": top_sample,
        "warnings": school_warnings[:10],
    }

    if not schools:
        result["status"] = "failed"
        result["detail"] = "no schools parsed"
        return result

    if dry_run:
        result["status"] = "dry-run"
        result["detail"] = (
            f"would save {len(schools)} schools"
            + (f", national {stats['total_passers']}/{stats['total_takers']}" if stats_ok else ", no national stats")
        )
        return result

    job_id = db.start_import_job(exam_code, year)
    try:
        existing = db.get_exam_result(exam_code, month, year)
        if stats_ok:
            eid = db.upsert_exam_result(exam_code, month, year, stats, source_url)
        elif existing and (existing.get("total_takers") or 0) > 0:
            # Keep national stats from manual CSV / prior ingest; schools only.
            eid = existing["id"]
        elif existing:
            eid = existing["id"]
        else:
            placeholder = {
                "total_passers": 0,
                "total_takers": 0,
                "pass_rate": 0.0,
            }
            eid = db.upsert_exam_result(exam_code, month, year, placeholder, source_url)
        saved = db.upsert_school_performance(eid, schools)
        db.audit("import", "exam_results", eid, {
            "exam_code": exam_code,
            "month": month,
            "year": year,
            "source": "manual_pos",
            "file": path.name,
            "schools_saved": saved,
            "has_national": stats_ok,
        })

        if saved < len(schools) * 0.9:
            db.finish_import_job(
                job_id, "failed", saved,
                f"Only saved {saved}/{len(schools)} schools from {path.name}",
            )
            result["status"] = "partial"
            result["detail"] = f"saved {saved}/{len(schools)} schools"
        else:
            db.finish_import_job(job_id, "success", saved)
            result["status"] = "saved"
            result["schools_saved"] = saved
            result["detail"] = (
                f"saved {saved} schools"
                + (f", national {stats['total_passers']}/{stats['total_takers']} ({stats['pass_rate']}%)" if stats_ok else ", schools only (no national)")
            )
    except Exception as exc:
        db.finish_import_job(job_id, "failed", 0, str(exc))
        result["status"] = "failed"
        result["detail"] = str(exc)

    return result


def _is_text_pdf(path: Path) -> bool:
    """True when the PDF has an extractable text layer (no OCR needed)."""
    return _pdf_has_text_layer(path.read_bytes())


def run_folder(
    exam_code: str,
    folder: Path,
    *,
    dry_run: bool,
    text_only: bool,
    report_path: Path,
) -> dict:
    pdfs = sorted(folder.glob("*.pdf"))
    if text_only:
        pdfs = [p for p in pdfs if _is_text_pdf(p)]
    if not pdfs:
        print(f"No PDFs in {folder}" + (" (text-only filter)" if text_only else ""))
        sys.exit(1)

    print(f"\nIngest {exam_code} from {folder} ({len(pdfs)} PDFs)"
          f"{' [dry-run]' if dry_run else ''}"
          f"{' [text-only]' if text_only else ''}\n")

    results: list[dict] = []
    counts = {"saved": 0, "dry-run": 0, "failed": 0, "partial": 0, "skipped": 0}

    for path in pdfs:
        r = ingest_pdf(exam_code, path, dry_run=dry_run)
        results.append(r)
        status = r.get("status", "failed")
        counts[status] = counts.get(status, 0) + 1
        cycle = f"{r.get('month', '?')} {r.get('year', '?')}"
        print(f"  {path.name}: [{r['status']}] {cycle} — {r.get('detail', '')}")

    summary = {
        "exam_code": exam_code,
        "folder": str(folder),
        "dry_run": dry_run,
        "counts": counts,
        "results": results,
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nWrote report -> {report_path}")
    print(f"Counts: {counts}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest manual POS PDFs")
    parser.add_argument("exam_code", help="Exam code e.g. CELE")
    parser.add_argument("folder", type=Path, help="Folder containing PDFs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--text-only",
        action="store_true",
        help="Skip scanned/image PDFs; ingest only files with a text layer",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("output/cele_manual_ingest_report.json"),
    )
    args = parser.parse_args()

    if not args.dry_run and (not db.SUPABASE_URL or not db.SERVICE_KEY):
        print("SUPABASE env not configured")
        sys.exit(1)

    exam_code = resolve_exam_code(args.exam_code)
    if not exam_code:
        print(f"Unknown exam code: {args.exam_code}")
        sys.exit(1)
    if not args.folder.is_dir():
        print(f"Folder not found: {args.folder}")
        sys.exit(1)

    run_folder(
        exam_code,
        args.folder,
        dry_run=args.dry_run,
        text_only=args.text_only,
        report_path=args.report,
    )


if __name__ == "__main__":
    main()
