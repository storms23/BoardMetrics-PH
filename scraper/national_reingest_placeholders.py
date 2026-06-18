#!/usr/bin/env python3
"""
Re-ingest national stats for placeholder exam_results rows (total_takers=0).

Tries the stored source_url, then prc.gov.ph discovery for the same cycle.
LET-E / LET-S share one PRC announcement — both are updated from one URL.

Usage:
  python national_reingest_placeholders.py LET-E LET-S MTLE PSY REE 2015 2026
  python national_reingest_placeholders.py --all 2015 2026
  python national_reingest_placeholders.py MTLE 2025 2025 --dry-run
"""

from __future__ import annotations

import argparse
import sys
import time
from urllib.parse import urljoin

import db
from national_extract import extract_let_dual_from_url, extract_stats_from_url, get_date
from national_gap_fill import try_ingest_candidate
from national_validate import validate_stats
from prc_gov_ph import PRC_SITE, discover_articles, fetch_html, prc_search
from programs import ALL_CODES, resolve_exam_code

PAUSE = 1.0
LET_CODES = {"LET-E", "LET-S"}


def _abs_url(url: str) -> str:
    if url.startswith("http"):
        return url
    return urljoin(PRC_SITE, url)


def _discover_prc_url(exam_code: str, year: int, month: str | None) -> str | None:
    for article in discover_articles(exam_code, year):
        am = article.get("month")
        if month and am and am.lower() != month.lower():
            continue
        title = (article.get("title") or "").lower()
        if month and month.lower() not in title and am != month:
            continue
        return _abs_url(article["url"])

    from programs import PROGRAMS_DICT

    kw = PROGRAMS_DICT[exam_code]["keywords"][0]
    query = f"{month or ''} {year} {kw} results released".strip()
    for hit in prc_search(query, max_pages=2):
        title = hit.get("title", "")
        if str(year) not in title:
            continue
        if month and month.lower() not in title.lower():
            continue
        return _abs_url(hit.get("url", ""))
    return None


def _discover_let_url(year: int, month: str | None) -> str | None:
    query = f"{month or ''} {year} Licensure Examination for Professional Teachers results"
    for hit in prc_search(query.strip(), max_pages=2):
        title = hit.get("title", "")
        if str(year) not in title:
            continue
        if month and month.lower() not in title.lower():
            continue
        if "professional teacher" not in title.lower():
            continue
        return _abs_url(hit.get("url", ""))
    return None


def _upsert_stats(
    exam_code: str,
    month: str,
    year: int,
    stats: dict,
    url: str,
    *,
    dry_run: bool,
) -> tuple[str, str]:
    ok, reason = validate_stats(stats)
    if not ok:
        return "skipped", reason

    if dry_run:
        return "saved", (
            f"dry-run {stats['total_passers']:,}/{stats['total_takers']:,} "
            f"({stats['pass_rate']}%)"
        )

    eid = db.upsert_exam_result(exam_code, month, year, stats, url)
    db.audit("import", "exam_results", eid, {
        "exam_code": exam_code,
        "year": year,
        "month": month,
        "mode": "national_reingest_placeholders",
        "source_url": url,
    })
    return "saved", (
        f"{stats['total_passers']:,}/{stats['total_takers']:,} ({stats['pass_rate']}%)"
    )


def fill_let_missing_cycles(
    start_year: int,
    end_year: int,
    *,
    dry_run: bool = False,
) -> dict:
    """Discover and ingest LET-E / LET-S cycles missing from the DB."""
    from programs import EXAM_CYCLES

    months = EXAM_CYCLES["LET-E"]
    counts = {"saved": 0, "skipped": 0, "failed": 0}

    for year in range(start_year, end_year + 1):
        for month in months:
            has_e = db.get_exam_result("LET-E", month, year)
            has_s = db.get_exam_result("LET-S", month, year)
            if (
                has_e and (has_e.get("total_takers") or 0) > 0
                and has_s and (has_s.get("total_takers") or 0) > 0
            ):
                continue

            url = _discover_let_url(year, month)
            if not url:
                print(f"  x LET {month} {year}: no prc.gov.ph article found")
                counts["failed"] += 1
                continue

            dual, text = extract_let_dual_from_url(url)
            if not dual:
                print(f"  x LET {month} {year}: dual stats not parsed")
                counts["failed"] += 1
                continue

            date = get_date("", text)
            month_final = month or date.get("month")
            if not month_final:
                counts["skipped"] += 1
                continue

            for code, stats in dual.items():
                status, detail = _upsert_stats(
                    code, month_final, year, stats, url, dry_run=dry_run,
                )
                counts[status] = counts.get(status, 0) + 1
                prefix = {"saved": "+", "skipped": "-", "failed": "x"}.get(status, "?")
                print(f"  {prefix} {code} {month_final} {year}: {detail}")
            time.sleep(PAUSE)

    return counts


def reingest_let_placeholders(
    placeholders: list[dict],
    *,
    dry_run: bool = False,
) -> dict:
    """Group LET placeholders by (year, month) and ingest from one PRC article."""
    groups: dict[tuple[int, str | None], list[dict]] = {}
    for row in placeholders:
        if row["exam_code"] not in LET_CODES:
            continue
        key = (row["year"], row.get("month"))
        groups.setdefault(key, []).append(row)

    counts = {"saved": 0, "skipped": 0, "failed": 0}
    for (year, month), _rows in sorted(groups.items()):
        url = _discover_let_url(year, month)
        if not url:
            print(f"  x LET {month} {year}: no prc.gov.ph article found")
            counts["failed"] += 1
            continue

        dual, text = extract_let_dual_from_url(url)
        if not dual:
            print(f"  x LET {month} {year}: dual stats not parsed from {url[:60]}")
            counts["failed"] += 1
            continue

        date = get_date("", text)
        month_final = month or date.get("month")
        if not month_final:
            counts["skipped"] += 1
            print(f"  - LET {year}: could not infer month")
            continue

        for code, stats in dual.items():
            status, detail = _upsert_stats(
                code, month_final, year, stats, url, dry_run=dry_run,
            )
            counts[status] = counts.get(status, 0) + 1
            prefix = {"saved": "+", "skipped": "-", "failed": "x"}.get(status, "?")
            print(f"  {prefix} {code} {month_final} {year}: {detail}")
        time.sleep(PAUSE)

    return counts


def reingest_placeholder_row(row: dict, *, dry_run: bool = False) -> tuple[str, str]:
    exam_code = row["exam_code"]
    year = row["year"]
    month = row.get("month")
    source = row.get("source_url") or ""

    stats = None
    url = source
    text = ""

    if source:
        stats, text = extract_stats_from_url(source)

    if not stats:
        official = _discover_prc_url(exam_code, year, month)
        if official:
            url = official
            stats, text = extract_stats_from_url(official)

    if not stats:
        return "failed", "no summary stats (dead mirror or undiscovered official URL)"

    candidate = {
        "exam_code": exam_code,
        "year": year,
        "month": month,
        "url": url,
        "source": "prc.gov.ph" if "prc.gov.ph" in url else "prcboard.com",
        "title": text[:200] if text else "",
    }
    return try_ingest_candidate(candidate, dry_run=dry_run)


def reingest_placeholders(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
    *,
    dry_run: bool = False,
) -> dict:
    placeholders = db.list_placeholder_cycles(exam_codes, start_year, end_year)
    let_rows = [r for r in placeholders if r["exam_code"] in LET_CODES]
    other_rows = [r for r in placeholders if r["exam_code"] not in LET_CODES]

    print(f"\nFound {len(placeholders)} placeholder row(s) "
          f"({len(let_rows)} LET, {len(other_rows)} other)\n")

    totals = {"saved": 0, "skipped": 0, "failed": 0}

    if let_rows:
        print("-- LET (dual elementary + secondary) --")
        let_counts = reingest_let_placeholders(let_rows, dry_run=dry_run)
        for k, v in let_counts.items():
            totals[k] = totals.get(k, 0) + v

    if other_rows:
        print("\n-- Other programs --")
        for i, row in enumerate(other_rows, 1):
            try:
                status, detail = reingest_placeholder_row(row, dry_run=dry_run)
            except Exception as exc:
                status, detail = "failed", str(exc)
            totals[status] = totals.get(status, 0) + 1
            prefix = {"saved": "+", "skipped": "-", "failed": "x"}.get(status, "?")
            print(
                f"  [{i}/{len(other_rows)}] {prefix} {row['exam_code']} "
                f"{row.get('month', '?')} {row['year']}: {detail}"
            )
            time.sleep(PAUSE)

    return totals


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-ingest placeholder national rows")
    parser.add_argument(
        "tokens",
        nargs="*",
        help="Exam codes (e.g. LET-E LET-S MTLE) then optional start_year end_year",
    )
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--let-history", action="store_true", help="Backfill missing LET cycles")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.let_history:
        start_year, end_year = 2015, 2026
        if args.tokens:
            nums = [t for t in args.tokens if t.isdigit()]
            if len(nums) >= 2:
                start_year, end_year = int(nums[0]), int(nums[1])
            elif len(nums) == 1:
                start_year = end_year = int(nums[0])
        print(f"\nLET history backfill {start_year}-{end_year}\n")
        totals = fill_let_missing_cycles(start_year, end_year, dry_run=args.dry_run)
        print(f"\nDone: {totals}")
        return

    if args.all:
        codes = ALL_CODES
        start_year, end_year = 2015, 2026
    elif args.tokens:
        nums = [t for t in args.tokens if t.isdigit()]
        raw_codes = [t for t in args.tokens if not t.isdigit()]
        codes = []
        for raw in raw_codes:
            code = resolve_exam_code(raw)
            if not code:
                print(f"Unknown exam code: {raw}", file=sys.stderr)
                sys.exit(1)
            codes.append(code)
        if len(nums) >= 2:
            start_year, end_year = int(nums[0]), int(nums[1])
        elif len(nums) == 1:
            start_year = end_year = int(nums[0])
        else:
            start_year, end_year = 2015, 2026
    else:
        parser.print_help()
        sys.exit(1)

    totals = reingest_placeholders(codes, start_year, end_year, dry_run=args.dry_run)
    print(f"\nDone: {totals}")


if __name__ == "__main__":
    main()
