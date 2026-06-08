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
PAUSE = 1.5

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


def collect(
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
                print(f"\n{exam_code} {month} {year}")
                print(f"  {url}")

                status, html = fetch_html_requests(url)
                method = "requests"

                if status == 404:
                    print("  ⚠ page not found (404)")
                    rows.append(
                        {
                            "exam_code": exam_code,
                            "exam_name": PROGRAMS_DICT[exam_code]["exam_name"],
                            "year": year,
                            "month": month,
                            "school_page_url": url,
                            "http_status": status,
                            "fetch_method": method,
                            "drive_file_id": "",
                            "drive_preview_url": "",
                            "drive_view_url": "",
                            "notes": "page_not_found",
                        }
                    )
                    time.sleep(PAUSE)
                    continue

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
                    rows.append(
                        {
                            "exam_code": exam_code,
                            "exam_name": PROGRAMS_DICT[exam_code]["exam_name"],
                            "year": year,
                            "month": month,
                            "school_page_url": url,
                            "http_status": status,
                            "fetch_method": method,
                            "drive_file_id": "",
                            "drive_preview_url": "",
                            "drive_view_url": "",
                            "notes": "no_drive_embed",
                        }
                    )
                else:
                    drive_id = drive_ids[0]
                    preview = f"https://drive.google.com/file/d/{drive_id}/preview"
                    view = f"https://drive.google.com/file/d/{drive_id}/view"
                    extra = f" (+{len(drive_ids) - 1} more)" if len(drive_ids) > 1 else ""
                    print(f"  ✓ Drive ID: {drive_id}{extra}")
                    print(f"    preview: {preview}")
                    rows.append(
                        {
                            "exam_code": exam_code,
                            "exam_name": PROGRAMS_DICT[exam_code]["exam_name"],
                            "year": year,
                            "month": month,
                            "school_page_url": url,
                            "http_status": status,
                            "fetch_method": method,
                            "drive_file_id": drive_id,
                            "drive_preview_url": preview,
                            "drive_view_url": view,
                            "notes": "ok",
                        }
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
    lines = [
        "# Performance of Schools — Google Drive links",
        "",
        f"Total pages checked: **{len(rows)}**",
        f"Drive links found: **{len(found)}**",
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
    ]
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

    rows = collect(args.start_year, args.end_year, exam_codes, args.playwright)
    write_outputs(rows, Path(args.out))


if __name__ == "__main__":
    main()
