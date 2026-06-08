#!/usr/bin/env python3
"""
Collect Google Drive links for "Performance of Schools" PDFs on prcboard.com.

Each top-schools page embeds a view-only Drive PDF. This script finds those
links so you can download them manually (e.g. Document Preview Exporter) and
send the files back for parsing.

Usage:
  python collect_drive_links.py                    # 2015–2026, all MVP programs
  python collect_drive_links.py 2020 2026          # year range
  python collect_drive_links.py 2026 2026 CELE     # one program
  python collect_drive_links.py 2026 2026 --playwright  # force Playwright for every page
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from programs import EXAM_CYCLES, PROGRAMS_DICT, ALL_CODES

SITE = "https://www.prcboard.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.prcboard.com/",
}
PAUSE = 1.0
WP_PAUSE = 0.35
MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

DRIVE_PATTERNS = [
    re.compile(r"drive\.google\.com/file/d/([A-Za-z0-9_-]+)"),
    re.compile(r"drive\.google\.com/uc\?[^\"']*id=([A-Za-z0-9_-]+)"),
]


def school_page_url(exam_code: str, year: int, month: str) -> str:
    slug = PROGRAMS_DICT[exam_code]["prcboard_slug"]
    return f"{SITE}/top-schools-{month.lower()}-{year}-{slug}-results"


def extract_drive_ids(html: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for pattern in DRIVE_PATTERNS:
        for match in pattern.findall(html):
            if match not in seen:
                seen.add(match)
                ids.append(match)
    return ids


def wp_get(path: str, params: dict | None = None) -> object | None:
    try:
        resp = requests.get(
            f"{SITE}/wp-json/wp/v2/{path}",
            params=params or {},
            headers=HEADERS,
            timeout=25,
        )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception as exc:
        print(f"  WP API error ({path}): {exc}")
        return None


def wp_search_all(keyword: str, max_pages: int = 15) -> list[dict]:
    """Paginated WordPress search — needed to reach older posts."""
    posts: list[dict] = []
    seen_ids: set[int] = set()

    for page in range(1, max_pages + 1):
        data = wp_get(
            "posts",
            {
                "search": keyword,
                "per_page": 100,
                "page": page,
                "_fields": "id,title,link,date",
            },
        )
        if not data or not isinstance(data, list) or not data:
            break
        for post in data:
            pid = post.get("id")
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            posts.append(post)
        if len(data) < 100:
            break
        time.sleep(WP_PAUSE)

    return posts


def wp_category_posts(category_slug: str, max_pages: int = 50) -> list[dict]:
    """Fetch posts from a category archive (e.g. top-performing-schools)."""
    cats = wp_get("categories", {"slug": category_slug, "per_page": 5})
    if not cats or not isinstance(cats, list) or not cats:
        return []

    cat_id = cats[0]["id"]
    posts: list[dict] = []
    seen_ids: set[int] = set()

    for page in range(1, max_pages + 1):
        data = wp_get(
            "posts",
            {
                "categories": cat_id,
                "per_page": 100,
                "page": page,
                "_fields": "id,title,link,date",
            },
        )
        if not data or not isinstance(data, list) or not data:
            break
        for post in data:
            pid = post.get("id")
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            posts.append(post)
        if len(data) < 100:
            break
        time.sleep(WP_PAUSE)

    return posts


def post_title(post: dict) -> str:
    title = post.get("title", "")
    if isinstance(title, dict):
        return title.get("rendered", "")
    return str(title)


def parse_year_month(url: str, title: str) -> tuple[int | None, str]:
    text = f"{title} {url}"
    year_match = re.search(r"\b(20\d{2})\b", text)
    if not year_match:
        return None, ""
    year = int(year_match.group(1))
    month_match = re.search(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\b",
        text,
        re.I,
    )
    month = month_match.group(1).title() if month_match else ""
    return year, month


def is_school_performance_page(url: str, title: str) -> bool:
    """Relaxed filter — includes combined result pages with school performance."""
    u = url.lower()
    t = title.lower()
    markers = (
        "top-schools",
        "top schools",
        "top-performing",
        "top performing",
        "performance of schools",
        "performance-of-schools",
        "performance-of-school",
    )
    if any(m in u or m in t for m in markers):
        return True
    # Combined LET / results pages that include top schools section
    if "topnotchers-and-top-schools" in u or "topnotchers and top schools" in t:
        return True
    if re.search(r"top[\s-]?schools", t) and re.search(r"\b20\d{2}\b", f"{t} {u}"):
        return True
    return False


def infer_exam_code(url: str, title: str, hint: str | None = None) -> str:
    if hint and hint in PROGRAMS_DICT:
        return hint

    text = f"{url} {title}".lower()
    best_code = ""
    best_score = 0

    for code, prog in PROGRAMS_DICT.items():
        score = 0
        slug = prog["prcboard_slug"].lower()
        if slug in text:
            score += 10
        if prog["slug"].replace("-", " ") in text:
            score += 8
        for kw in prog["keywords"]:
            if kw.lower() in text:
                score += 5
        if code.lower() in text:
            score += 6
        if score > best_score:
            best_score = score
            best_code = code

    return best_code or (hint or "UNKNOWN")


def add_candidate(
    candidates: list[dict],
    seen_urls: set[str],
    post: dict,
    start_year: int,
    end_year: int,
    discovered_via: str,
    hint_exam: str | None = None,
) -> bool:
    url = post.get("link", "")
    title = post_title(post)
    if not url or url in seen_urls:
        return False
    if not is_school_performance_page(url, title):
        return False

    year, month = parse_year_month(url, title)
    if year is None or year < start_year or year > end_year:
        return False

    exam_code = infer_exam_code(url, title, hint_exam)
    exam_name = PROGRAMS_DICT[exam_code]["exam_name"] if exam_code in PROGRAMS_DICT else "Unknown"

    seen_urls.add(url)
    candidates.append(
        {
            "exam_code": exam_code,
            "exam_name": exam_name,
            "year": year,
            "month": month,
            "school_page_url": url,
            "discovered_via": discovered_via,
        }
    )
    return True


def discover_top_school_pages(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
) -> list[dict]:
    """Find top-schools / performance-of-schools pages via paginated WP search."""
    candidates: list[dict] = []
    seen_urls: set[str] = set()
    seen_queries: set[str] = set()

    def run_queries(
        queries: list[str],
        via: str,
        hint: str | None = None,
        max_pages: int = 15,
    ) -> int:
        added = 0
        for q in queries:
            if q in seen_queries:
                continue
            seen_queries.add(q)
            posts = wp_search_all(q, max_pages=max_pages)
            for post in posts:
                if add_candidate(candidates, seen_urls, post, start_year, end_year, via, hint):
                    added += 1
            time.sleep(WP_PAUSE)
        return added

    # 1) Category archive — best source for historical top-schools posts
    print("  Scanning category: top-performing-schools …")
    cat_posts = wp_category_posts("top-performing-schools", max_pages=50)
    cat_added = sum(
        1
        for post in cat_posts
        if add_candidate(candidates, seen_urls, post, start_year, end_year, "wp_category")
    )
    print(f"    +{cat_added} from category ({len(cat_posts)} posts scanned)")

    # 2) Global searches
    print("  Running global WP searches …")
    global_queries = [
        "performance of schools",
        "top schools performance",
        "top performing schools",
        "top-schools results",
    ]
    g_added = run_queries(global_queries, "wp_search_global")
    print(f"    +{g_added} from global queries")

    # 3) Per-exam searches (paginated)
    print("  Running per-exam WP searches …")
    for exam_code in exam_codes:
        prog = PROGRAMS_DICT[exam_code]
        slug = prog["prcboard_slug"]
        kw = prog["keywords"][0] if prog["keywords"] else slug
        exam_queries = [
            f"top schools {slug}",
            f"TOP SCHOOLS {slug}",
            f"top-schools {slug}",
            f"performance of schools {slug}",
            f"{kw} top schools",
            f"{kw} performance of schools",
        ]
        added = run_queries(exam_queries, "wp_search_exam", exam_code)
        print(f"    {exam_code}: +{added} (total unique: {len(candidates)})")

    # 4) Per-exam per-year searches — critical for older years (WP search ranks recent posts first)
    historical_end = min(end_year, 2020)
    year_added = 0
    if start_year <= historical_end:
        print(f"  Running per-year searches ({start_year}–{historical_end}) …")
        for exam_code in exam_codes:
            prog = PROGRAMS_DICT[exam_code]
            slug = prog["prcboard_slug"]
            for year in range(start_year, historical_end + 1):
                year_queries = [
                    f"top schools {slug} {year}",
                    f"TOP SCHOOLS {year} {slug}",
                    f"performance of schools {year} {slug}",
                    f"top-schools {year} {slug}",
                    f"{slug} {year} performance of schools",
                ]
                for q in year_queries:
                    if q in seen_queries:
                        continue
                    seen_queries.add(q)
                    posts = wp_search_all(q, max_pages=8)
                    for post in posts:
                        if add_candidate(
                            candidates, seen_urls, post, start_year, end_year, "wp_search_year", exam_code
                        ):
                            year_added += 1
                    time.sleep(WP_PAUSE)
        print(f"    +{year_added} from legacy per-year queries (total unique: {len(candidates)})")

    recent_start = max(start_year, 2021)
    recent_added = 0
    if recent_start <= end_year:
        print(f"  Running recent per-year searches ({recent_start}–{end_year}) …")
        for exam_code in exam_codes:
            prog = PROGRAMS_DICT[exam_code]
            slug = prog["prcboard_slug"]
            for year in range(recent_start, end_year + 1):
                year_queries = [
                    f"top schools {slug} {year}",
                    f"performance of schools {year} {slug}",
                ]
                for q in year_queries:
                    if q in seen_queries:
                        continue
                    seen_queries.add(q)
                    posts = wp_search_all(q, max_pages=3)
                    for post in posts:
                        if add_candidate(
                            candidates, seen_urls, post, start_year, end_year, "wp_search_year", exam_code
                        ):
                            recent_added += 1
                    time.sleep(WP_PAUSE)
        print(f"    +{recent_added} from recent per-year queries (total unique: {len(candidates)})")

    # 5) Lightweight constructed URL probe — only HEAD/GET for 200s, no Drive fetch yet
    print("  Probing constructed top-schools URLs for missing years …")
    constructed_added = 0
    for year in range(start_year, end_year + 1):
        for exam_code in exam_codes:
            months = EXAM_CYCLES.get(exam_code, list(MONTHS))
            for month in months:
                url = school_page_url(exam_code, year, month)
                if url in seen_urls:
                    continue
                try:
                    resp = requests.head(url, headers=HEADERS, timeout=15, allow_redirects=True)
                    if resp.status_code == 405:
                        resp = requests.get(url, headers=HEADERS, timeout=15, stream=True)
                        resp.close()
                    status = resp.status_code
                except requests.RequestException:
                    status = 0
                if status != 200:
                    continue
                post = {"link": url, "title": {"rendered": f"TOP SCHOOLS {month} {year} {exam_code}"}}
                if add_candidate(
                    candidates, seen_urls, post, start_year, end_year, "constructed_probe", exam_code
                ):
                    constructed_added += 1
                time.sleep(0.15)
    print(f"    +{constructed_added} from constructed URL probes")

    by_year: dict[int, int] = {}
    for c in candidates:
        by_year[c["year"]] = by_year.get(c["year"], 0) + 1
    print(f"\n  Discovery summary: {len(candidates)} unique pages")
    for y in sorted(by_year):
        print(f"    {y}: {by_year[y]} pages")

    return candidates


def fetch_html_requests(url: str) -> tuple[int, str]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        return resp.status_code, resp.text
    except requests.RequestException as exc:
        print(f"    ✗ request error: {exc}")
        return 0, ""


def fetch_html_playwright(url: str) -> tuple[int, str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("    ✗ Playwright not installed")
        return 0, ""

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                ],
            )
            context = browser.new_context(
                user_agent=HEADERS["User-Agent"],
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
            )
            page = context.new_page()
            page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
            )
            response = page.goto(url, timeout=60000, wait_until="domcontentloaded")
            page.wait_for_timeout(6000)
            html = page.content()
            status = response.status if response else 0
            browser.close()
            return status, html
    except Exception as exc:
        print(f"    ✗ Playwright error: {exc}")
        return 0, ""


def resolve_drive_for_page(
    exam_code: str,
    exam_name: str,
    year: int,
    month: str,
    url: str,
    force_playwright: bool,
    discovered_via: str = "constructed",
) -> dict:
    print(f"\n{exam_code} {month} {year}")
    print(f"  {url}")

    status, html = fetch_html_requests(url)
    method = "requests"

    if status == 404:
        print("  ⚠ page not found (404)")
        return {
            "exam_code": exam_code,
            "exam_name": exam_name,
            "year": year,
            "month": month,
            "school_page_url": url,
            "http_status": status,
            "fetch_method": method,
            "discovered_via": discovered_via,
            "drive_file_id": "",
            "drive_preview_url": "",
            "drive_view_url": "",
            "notes": "page_not_found",
        }

    drive_ids = extract_drive_ids(html) if html else []

    if (force_playwright or not drive_ids) and status == 200:
        print("  ↻ trying Playwright …")
        pw_status, pw_html = fetch_html_playwright(url)
        if pw_html:
            status = pw_status or status
            html = pw_html
            method = "playwright"
            drive_ids = extract_drive_ids(html)

    if not drive_ids:
        print(f"  ⚠ no Drive link (status {status}, {len(html)} chars)")
        return {
            "exam_code": exam_code,
            "exam_name": exam_name,
            "year": year,
            "month": month,
            "school_page_url": url,
            "http_status": status,
            "fetch_method": method,
            "discovered_via": discovered_via,
            "drive_file_id": "",
            "drive_preview_url": "",
            "drive_view_url": "",
            "notes": "no_drive_embed",
        }

    drive_id = drive_ids[0]
    preview = f"https://drive.google.com/file/d/{drive_id}/preview"
    view = f"https://drive.google.com/file/d/{drive_id}/view"
    extra = f" (+{len(drive_ids) - 1} more)" if len(drive_ids) > 1 else ""
    print(f"  ✓ Drive ID: {drive_id}{extra}")
    print(f"    preview: {preview}")
    return {
        "exam_code": exam_code,
        "exam_name": exam_name,
        "year": year,
        "month": month,
        "school_page_url": url,
        "http_status": status,
        "fetch_method": method,
        "discovered_via": discovered_via,
        "drive_file_id": drive_id,
        "drive_preview_url": preview,
        "drive_view_url": view,
        "notes": "ok",
    }


def collect_constructed(
    start_year: int,
    end_year: int,
    exam_codes: list[str],
    force_playwright: bool,
) -> list[dict]:
    rows: list[dict] = []

    for year in range(start_year, end_year + 1):
        for exam_code in exam_codes:
            months = EXAM_CYCLES.get(exam_code, ["March", "June", "September", "December"])
            for month in months:
                url = school_page_url(exam_code, year, month)
                rows.append(
                    resolve_drive_for_page(
                        exam_code,
                        PROGRAMS_DICT[exam_code]["exam_name"],
                        year,
                        month,
                        url,
                        force_playwright,
                        "constructed",
                    )
                )
                time.sleep(PAUSE)

    return rows


def collect_discovered(
    start_year: int,
    end_year: int,
    exam_codes: list[str],
    force_playwright: bool,
) -> list[dict]:
    print("\nDiscovering pages via WordPress search …")
    pages = discover_top_school_pages(exam_codes, start_year, end_year)
    print(f"Found {len(pages)} candidate top-schools pages\n")

    rows: list[dict] = []
    for page in pages:
        rows.append(
            resolve_drive_for_page(
                page["exam_code"],
                page["exam_name"],
                page["year"],
                page["month"],
                page["school_page_url"],
                force_playwright,
                page["discovered_via"],
            )
        )
        time.sleep(PAUSE)
    return rows


def write_outputs(rows: list[dict], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "drive_links.csv"
    json_path = out_dir / "drive_links.json"
    md_path = out_dir / "drive_links.md"

    fieldnames = [
        "exam_code",
        "exam_name",
        "year",
        "month",
        "school_page_url",
        "http_status",
        "fetch_method",
        "discovered_via",
        "drive_file_id",
        "drive_preview_url",
        "drive_view_url",
        "notes",
    ]

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

    found = [r for r in rows if r["drive_file_id"]]
    by_year: dict[int, int] = {}
    for r in found:
        by_year[r["year"]] = by_year.get(r["year"], 0) + 1

    lines = [
        "# Performance of Schools — Google Drive links",
        "",
        f"Total pages checked: **{len(rows)}**",
        f"Drive links found: **{len(found)}**",
        "",
        "## By year",
        "",
    ]
    for y in sorted(by_year):
        lines.append(f"- **{y}**: {by_year[y]} links")
    lines.extend([
        "",
        "## How to download",
        "",
        "1. Open a **drive_preview_url** below in Chrome.",
        "2. Use [Document Preview Exporter](https://chromewebstore.google.com/detail/document-preview-exporter/npapjbliocdhineglcjkmmmaddpgeono) → export as **ZIP (PNG)** or **PDF**.",
        "3. Name files like: `CELE_March_2026.pdf` or `CELE_March_2026.zip`.",
        "4. Send the exports back for parsing.",
        "",
        "## Links",
        "",
    ])
    for r in found:
        lines.append(
            f"- **{r['exam_code']} {r['month']} {r['year']}** — "
            f"[preview]({r['drive_preview_url']}) · "
            f"[prcboard page]({r['school_page_url']})"
        )

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\n{'=' * 60}")
    print(f"Wrote {csv_path}")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    print(f"Found {len(found)} / {len(rows)} Drive links")


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Google Drive links from prcboard top-schools pages")
    parser.add_argument("start_year", nargs="?", type=int, default=2015)
    parser.add_argument("end_year", nargs="?", type=int, default=2026)
    parser.add_argument("exam_code", nargs="?", help="Optional single exam code (e.g. CELE)")
    parser.add_argument("--playwright", action="store_true", help="Always use Playwright (slower, more reliable)")
    parser.add_argument(
        "--mode",
        choices=["discover", "constructed", "both"],
        default="discover",
        help="discover=WP search (recommended), constructed=guess URLs, both=merge",
    )
    parser.add_argument("--out", default="output", help="Output directory (default: output)")
    args = parser.parse_args()

    if args.start_year > args.end_year:
        print("start_year must be <= end_year", file=sys.stderr)
        sys.exit(1)

    exam_codes = ALL_CODES
    if args.exam_code:
        code = args.exam_code.upper()
        if code not in PROGRAMS_DICT:
            print(f"Unknown exam code: {code}", file=sys.stderr)
            sys.exit(1)
        exam_codes = [code]

    print(f"Collecting Drive links for {len(exam_codes)} program(s), {args.start_year}–{args.end_year}")

    rows: list[dict] = []
    if args.mode in ("constructed", "both"):
        rows.extend(collect_constructed(args.start_year, args.end_year, exam_codes, args.playwright))
    if args.mode in ("discover", "both"):
        rows.extend(collect_discovered(args.start_year, args.end_year, exam_codes, args.playwright))

    # Deduplicate by school page URL, prefer entries with Drive links
    merged: dict[str, dict] = {}
    for row in rows:
        key = row["school_page_url"]
        existing = merged.get(key)
        if not existing or (row["drive_file_id"] and not existing["drive_file_id"]):
            merged[key] = row
    rows = sorted(merged.values(), key=lambda r: (r["exam_code"], r["year"], r["month"]))

    write_outputs(rows, Path(args.out))


if __name__ == "__main__":
    main()
