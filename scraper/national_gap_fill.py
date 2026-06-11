#!/usr/bin/env python3
"""
On-demand national pass-rate gap fill.

Discovers missing exam cycles via prc.gov.ph, prcboard direct URLs, and WP search,
then ingests national stats (HTML → PDF → DeepSeek image fallback).

Usage:
  python national_gap_fill.py AgriLE 2015 2026
  python national_gap_fill.py AgriLE 2015 2026 --dry-run
  python national_gap_fill.py --all 2015 2026
"""

from __future__ import annotations

import argparse
import sys
import time

import httpx
from pathlib import Path
from urllib.parse import urljoin

import db
from collect_national_links import (
    EXTRA_WP_QUERIES,
    ALL_CALENDAR_MONTHS,
    add_row,
    direct_result_urls,
    is_main_results_page,
    merge_into_index,
    probe_url,
)
from collect_drive_links import HEADERS, SITE, WP_PAUSE, parse_year_month, post_title, wp_search_all
from national_extract import extract_stats_from_url, get_date, get_summary
from national_validate import (
    exam_inference_score,
    infer_exam_from_content,
    probe_url_for_exam,
    should_overwrite,
    validate_row,
    validate_stats,
)
from prc_gov_ph import (
    PRC_SITE,
    discover_articles,
    fetch_html,
    parse_month_year,
)
from programs import ALL_CODES, EXAM_CYCLES, PROGRAMS_DICT, resolve_exam_code

PAUSE = 1.0


def _has_stats(exam_code: str, year: int) -> bool:
    """True if DB has at least one cycle with real stats for this program/year."""
    rows = db.list_exam_cycles(exam_code, year, year)
    return any((r.get("total_takers") or 0) > 0 for r in rows)


def _years_needing_fill(
    exam_code: str,
    start_year: int,
    end_year: int,
) -> list[int]:
    """Years with no real national stats in DB."""
    return [y for y in range(start_year, end_year + 1) if not _has_stats(exam_code, y)]


def _discover_prc_for_year(exam_code: str, year: int) -> list[dict]:
    """Find prc.gov.ph result articles for one program/year."""
    found: list[dict] = []
    articles = discover_articles(exam_code, year)
    for article in articles:
        title = article["title"]
        url = article["url"]
        if not url.startswith("http"):
            url = urljoin(PRC_SITE, url)
        month = article.get("month") or parse_month_year(title, url)[0]
        if not month:
            continue
        found.append({
            "exam_code": exam_code,
            "year": year,
            "month": month,
            "url": url,
            "source": "prc.gov.ph",
            "discovered_via": "gap_prc_search",
            "title": title,
        })
    return found


def _discover_direct_for_year(exam_code: str, year: int) -> list[dict]:
    """Probe prcboard direct URLs — typical months first, then all calendar months."""
    found: list[dict] = []
    typical = EXAM_CYCLES.get(exam_code, ["March", "June", "September", "December"])
    extra = [m for m in ALL_CALENDAR_MONTHS if m not in typical]
    for month_group in (typical, extra):
        for month in month_group:
            for url in direct_result_urls(exam_code, year, month):
                if not probe_url(url):
                    time.sleep(0.15)
                    continue
                matched, page_title = probe_url_for_exam(url, exam_code)
                if matched:
                    found.append({
                        "exam_code": exam_code,
                        "year": year,
                        "month": month,
                        "url": url,
                        "source": "prcboard.com/direct",
                        "discovered_via": "gap_direct_url",
                        "title": page_title,
                    })
                    return found
                time.sleep(0.2)
        if found:
            break
    return found


def _discover_wp_for_year(exam_code: str, year: int) -> list[dict]:
    """WordPress search scoped to one year."""
    prog = PROGRAMS_DICT[exam_code]
    slug = prog["prcboard_slug"]
    kw = prog["keywords"][0] if prog["keywords"] else slug
    queries = [
        f"{slug} results {year} list of passers",
        f"{kw} results {year}",
        f"{exam_code} results {year}",
        *[f"{q} {year}" for q in EXTRA_WP_QUERIES.get(exam_code, [])],
    ]
    found: list[dict] = []
    seen_urls: set[str] = set()
    for q in queries:
        posts = wp_search_all(q, max_pages=8)
        for post in posts:
            url = post.get("link", "")
            title = post_title(post)
            if not url or url in seen_urls:
                continue
            if not is_main_results_page(url, title):
                continue
            y, month = parse_year_month(url, title)
            if y != year:
                continue
            inferred = infer_exam_from_content(url, title)
            score = exam_inference_score(url, title, exam_code)
            if inferred != exam_code or score < 5:
                continue
            seen_urls.add(url)
            found.append({
                "exam_code": exam_code,
                "year": year,
                "month": month,
                "url": url,
                "source": "prcboard.com",
                "discovered_via": "gap_wp_search",
                "post_id": post.get("id"),
                "title": title,
            })
        time.sleep(WP_PAUSE)
    return found


def discover_gap_candidates(
    exam_code: str,
    start_year: int,
    end_year: int,
) -> list[dict]:
    """Collect candidate URLs for years missing national stats."""
    candidates: dict[tuple, dict] = {}
    target_years = _years_needing_fill(exam_code, start_year, end_year)
    if not target_years:
        return []

    print(f"  Gap years for {exam_code}: {target_years}")

    for year in target_years:
        for row in (
            _discover_prc_for_year(exam_code, year)
            + _discover_direct_for_year(exam_code, year)
            + _discover_wp_for_year(exam_code, year)
        ):
            key = (row["exam_code"], row.get("month"), row["year"])
            existing = candidates.get(key)
            if not existing:
                candidates[key] = row
                continue
            from national_validate import SOURCE_PRIORITY
            if SOURCE_PRIORITY.get(row["source"], 0) > SOURCE_PRIORITY.get(existing["source"], 0):
                candidates[key] = row
        time.sleep(PAUSE)

    return sorted(candidates.values(), key=lambda r: (r["year"], r.get("month") or ""))


def try_ingest_candidate(row: dict, *, dry_run: bool = False) -> tuple[str, str]:
    """Fetch, extract stats, validate, and upsert one candidate row."""
    url = row["url"]
    title = row.get("title") or ""

    stats, text = extract_stats_from_url(url)
    if not stats and title:
        try:
            html = fetch_html(url)
            from national_extract import extract_stats_from_html
            stats = extract_stats_from_html(html, url)
            text = html
        except Exception:
            pass

    if not stats:
        return "skipped", "no summary stats"

    date = get_date(title or url, text if isinstance(text, str) else "")
    page_title = title or url
    body = text if isinstance(text, str) else ""
    parsed_exam = infer_exam_from_content(url, page_title, body)
    score = exam_inference_score(
        f"{url} {page_title} {body[:800]}", "", row["exam_code"]
    )

    ok, month_or_reason = validate_row(
        row,
        title=page_title,
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
        return "saved", (
            f"dry-run {stats['total_passers']}/{stats['total_takers']} "
            f"({stats['pass_rate']}%) {month} {row['year']}"
        )

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
        "mode": "national_gap_fill",
    })
    return "saved", (
        f"{stats['total_passers']:,}/{stats['total_takers']:,} "
        f"({stats['pass_rate']}%) {month} {row['year']} [{source}]"
    )


def fill_gaps_for_program(
    exam_code: str,
    start_year: int,
    end_year: int,
    *,
    dry_run: bool = False,
    index_path: Path | None = None,
) -> dict:
    """Discover and ingest missing national stats for one program."""
    print(f"\n{'=' * 55}")
    print(f"  Gap fill: {exam_code} {start_year}–{end_year}")
    print(f"{'=' * 55}")

    candidates = discover_gap_candidates(exam_code, start_year, end_year)
    if not candidates:
        print("  No gap candidates found (all years have stats or nothing discoverable).")
        return {"saved": 0, "skipped": 0, "failed": 0}

    print(f"  Found {len(candidates)} candidate URL(s)\n")

    counts = {"saved": 0, "skipped": 0, "failed": 0}
    saved_rows: list[dict] = []

    for i, row in enumerate(candidates, 1):
        try:
            status, detail = try_ingest_candidate(row, dry_run=dry_run)
        except Exception as exc:
            status, detail = "failed", str(exc)
        counts[status] = counts.get(status, 0) + 1
        if status == "saved":
            saved_rows.append(row)
        prefix = {"saved": "+", "skipped": "-", "failed": "x"}.get(status, "?")
        print(f"  [{i}/{len(candidates)}] {prefix} {row['exam_code']} "
              f"{row.get('month', '?')} {row['year']}: {detail}")
        time.sleep(PAUSE)

    if saved_rows and index_path and not dry_run:
        merge_into_index(saved_rows, index_path)
        print(f"  Merged {len(saved_rows)} row(s) into {index_path}")

    return counts


def fill_gaps_batch(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
    *,
    dry_run: bool = False,
    index_path: Path | None = None,
) -> dict:
    totals = {"saved": 0, "skipped": 0, "failed": 0}
    for code in exam_codes:
        try:
            counts = fill_gaps_for_program(
                code, start_year, end_year, dry_run=dry_run, index_path=index_path,
            )
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError, OSError) as exc:
            print(f"  ! {code}: Supabase/network error ({exc}); skipping program")
            totals["failed"] += 1
            continue
        for k, v in counts.items():
            totals[k] = totals.get(k, 0) + v
    return totals


def _resolve_year_range(args: argparse.Namespace) -> tuple[int, int]:
    """
    Positional years after --all map oddly (exam_code=2015, start_year=2026).
    national_gap_fill.py --all 2015 2026  -> 2015..2026
    national_gap_fill.py AgriLE 2015 2026 -> 2015..2026
    """
    if args.all and args.exam_code and str(args.exam_code).isdigit():
        start = int(args.exam_code)
        end = args.start_year if args.start_year is not None else 2026
        return start, end
    start = args.start_year if args.start_year is not None else 2015
    end = args.end_year if args.end_year is not None else 2026
    return start, end


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill national pass-rate gaps on demand")
    parser.add_argument("exam_code", nargs="?", help="Exam code e.g. AgriLE, or --all")
    parser.add_argument("start_year", nargs="?", type=int, default=2015)
    parser.add_argument("end_year", nargs="?", type=int, default=2026)
    parser.add_argument("--all", action="store_true", help="All 16 programs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--index", default="output/national_links.json")
    args = parser.parse_args()

    if args.all:
        codes = ALL_CODES
    elif args.exam_code:
        code = resolve_exam_code(args.exam_code)
        if not code:
            print(f"Unknown exam code: {args.exam_code}", file=sys.stderr)
            sys.exit(1)
        codes = [code]
    else:
        parser.print_help()
        sys.exit(1)

    start_year, end_year = _resolve_year_range(args)
    index_path = Path(args.index)
    totals = fill_gaps_batch(
        codes,
        start_year,
        end_year,
        dry_run=args.dry_run,
        index_path=index_path if index_path.parent.exists() or not args.dry_run else None,
    )
    print(f"\nDone: {totals}")


if __name__ == "__main__":
    main()
