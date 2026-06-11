#!/usr/bin/env python3
"""
Build a national pass-rate URL index (2015–2026, all programs).

Phase 1 of the national pipeline: discover main list-of-passers / results pages
once per program, write output/national_links.json for national_ingest.py.

Usage:
  python collect_national_links.py                    # 2015–2026, all programs
  python collect_national_links.py 2025 2026          # year range
  python collect_national_links.py 2025 2026 CELE     # one program
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests

from collect_drive_links import (
    HEADERS,
    PAUSE,
    SITE,
    WP_PAUSE,
    parse_year_month,
    post_title,
    wp_search_all,
)
from national_validate import (
    MIN_EXAM_SCORE,
    SOURCE_PRIORITY,
    exam_inference_score,
    infer_exam_from_content,
    probe_url_for_exam,
    is_excluded_title,
)
from prc_gov_ph import article_matches_exam, parse_month_year, prc_search
from programs import ALL_CODES, EXAM_CYCLES, PROGRAMS_DICT, resolve_exam_code

PRC_SITE = "https://www.prc.gov.ph"

ALL_CALENDAR_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Extra WP queries for programs with sparse or combined-announcement discovery.
EXTRA_WP_QUERIES: dict[str, list[str]] = {
    "LET-E": [
        "let elementary results list of passers",
        "BLEPT elementary results",
        "teachers elementary board exam results",
    ],
    "LET-S": [
        "let secondary results list of passers",
        "BLEPT secondary results",
        "teachers secondary board exam results",
    ],
    "REE": [
        "registered electrical engineer results list of passers",
        "REE RME results",
        "electrical engineer board exam results",
    ],
    "AgriLE": [
        "agriculturist licensure results list of passers",
        "agriculturist board exam results",
        "agriculture licensure examination results",
    ],
    "CELE": [
        "civil engineer results list of passers",
        "civil engineering board exam results",
        "CELE results",
    ],
    "PSY": [
        "psychometrician results list of passers",
        "psychologist licensure results",
        "psychology board exam results",
    ],
    "MTLE": [
        "medical technologist results list of passers",
        "medtech licensure results",
        "medical technology board exam results",
    ],
}


def is_main_results_page(url: str, title: str) -> bool:
    if is_excluded_title(title):
        return False
    u = url.lower()
    t = title.lower()
    if "list of passers" in t or "list-of-passers" in u:
        return True
    if "results" in t and re.search(rf"-results-[a-z]+-20\d{{2}}", u):
        return True
    if re.search(r"results.*20\d{2}", t) and any(
        kw in t for kw in ("examination", "licensure", "board", "passers")
    ):
        return True
    return False


def direct_result_urls(exam_code: str, year: int, month: str) -> list[str]:
    prog = PROGRAMS_DICT[exam_code]
    slug = prog["prcboard_slug"]
    name_slug = (
        prog["exam_name"]
        .lower()
        .replace(" licensure examination", "")
        .replace(" / ", "-")
        .replace(" ", "-")
    )
    ml = month.lower()
    return [
        f"{SITE}/{slug}-results-{ml}-{year}-{name_slug}-list-of-passers",
        f"{SITE}/{slug}-results-{ml}-{year}-list-of-passers",
    ]


def probe_url(url: str) -> bool:
    try:
        resp = requests.head(url, headers=HEADERS, timeout=12, allow_redirects=True)
        if resp.status_code == 405:
            resp = requests.get(url, headers=HEADERS, timeout=15, stream=True)
            resp.close()
        return resp.status_code == 200
    except requests.RequestException:
        return False


def add_row(
    rows: dict[tuple, dict],
    *,
    exam_code: str,
    year: int,
    month: str,
    url: str,
    source: str,
    discovered_via: str,
    post_id: int | None = None,
    title: str = "",
) -> None:
    if not month:
        return
    key = (exam_code, month, year)
    row = {
        "exam_code": exam_code,
        "year": year,
        "month": month,
        "url": url,
        "source": source,
        "discovered_via": discovered_via,
        "post_id": post_id,
        "title": title,
    }
    existing = rows.get(key)
    if not existing:
        rows[key] = row
        return
    new_pri = SOURCE_PRIORITY.get(source, 0)
    old_pri = SOURCE_PRIORITY.get(existing["source"], 0)
    if new_pri > old_pri:
        rows[key] = row


def discover_wp(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
    rows: dict[tuple, dict],
) -> None:
    seen_queries: set[str] = set()
    for exam_code in exam_codes:
        prog = PROGRAMS_DICT[exam_code]
        slug = prog["prcboard_slug"]
        kw = prog["keywords"][0] if prog["keywords"] else slug
        queries = [
            f"{slug} results list of passers",
            f"{kw} results",
            f"{exam_code} results",
            *EXTRA_WP_QUERIES.get(exam_code, []),
        ]
        print(f"  WP search: {exam_code} …")
        for q in queries:
            if q in seen_queries:
                continue
            seen_queries.add(q)
            posts = wp_search_all(q, max_pages=5)
            for post in posts:
                url = post.get("link", "")
                title = post_title(post)
                if not url or not is_main_results_page(url, title):
                    continue
                year, month = parse_year_month(url, title)
                if year is None or year < start_year or year > end_year:
                    continue
                inferred = infer_exam_from_content(url, title)
                score = exam_inference_score(url, title, exam_code)
                if inferred != exam_code or score < MIN_EXAM_SCORE:
                    continue
                add_row(
                    rows,
                    exam_code=exam_code,
                    year=year,
                    month=month,
                    url=url,
                    source="prcboard.com",
                    discovered_via="wp_search_exam",
                    post_id=post.get("id"),
                    title=title,
                )
            time.sleep(WP_PAUSE)


def discover_direct(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
    rows: dict[tuple, dict],
) -> None:
    print("  Probing direct prcboard URLs …")
    for exam_code in exam_codes:
        typical = EXAM_CYCLES.get(exam_code, ["March", "June", "September", "December"])
        extra = [m for m in ALL_CALENDAR_MONTHS if m not in typical]
        for year in range(start_year, end_year + 1):
            found_for_year = False
            for month in typical:
                for url in direct_result_urls(exam_code, year, month):
                    if not probe_url(url):
                        time.sleep(0.15)
                        continue
                    matched, page_title = probe_url_for_exam(url, exam_code)
                    if matched:
                        add_row(
                            rows,
                            exam_code=exam_code,
                            year=year,
                            month=month,
                            url=url,
                            source="prcboard.com/direct",
                            discovered_via="direct_url",
                            title=page_title,
                        )
                        found_for_year = True
                        break
                    time.sleep(0.25)
                if found_for_year:
                    break
                time.sleep(0.15)
            if found_for_year:
                continue
            for month in extra:
                for url in direct_result_urls(exam_code, year, month):
                    if not probe_url(url):
                        time.sleep(0.15)
                        continue
                    matched, page_title = probe_url_for_exam(url, exam_code)
                    if matched:
                        add_row(
                            rows,
                            exam_code=exam_code,
                            year=year,
                            month=month,
                            url=url,
                            source="prcboard.com/direct",
                            discovered_via="direct_url",
                            title=page_title,
                        )
                        found_for_year = True
                        break
                    time.sleep(0.25)
                if found_for_year:
                    break
                time.sleep(0.15)


def discover_prc(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
    rows: dict[tuple, dict],
) -> None:
    print("  PRC.gov.ph search …")
    for exam_code in exam_codes:
        prog = PROGRAMS_DICT[exam_code]
        seen_urls: set[str] = set()
        for year in range(start_year, end_year + 1):
            queries = [
                f"{prog['exam_name']} results {year}",
                f"{prog['keywords'][0]} results {year}" if prog["keywords"] else "",
                f"{prog['prcboard_slug']} results {year}",
            ]
            for query in queries:
                if not query:
                    continue
                hits = prc_search(query, max_pages=3)
                for hit in hits:
                    title = hit["title"]
                    url = hit["url"]
                    full_url = urljoin(PRC_SITE, url) if not url.startswith("http") else url
                    if full_url in seen_urls:
                        continue
                    if not article_matches_exam(title, exam_code):
                        continue
                    if is_excluded_title(title):
                        continue
                    month, y = parse_month_year(title, url)
                    if y != year:
                        continue
                    if not month:
                        month = infer_month_from_title(exam_code, title, url)
                    if not month:
                        month = _month_from_any_calendar(title, url)
                    if not month:
                        continue
                    seen_urls.add(full_url)
                    add_row(
                        rows,
                        exam_code=exam_code,
                        year=year,
                        month=month,
                        url=full_url,
                        source="prc.gov.ph",
                        discovered_via="prc_search_year",
                        title=title,
                    )
                time.sleep(0.3)
        time.sleep(PAUSE)


def infer_month_from_title(exam_code: str, title: str, url: str) -> str:
    text = f"{title} {url}".lower()
    for month in EXAM_CYCLES.get(exam_code, []):
        if month.lower() in text:
            return month
    return _month_from_any_calendar(title, url)


def _month_from_any_calendar(title: str, url: str) -> str:
    text = f"{title} {url}".lower()
    for month in ALL_CALENDAR_MONTHS:
        if month.lower() in text:
            return month
    return ""


def collect_index(
    start_year: int,
    end_year: int,
    exam_codes: list[str],
) -> list[dict]:
    rows: dict[tuple, dict] = {}
    print(f"\nPhase 1 — index {len(exam_codes)} program(s), {start_year}–{end_year}\n")
    discover_wp(exam_codes, start_year, end_year, rows)
    discover_direct(exam_codes, start_year, end_year, rows)
    discover_prc(exam_codes, start_year, end_year, rows)
    return sorted(rows.values(), key=lambda r: (r["exam_code"], r["year"], r["month"]))


def merge_into_index(new_rows: list[dict], json_path: Path) -> list[dict]:
    """Merge new index rows into existing national_links.json by (exam_code, month, year)."""
    existing: list[dict] = []
    if json_path.is_file():
        with json_path.open(encoding="utf-8") as f:
            existing = json.load(f)
    by_key = {(r["exam_code"], r.get("month"), r["year"]): r for r in existing}
    for row in new_rows:
        key = (row["exam_code"], row.get("month"), row["year"])
        cur = by_key.get(key)
        if not cur:
            by_key[key] = row
            continue
        new_pri = SOURCE_PRIORITY.get(row.get("source", ""), 0)
        old_pri = SOURCE_PRIORITY.get(cur.get("source", ""), 0)
        if new_pri > old_pri:
            by_key[key] = row
    return sorted(by_key.values(), key=lambda r: (r["exam_code"], r["year"], r["month"]))


def write_outputs(rows: list[dict], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "exam_code", "year", "month", "url", "source",
        "discovered_via", "post_id", "title",
    ]
    csv_path = out_dir / "national_links.csv"
    json_path = out_dir / "national_links.json"

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

    by_prog: dict[str, int] = {}
    for r in rows:
        by_prog[r["exam_code"]] = by_prog.get(r["exam_code"], 0) + 1

    print(f"\nWrote {len(rows)} index rows -> {json_path}")
    for code in sorted(by_prog):
        print(f"  {code}: {by_prog[code]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build national pass-rate URL index")
    parser.add_argument("start_year", nargs="?", type=int, default=2015)
    parser.add_argument("end_year", nargs="?", type=int, default=2026)
    parser.add_argument("exam_code", nargs="?", help="Optional single exam code")
    parser.add_argument("--out", default="output", help="Output directory")
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Merge into existing national_links.json instead of replacing",
    )
    args = parser.parse_args()

    if args.start_year > args.end_year:
        print("start_year must be <= end_year", file=sys.stderr)
        sys.exit(1)

    exam_codes = ALL_CODES
    if args.exam_code:
        code = resolve_exam_code(args.exam_code)
        if not code:
            print(f"Unknown exam code: {args.exam_code}", file=sys.stderr)
            sys.exit(1)
        exam_codes = [code]

    rows = collect_index(args.start_year, args.end_year, exam_codes)
    out_dir = Path(args.out)
    if args.merge:
        rows = merge_into_index(rows, out_dir / "national_links.json")
    write_outputs(rows, out_dir)


if __name__ == "__main__":
    main()
