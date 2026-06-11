#!/usr/bin/env python3
"""
Ingest per-school performance from CSV or XLSX (manual export for scanned POS PDFs).

Expected columns (header names are flexible):
  rank, school, takers, passers, pass_rate

Usage:
  python ingest_manual_schools_csv.py CELE May 2019 input/CELE_May_2019.xlsx
  python ingest_manual_schools_csv.py CELE May 2019 input/CELE_May_2019.csv --dry-run
  python ingest_manual_schools_csv.py CELE --folder input/cele_schools_csv
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

import db
from ingest_manual_pos import DRIVE_FOLDER_URL, filter_schools
from normalize import infer_region
from programs import resolve_exam_code

SOURCE_TAG = "manual://user-csv-schools"

COL_ALIASES = {
    "rank": ("rank", "ranking", "#"),
    "school": ("school", "school_name", "name", "institution"),
    "takers": ("takers", "no_of_examinees", "examinees", "no_examinees"),
    "passers": ("passers", "no_of_passers", "passed", "no_passers"),
    "pass_rate": ("pass_rate", "passing_rate", "rate", "percentage", "%"),
}


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", h.strip().lower()).strip("_")


def _map_columns(fieldnames: list[str] | None) -> dict[str, str]:
    if not fieldnames:
        raise ValueError("File has no header row")
    normalized = {_norm_header(f): f for f in fieldnames}
    mapping: dict[str, str] = {}
    for canonical, aliases in COL_ALIASES.items():
        for alias in aliases:
            key = _norm_header(alias)
            if key in normalized:
                mapping[canonical] = normalized[key]
                break
    missing = [k for k in COL_ALIASES if k not in mapping]
    if missing:
        raise ValueError(
            f"Missing required columns {missing}. Found: {list(fieldnames)}"
        )
    return mapping


def _to_int(v) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _to_float(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace("%", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def load_rows(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            col_map = _map_columns(reader.fieldnames)
            rows: list[dict] = []
            for raw in reader:
                school = str(raw.get(col_map["school"], "")).strip()
                if not school:
                    continue
                rows.append({
                    "rank": _to_int(raw.get(col_map["rank"])),
                    "school": school,
                    "takers": _to_int(raw.get(col_map["takers"])),
                    "passers": _to_int(raw.get(col_map["passers"])),
                    "pass_rate": _to_float(raw.get(col_map["pass_rate"])),
                    "region": infer_region(school),
                })
            return rows

    if suffix in (".xlsx", ".xls"):
        try:
            import pandas as pd
        except ImportError as exc:
            raise RuntimeError("pandas required for Excel files") from exc
        df = pd.read_excel(path, dtype=str)
        col_map = _map_columns(list(df.columns))
        rows = []
        for _, raw in df.iterrows():
            school = str(raw.get(col_map["school"], "")).strip()
            if not school or school.lower() == "nan":
                continue
            rows.append({
                "rank": _to_int(raw.get(col_map["rank"])),
                "school": school,
                "takers": _to_int(raw.get(col_map["takers"])),
                "passers": _to_int(raw.get(col_map["passers"])),
                "pass_rate": _to_float(raw.get(col_map["pass_rate"])),
                "region": infer_region(school),
            })
        return rows

    raise ValueError(f"Unsupported file type: {suffix}")


def parse_cycle_from_filename(path: Path) -> tuple[str, int] | None:
    """CELE_May_2019.xlsx -> (May, 2019)"""
    m = re.match(
        r"(?i)^(?:cele_)?(march|may|nov|november|april)_(\d{4})(?:\.(?:csv|xlsx|xls))?$",
        path.stem,
    )
    if not m:
        return None
    month_map = {
        "march": "March",
        "may": "May",
        "nov": "November",
        "november": "November",
        "april": "April",
    }
    month = month_map.get(m.group(1).lower())
    if not month:
        return None
    return month, int(m.group(2))


def ingest_file(
    exam_code: str,
    month: str,
    year: int,
    path: Path,
    *,
    dry_run: bool,
) -> dict:
    schools = load_rows(path)
    schools, warnings = filter_schools(schools)
    for i, row in enumerate(schools, start=1):
        if not row.get("rank"):
            row["rank"] = i

    result = {
        "file": path.name,
        "month": month,
        "year": year,
        "schools_parsed": len(schools),
        "warnings": warnings[:10],
    }

    if not schools:
        result["status"] = "failed"
        result["detail"] = "no valid school rows"
        return result

    if dry_run:
        result["status"] = "dry-run"
        result["detail"] = f"would save {len(schools)} schools"
        return result

    existing = db.get_exam_result(exam_code, month, year)
    if existing and (existing.get("total_takers") or 0) > 0:
        eid = existing["id"]
    elif existing:
        eid = existing["id"]
    else:
        placeholder = {"total_passers": 0, "total_takers": 0, "pass_rate": 0.0}
        eid = db.upsert_exam_result(exam_code, month, year, placeholder, SOURCE_TAG)

    job_id = db.start_import_job(exam_code, year)
    try:
        source_url = f"{DRIVE_FOLDER_URL}#csv:{path.name}"
        saved = db.upsert_school_performance(eid, schools)
        db.audit("import", "exam_results", eid, {
            "exam_code": exam_code,
            "month": month,
            "year": year,
            "source": "manual_csv_schools",
            "file": path.name,
            "schools_saved": saved,
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
            result["detail"] = f"saved {saved} schools (national unchanged)"
    except Exception as exc:
        db.finish_import_job(job_id, "failed", 0, str(exc))
        result["status"] = "failed"
        result["detail"] = str(exc)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest manual school performance CSV/XLSX")
    parser.add_argument("exam_code", help="Exam code e.g. CELE")
    parser.add_argument("month", nargs="?", help="Cycle month e.g. May")
    parser.add_argument("year", nargs="?", type=int, help="Cycle year e.g. 2019")
    parser.add_argument("file", nargs="?", type=Path, help="CSV or XLSX file")
    parser.add_argument("--folder", type=Path, help="Ingest all CSV/XLSX in folder")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and (not db.SUPABASE_URL or not db.SERVICE_KEY):
        print("SUPABASE env not configured")
        sys.exit(1)

    exam_code = resolve_exam_code(args.exam_code)
    if not exam_code:
        print(f"Unknown exam code: {args.exam_code}")
        sys.exit(1)

    if args.folder:
        if not args.folder.is_dir():
            print(f"Folder not found: {args.folder}")
            sys.exit(1)
        files = sorted(
            p for p in args.folder.iterdir()
            if p.suffix.lower() in (".csv", ".xlsx", ".xls")
        )
        if not files:
            print(f"No CSV/XLSX files in {args.folder}")
            sys.exit(1)
        counts: dict[str, int] = {}
        for path in files:
            parsed = parse_cycle_from_filename(path)
            if not parsed:
                print(f"  skip {path.name}: cannot parse cycle from filename")
                counts["skipped"] = counts.get("skipped", 0) + 1
                continue
            month, year = parsed
            r = ingest_file(exam_code, month, year, path, dry_run=args.dry_run)
            counts[r["status"]] = counts.get(r["status"], 0) + 1
            print(f"  {path.name}: [{r['status']}] {month} {year} — {r.get('detail', '')}")
        print(f"\nCounts: {counts}")
        return

    if not args.month or args.year is None or not args.file:
        parser.error("Provide month year file, or use --folder")

    if not args.file.is_file():
        print(f"File not found: {args.file}")
        sys.exit(1)

    r = ingest_file(exam_code, args.month, args.year, args.file, dry_run=args.dry_run)
    print(f"{args.file.name}: [{r['status']}] {args.month} {args.year} — {r.get('detail', '')}")
    if r["status"] == "failed":
        sys.exit(1)


if __name__ == "__main__":
    main()
