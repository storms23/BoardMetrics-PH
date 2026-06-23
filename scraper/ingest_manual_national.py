#!/usr/bin/env python3
"""
Ingest national pass-rate rows from a CSV file (manual / user-provided).

CSV columns: exam_code, month, year, total_passers, total_takers, pass_rate
Optional: source_url (defaults to manual://user-csv-national)

Usage:
  python ingest_manual_national.py input/cele_national.csv
  python ingest_manual_national.py input/cele_national.csv --dry-run
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import db
from national_validate import validate_stats
from programs import resolve_exam_code

SOURCE_TAG = "manual://user-csv-national"


def load_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        required = {"exam_code", "month", "year", "total_passers", "total_takers", "pass_rate"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"CSV must include columns: {sorted(required)}")
        return list(reader)


def ingest(path: Path, *, dry_run: bool) -> None:
    rows = load_rows(path)
    saved = skipped = 0

    for raw in rows:
        exam_code = resolve_exam_code(raw["exam_code"].strip())
        if not exam_code:
            print(f"  skip unknown exam_code: {raw['exam_code']}")
            skipped += 1
            continue

        month = raw["month"].strip()
        year = int(raw["year"])
        stats = {
            "total_passers": int(str(raw["total_passers"]).replace(",", "")),
            "total_takers": int(str(raw["total_takers"]).replace(",", "")),
            "pass_rate": float(str(raw["pass_rate"]).replace("%", "")),
        }
        ok, reason = validate_stats(stats)
        label = f"{exam_code} {month} {year}"
        if not ok:
            print(f"  skip {label}: {reason}")
            skipped += 1
            continue

        if dry_run:
            print(f"  [dry-run] {label}: {stats['total_passers']:,}/{stats['total_takers']:,} ({stats['pass_rate']}%)")
            saved += 1
            continue

        eid = db.upsert_exam_result(
            exam_code,
            month,
            year,
            stats,
            (raw.get("source_url") or "").strip() or SOURCE_TAG,
            force=True,
        )
        db.audit("import", "exam_results", eid, {
            "exam_code": exam_code,
            "month": month,
            "year": year,
            "source": "manual_csv",
            "file": str(path),
        })
        print(f"  saved {label}: {stats['total_passers']:,}/{stats['total_takers']:,} ({stats['pass_rate']}%)")
        saved += 1

    print(f"\n{'Would save' if dry_run else 'Saved'} {saved} row(s), skipped {skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest manual national stats CSV")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.csv_path.is_file():
        print(f"File not found: {args.csv_path}")
        sys.exit(1)
    if not args.dry_run and (not db.SUPABASE_URL or not db.SERVICE_KEY):
        print("SUPABASE env not configured")
        sys.exit(1)

    ingest(args.csv_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
