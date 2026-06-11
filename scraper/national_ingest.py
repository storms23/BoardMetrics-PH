#!/usr/bin/env python3
"""
Phase 2 — ingest national pass rates from national_links.json (or fill DB gaps).

Usage:
  python national_ingest.py --from-index output/national_links.json
  python national_ingest.py --fill-gaps 2015 2026
  python national_ingest.py --fill-gaps 2025 2026 CELE
  python national_ingest.py --dry-run --from-index output/national_links.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

import db
from national_extract import extract_stats_from_url, get_date
from national_validate import (
    exam_inference_score,
    infer_exam_from_content,
    should_overwrite,
    validate_row,
)
from programs import ALL_CODES, resolve_exam_code

PAUSE = 1.0


def load_index(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("index must be a JSON array")
    return data


def ingest_row(row: dict, *, dry_run: bool = False) -> tuple[str, str]:
    """Returns (status, detail) — status: saved | skipped | failed."""
    url = row["url"]
    title = row.get("title") or ""

    try:
        stats, text = extract_stats_from_url(url)
        if not stats:
            return "skipped", "no summary stats"
    except Exception as exc:
        return "failed", str(exc)

    date = get_date(title or url, text)
    page_title = title or url
    parsed_exam = infer_exam_from_content(url, page_title, text)
    score = exam_inference_score(
        f"{url} {page_title} {text[:800]}", "", row["exam_code"]
    )

    ok, month_or_reason = validate_row(
        row,
        title=title or url,
        url=url,
        parsed_year=date["year"] or row["year"],
        parsed_month=date["month"] or row.get("month"),
        parsed_exam=parsed_exam,
        exam_score=score,
        stats=stats,
    )
    if not ok:
        return "skipped", month_or_reason

    month = month_or_reason
    source = row.get("source", "unknown")

    if dry_run:
        return "saved", f"dry-run {stats['total_passers']}/{stats['total_takers']} {month} {row['year']}"

    existing = db.get_exam_result(row["exam_code"], month, row["year"])
    if existing and not should_overwrite(
        existing.get("source_url"),
        source,
        existing,
        stats,
    ):
        return "skipped", "existing official row (no overwrite)"

    eid = db.upsert_exam_result(row["exam_code"], month, row["year"], stats, url)
    db.audit("import", "exam_results", eid, {
        "exam_code": row["exam_code"],
        "year": row["year"],
        "month": month,
        "source": source,
        "mode": "national_index",
    })
    return "saved", (
        f"{stats['total_passers']:,}/{stats['total_takers']:,} "
        f"({stats['pass_rate']}%) {month} {row['year']} [{source}]"
    )


def ingest_index(path: Path, *, dry_run: bool = False, exam_filter: str | None = None) -> dict:
    rows = load_index(path)
    if exam_filter:
        rows = [r for r in rows if r["exam_code"] == exam_filter]

    counts = {"saved": 0, "skipped": 0, "failed": 0}
    print(f"\nIngesting {len(rows)} index rows from {path}\n")

    current_group: tuple[str, int] | None = None
    job_id: int | None = None
    group_saved = 0

    for i, row in enumerate(rows, 1):
        group = (row["exam_code"], row["year"])
        if group != current_group and not dry_run:
            if job_id is not None:
                db.finish_import_job(job_id, "success", group_saved)
            group_saved = 0
            try:
                job_id = db.start_import_job(row["exam_code"], row["year"])
            except Exception:
                job_id = None
            current_group = group

        try:
            status, detail = ingest_row(row, dry_run=dry_run)
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError, OSError) as exc:
            status, detail = "failed", f"Supabase/network error: {exc}"
        counts[status] = counts.get(status, 0) + 1
        if status == "saved":
            group_saved += 1
        prefix = {"saved": "+", "skipped": "-", "failed": "x"}.get(status, "?")
        print(f"  [{i}/{len(rows)}] {prefix} {row['exam_code']} {row.get('month', '?')} {row['year']}: {detail}")
        time.sleep(PAUSE)

    if job_id is not None and not dry_run:
        db.finish_import_job(job_id, "success", group_saved)

    return counts


def fill_gaps(
    start_year: int,
    end_year: int,
    exam_codes: list[str],
    index_path: Path,
    *,
    dry_run: bool = False,
) -> dict:
    """On-demand discovery + ingest for years missing national stats."""
    from national_gap_fill import fill_gaps_batch

    if not index_path.is_file():
        print(f"Index not found: {index_path}. Run collect_national_links.py first.", file=sys.stderr)
        sys.exit(1)

    return fill_gaps_batch(
        exam_codes,
        start_year,
        end_year,
        dry_run=dry_run,
        index_path=index_path,
    )


def ingest_program_year(exam_code: str, year: int, index_path: Path | None = None) -> int:
    """Ingest national stats for one program/year (scraper.py --national CELE 2025)."""
    path = index_path or Path("output/national_links.json")
    if not path.is_file():
        import collect_national_links

        print(f"  Building index for {exam_code} {year} …")
        rows = collect_national_links.collect_index(year, year, [exam_code])
        collect_national_links.write_outputs(rows, path.parent)

    filtered = [
        r for r in load_index(path)
        if r["exam_code"] == exam_code and int(r["year"]) == year
    ]
    if not filtered:
        print(f"  No index rows for {exam_code} {year}")
        return 0

    tmp = path.parent / f"_national_{exam_code}_{year}.json"
    tmp.write_text(json.dumps(filtered, indent=2), encoding="utf-8")
    try:
        counts = ingest_index(tmp)
    finally:
        tmp.unlink(missing_ok=True)
    return counts.get("saved", 0)


def run_batch_national(start_year: int, end_year: int, exam_codes: list[str]) -> None:
    """Build index if needed, then ingest all rows for a year range."""
    import collect_national_links

    out_dir = Path("output")
    index_path = out_dir / "national_links.json"
    if not index_path.is_file():
        print(f"Building national index {start_year}–{end_year} …")
        rows = collect_national_links.collect_index(start_year, end_year, exam_codes)
        collect_national_links.write_outputs(rows, out_dir)
    else:
        print(f"Using existing index: {index_path}")

    counts = ingest_index(index_path)
    print(f"Batch ingest: {counts}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest national pass rates from index")
    parser.add_argument("--from-index", metavar="PATH", help="Ingest all rows from JSON index")
    parser.add_argument("--fill-gaps", nargs="*", metavar="ARG", help="start_year end_year [exam_code]")
    parser.add_argument("--dry-run", action="store_true", help="Validate only, no DB writes")
    parser.add_argument("--index", default="output/national_links.json", help="Index path for --fill-gaps")
    args = parser.parse_args()

    if args.from_index:
        path = Path(args.from_index)
        if not path.is_file():
            print(f"Index not found: {path}", file=sys.stderr)
            sys.exit(1)
        counts = ingest_index(path, dry_run=args.dry_run)
        print(f"\nDone: {counts}")
        return

    if args.fill_gaps is not None:
        if len(args.fill_gaps) < 2:
            print("Usage: --fill-gaps START_YEAR END_YEAR [EXAM_CODE]", file=sys.stderr)
            sys.exit(1)
        start, end = int(args.fill_gaps[0]), int(args.fill_gaps[1])
        codes = ALL_CODES
        if len(args.fill_gaps) >= 3:
            code = resolve_exam_code(args.fill_gaps[2])
            if not code:
                print(f"Unknown exam code: {args.fill_gaps[2]}", file=sys.stderr)
                sys.exit(1)
            codes = [code]
        counts = fill_gaps(start, end, codes, Path(args.index), dry_run=args.dry_run)
        print(f"\nDone: {counts}")
        return

    parser.print_help()
    sys.exit(1)


if __name__ == "__main__":
    main()
