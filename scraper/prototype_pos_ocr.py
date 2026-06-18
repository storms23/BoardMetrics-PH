#!/usr/bin/env python3
"""
Prototype local OCR on scanned CELE POS PDFs.

Usage:
  python prototype_pos_ocr.py input/cele_pos/MAY_2019_CELE.pdf
  python prototype_pos_ocr.py input/cele_pos/MAY_2019_CELE.pdf --compare-national
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import db
from ingest_manual_pos import filter_schools
from pos_ocr_extract import configure_tesseract, extract_schools_local_ocr


def main() -> None:
    parser = argparse.ArgumentParser(description="Prototype local OCR POS extraction")
    parser.add_argument("pdf", type=Path, help="Path to POS PDF")
    parser.add_argument("--compare-national", action="store_true", help="Compare vs CELE national row in DB")
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--max-pages", type=int, default=0, help="Limit pages (0 = all)")
    parser.add_argument("--report", type=Path, default=Path("output/pos_ocr_prototype.json"))
    args = parser.parse_args()

    if not args.pdf.is_file():
        print(f"File not found: {args.pdf}")
        sys.exit(1)

    tess = configure_tesseract()
    if not tess:
        print("Tesseract not installed.")
        sys.exit(1)
    print(f"Tesseract: {tess}")

    pdf_bytes = args.pdf.read_bytes()
    print(f"PDF: {args.pdf.name} ({len(pdf_bytes):,} bytes)")

    t0 = time.time()
    max_pages = args.max_pages or None
    result = extract_schools_local_ocr(pdf_bytes, dpi=args.dpi, max_pages=max_pages)
    elapsed = time.time() - t0

    schools, warnings = filter_schools(result["schools"])
    total_takers = sum(s["takers"] for s in schools)
    total_passers = sum(s["passers"] for s in schools)

    report = {
        "file": args.pdf.name,
        "method": result["method"],
        "parser": result["parser"],
        "pages_ocrd": result["pages_ocrd"],
        "text_chars": result["text_chars"],
        "schools_raw": len(result["schools"]),
        "schools_valid": len(schools),
        "sum_takers": total_takers,
        "sum_passers": total_passers,
        "elapsed_sec": round(elapsed, 1),
        "warnings": warnings[:10],
        "top_schools": schools[:5],
    }

    if args.compare_national:
        if not db.SUPABASE_URL or not db.SERVICE_KEY:
            print("Supabase not configured — skipping national compare")
        else:
            # Infer cycle from filename if CELE
            import re
            m = re.match(r"(?i)^(march|may|nov|november|april)_(\d{4})_", args.pdf.stem)
            if m:
                month_map = {"march": "March", "may": "May", "nov": "November", "november": "November", "april": "April"}
                month = month_map[m.group(1).lower()]
                year = int(m.group(2))
                nat = db.get_exam_result("CELE", month, year)
                if nat:
                    report["national"] = {
                        "month": month,
                        "year": year,
                        "total_takers": nat.get("total_takers"),
                        "total_passers": nat.get("total_passers"),
                        "pass_rate": nat.get("pass_rate"),
                    }
                    nat_takers = nat.get("total_takers") or 0
                    coverage = round(100 * total_takers / nat_takers, 1) if nat_takers else 0
                    report["taker_coverage_pct"] = coverage
                    print(f"\nNational (DB): {nat.get('total_passers'):,}/{nat_takers:,} ({nat.get('pass_rate')}%)")
                    print(f"School sum takers: {total_takers:,} ({coverage}% of national)")

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"\nMethod: {result['method']} / {result['parser']}")
    print(f"Pages OCR'd: {result['pages_ocrd']} | OCR text: {result['text_chars']:,} chars")
    print(f"Schools: {len(result['schools'])} parsed -> {len(schools)} valid ({elapsed:.1f}s)")
    if schools:
        print("\nTop 5:")
        for s in schools[:5]:
            print(f"  {s.get('rank')}. {s['school'][:50]} — {s['passers']}/{s['takers']} ({s['pass_rate']}%)")
    if warnings:
        print(f"\nWarnings ({len(warnings)}): {warnings[:3]}")
    print(f"\nReport -> {args.report}")


if __name__ == "__main__":
    main()
