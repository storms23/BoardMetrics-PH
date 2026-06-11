#!/usr/bin/env python3
"""
PRC.gov.ph scraper — official Performance of Schools (POS) PDFs.

Discovery: Drupal site search → result article → Related Downloads link.
Extraction: direct PDF download from /uploaded/documents/ → pdfplumber/text parse.

Usage:
  python prc_gov_ph.py CELE 2017           # scrape one program/year
  python prc_gov_ph.py CELE 2015 2020     # scrape year range
  python prc_gov_ph.py --collect CELE 2015 2020   # links only, no DB write
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, quote_plus

import requests
from bs4 import BeautifulSoup

import db
from normalize import infer_region
from national_extract import get_summary
from programs import ALL_CODES, EXAM_CYCLES, PROGRAMS_DICT

PRC_SITE = "https://www.prc.gov.ph"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.prc.gov.ph/",
}
PAUSE = 1.5

MONTHS = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)
MONTH_ALIASES = {
    "jan": "January", "feb": "February", "mar": "March", "apr": "April",
    "may": "May", "jun": "June", "jul": "July", "aug": "August",
    "sep": "September", "sept": "September", "oct": "October",
    "nov": "November", "dec": "December",
}

EXCLUDE_TITLE_PATTERNS = re.compile(
    r"middle\s+east|special\s+professional|room\s+assignment|advisory|procurement",
    re.I,
)

# PRC POS row: school + optional seq + 3×(passed, failed, total, %) — we want OVERALL (last group)
POS_ROW_RE = re.compile(
    r"^(.+?)\s+"
    r"(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)%?\s+"   # first timers
    r"(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)%?\s+"   # repeaters
    r"(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)%?\s*$",  # overall
    re.I,
)


def prc_search(query: str, max_pages: int = 3) -> list[dict]:
    """Search prc.gov.ph news/articles via Drupal search."""
    results: list[dict] = []
    seen: set[str] = set()

    for page in range(0, max_pages):
        url = f"{PRC_SITE}/search/node?keys={quote_plus(query)}&page={page}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code != 200:
                break
            soup = BeautifulSoup(resp.text, "html.parser")
            found = 0
            for heading in soup.find_all(["h2", "h3", "h4"]):
                a = heading.find("a", href=True)
                if not a:
                    continue
                link = urljoin(PRC_SITE, a["href"])
                title = a.get_text(" ", strip=True)
                if link in seen:
                    continue
                seen.add(link)
                results.append({"title": title, "url": link})
                found += 1
            if found == 0:
                break
            time.sleep(0.4)
        except requests.RequestException as exc:
            print(f"  PRC search error: {exc}")
            break

    return results


def fetch_html(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=45)
    resp.raise_for_status()
    return resp.text


def parse_month_year(title: str, url: str) -> tuple[str | None, int | None]:
    text = f"{title} {url}".lower()
    year_m = re.search(r"\b(20\d{2})\b", text)
    year = int(year_m.group(1)) if year_m else None

    month = None
    for name in MONTHS:
        if re.search(rf"\b{name}\b", text):
            month = name.title()
            break
    if not month:
        for alias, full in MONTH_ALIASES.items():
            if re.search(rf"\b{alias}\b", text):
                month = full
                break
    return month, year


def article_matches_exam(title: str, exam_code: str) -> bool:
    if EXCLUDE_TITLE_PATTERNS.search(title):
        return False
    prog = PROGRAMS_DICT[exam_code]
    text = title.lower()
    tokens = [
        exam_code.lower(),
        prog["prcboard_slug"].lower(),
        prog["slug"].replace("-", " "),
    ] + [k.lower() for k in prog["keywords"]]
    # Require at least one strong match
    for token in tokens:
        if len(token) >= 3 and token in text:
            return True
    # Exam name fragments (drop generic words)
    name_parts = [
        w for w in prog["exam_name"].lower().split()
        if w not in ("licensure", "examination", "examinations", "for", "the", "and", "/")
        and len(w) > 3
    ]
    hits = sum(1 for p in name_parts[:4] if p in text)
    return hits >= 2


def extract_pos_link(html: str) -> dict | None:
    """Find Performance of Schools link — direct PDF or Google Drive."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        label = a.get_text(" ", strip=True)
        if not re.search(r"performance\s+of\s+schools?", label, re.I):
            continue
        href = a["href"].strip()
        if not href or href.startswith("#"):
            continue

        if "drive.google.com" in href:
            m = re.search(r"drive\.google\.com/file/d/([A-Za-z0-9_-]+)", href)
            if m:
                return {
                    "type": "drive",
                    "url": href,
                    "drive_id": m.group(1),
                    "pdf_url": None,
                }

        if href.lower().endswith(".pdf") or "uploaded/documents" in href.lower():
            pdf_url = urljoin(PRC_SITE, href)
            return {"type": "pdf", "url": pdf_url, "pdf_url": pdf_url, "drive_id": None}

    return None


def download_pdf(url: str) -> bytes | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=90)
        if resp.status_code != 200:
            print(f"  [FAIL] PDF download HTTP {resp.status_code}")
            return None
        if resp.content[:4] != b"%PDF":
            print(f"  [FAIL] Not a PDF ({len(resp.content)} bytes)")
            return None
        return resp.content
    except requests.RequestException as exc:
        print(f"  [FAIL] PDF download error: {exc}")
        return None


def _clean_school_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip(" -")
    # Strip trailing sequence number glued to school name
    name = re.sub(r"\s+\d{1,4}$", "", name).strip()
    if re.match(r"^(school|seq|no|performance|first timers|repeaters|overall)\b", name, re.I):
        return ""
    if re.match(r"^\d+$", name):
        return ""
    return name


def parse_prc_pos_text(text: str) -> list[dict]:
    """Parse PRC POS plain text (pdfplumber extract_text fallback)."""
    schools: list[dict] = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 20:
            continue
        if re.search(r"^(seq|school|first timers|repeaters|overall|performance|pos\s*-)", line, re.I):
            continue

        m = POS_ROW_RE.match(line)
        if not m:
            continue

        school = _clean_school_name(m.group(1))
        if not school or len(school) < 4:
            continue

        passers = int(m.group(10))
        failed = int(m.group(11))
        takers = int(m.group(12))
        rate = float(m.group(13))

        if takers <= 0:
            continue
        if passers + failed != takers and abs((passers / takers * 100) - rate) > 2:
            # tolerate minor OCR drift; skip clearly broken rows
            if passers > takers:
                continue

        schools.append({
            "school": school,
            "takers": takers,
            "passers": passers,
            "pass_rate": rate,
            "rank": len(schools) + 1,
            "region": infer_region(school),
        })

    return schools


def parse_prc_pos_pdf(pdf_bytes: bytes) -> list[dict]:
    """Extract schools from official PRC POS PDF."""
    schools: list[dict] = []

    try:
        import pdfplumber
    except ImportError:
        print("  pdfplumber not installed")
        return []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            # Try structured tables first (14-col PRC format)
            for page in pdf.pages:
                table = page.extract_table()
                if not table or len(table) < 2:
                    continue

                sample = [r for r in table[1:6] if r and len(r) > 1]
                col0_is_seq = sample and sum(
                    1 for r in sample if r[0] and str(r[0]).strip().isdigit()
                ) >= len(sample) // 2

                for row in table[1:]:
                    if not row or len(row) < 5:
                        continue
                    try:
                        if col0_is_seq and len(row) >= 14:
                            name = _clean_school_name(str(row[1] or ""))
                            passers = int(str(row[-4]).replace(",", "").strip())
                            failed = int(str(row[-3]).replace(",", "").strip())
                            takers = int(str(row[-2]).replace(",", "").strip())
                            rate = float(str(row[-1]).replace("%", "").replace(",", "").strip())
                        elif len(row) >= 4:
                            name = _clean_school_name(str(row[0] or ""))
                            passers = int(str(row[1]).replace(",", "").strip())
                            takers = int(str(row[2]).replace(",", "").strip())
                            rate = float(str(row[3]).replace("%", "").replace(",", "").strip())
                            failed = takers - passers
                        else:
                            continue
                    except (ValueError, TypeError):
                        continue

                    if not name or takers <= 0:
                        continue

                    schools.append({
                        "school": name,
                        "takers": takers,
                        "passers": passers,
                        "pass_rate": rate,
                        "rank": len(schools) + 1,
                        "region": infer_region(name),
                    })

            # Text fallback if tables sparse
            if len(schools) < 5:
                schools = []
                full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
                schools = parse_prc_pos_text(full_text)

    except Exception as exc:
        print(f"  pdfplumber error: {exc}")

    return schools


def discover_articles(exam_code: str, year: int) -> list[dict]:
    """Find PRC result articles for a program/year."""
    prog = PROGRAMS_DICT[exam_code]
    queries = [
        f"{prog['exam_name']} results {year}",
        f"{prog['keywords'][0]} results {year}",
        f"{prog['prcboard_slug']} results {year}",
    ]

    candidates: list[dict] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()

    for q in queries:
        for hit in prc_search(q, max_pages=3):
            title = hit["title"]
            url = hit["url"]
            title_key = re.sub(r"\s+", " ", title).strip().lower()
            if url in seen_urls or title_key in seen_titles:
                continue
            if not article_matches_exam(title, exam_code):
                continue
            month, y = parse_month_year(title, url)
            if y != year:
                continue
            seen_urls.add(url)
            seen_titles.add(title_key)
            candidates.append({
                "exam_code": exam_code,
                "title": title,
                "url": url,
                "month": month,
                "year": y,
            })
        time.sleep(0.3)

    return candidates


def scrape_prc_article(
    exam_code: str,
    article: dict,
    *,
    write_db: bool = True,
) -> dict:
    """
    Process one PRC article: summary + POS PDF → schools.
    Returns result dict with status and counts.
    """
    title = article["title"]
    url = article["url"]
    month = article.get("month") or "Unknown"
    year = article["year"]

    print(f"\n  PRC: {title}")
    print(f"  {url}")

    result = {
        "exam_code": exam_code,
        "month": month,
        "year": year,
        "article_url": url,
        "pos_url": "",
        "pos_type": "",
        "schools_count": 0,
        "notes": "",
    }

    try:
        html = fetch_html(url)
    except requests.RequestException as exc:
        result["notes"] = f"fetch_error: {exc}"
        print(f"  [FAIL] {result['notes']}")
        return result

    stats = get_summary(BeautifulSoup(html, "html.parser").get_text(" ", strip=True))
    pos = extract_pos_link(html)

    if not pos:
        result["notes"] = "no_pos_link"
        print("  [WARN] No Performance of Schools link")
        return result

    result["pos_type"] = pos["type"]
    result["pos_url"] = pos.get("pdf_url") or pos.get("url", "")

    if pos["type"] == "drive":
        result["notes"] = "drive_link_only"
        print(f"  [WARN] POS is Google Drive (use prcboard fallback): {pos['url'][:80]}")
        return result

    pdf_bytes = download_pdf(pos["pdf_url"])
    if not pdf_bytes:
        result["notes"] = "pdf_download_failed"
        return result

    schools = parse_prc_pos_pdf(pdf_bytes)
    result["schools_count"] = len(schools)
    print(f"  [OK] Parsed {len(schools)} schools from PRC PDF")

    if not schools:
        result["notes"] = "parse_empty"
        return result

    if not write_db:
        result["notes"] = "ok"
        return result

    if not db.SUPABASE_URL or not db.SERVICE_KEY:
        result["notes"] = "db_not_configured"
        print("  [WARN] DB not configured - skipping write")
        return result

    job_id = db.start_import_job(exam_code, year)
    affected = 0
    try:
        summary = stats or {"total_passers": 0, "total_takers": 0, "pass_rate": 0.0}
        eid = db.upsert_exam_result(exam_code, month, year, summary, url)
        db.audit("import", "exam_results", eid, {"source": "prc.gov.ph", "pos_url": pos["pdf_url"]})
        affected = db.upsert_school_performance(eid, schools)
        if affected < len(schools) * 0.9:
            db.finish_import_job(
                job_id, "failed", affected,
                f"Only saved {affected}/{len(schools)} schools",
            )
            result["notes"] = f"partial_save:{affected}/{len(schools)}"
            print(f"  [WARN] Partial save: {affected}/{len(schools)} schools")
        else:
            db.finish_import_job(job_id, "success", affected)
            result["notes"] = "ok"
            print(f"  [OK] Saved {affected} schools to DB")
    except Exception as exc:
        db.finish_import_job(job_id, "failed", affected, str(exc))
        result["notes"] = f"db_error: {exc}"
        print(f"  [FAIL] DB error: {exc}")

    return result


# PRC often posts a different month than our typical cycle (e.g. CELE "March" → April/May).
PRC_MONTH_ALTERNATES: dict[str, list[str]] = {
    "March": ["march", "april", "may"],
    "May": ["may", "april", "march"],
    "April": ["april", "may", "march"],
    "June": ["june", "july"],
    "September": ["september", "october"],
    "October": ["october", "september", "november"],
    "November": ["november", "october"],
    "December": ["december", "november"],
}


def scrape_prc_month(
    exam_code: str,
    year: int,
    month: str,
    *,
    write_db: bool = True,
) -> bool:
    """Try one exam cycle on prc.gov.ph. Returns True if schools were saved."""
    articles = discover_articles(exam_code, year)
    accept = {month.lower()} | set(PRC_MONTH_ALTERNATES.get(month, [month.lower()]))
    matched = [
        a for a in articles
        if a.get("month") and a["month"].lower() in accept
    ]
    if not matched:
        return False

    for article in matched:
        res = scrape_prc_article(exam_code, article, write_db=write_db)
        if res.get("notes") == "ok":
            return True
        if res.get("schools_count", 0) > 0 and res.get("notes") == "db_not_configured":
            print("  [WARN] Parsed schools but cannot save — set Supabase keys in .env.local")
            return False
        time.sleep(PAUSE)
    return False


def scrape_prc_year(exam_code: str, year: int, *, write_db: bool = True) -> int:
    """Scrape all PRC articles found for a program/year. Returns cycles saved."""
    print(f"\n{'=' * 55}")
    print(f"  PRC.gov.ph — {exam_code} {year}")
    print(f"{'=' * 55}")

    articles = discover_articles(exam_code, year)
    print(f"  Found {len(articles)} matching articles")

    saved = 0
    for article in articles:
        res = scrape_prc_article(exam_code, article, write_db=write_db)
        if res.get("notes") == "ok":
            saved += 1
        elif res.get("schools_count", 0) > 0:
            print(f"  [WARN] {article.get('month')} {year}: parsed {res['schools_count']} schools but not saved")
        time.sleep(PAUSE)

    return saved


def collect_links(
    exam_codes: list[str],
    start_year: int,
    end_year: int,
    out_dir: Path,
) -> None:
    """Collect PRC POS links without DB writes."""
    rows: list[dict] = []

    for exam_code in exam_codes:
        for year in range(start_year, end_year + 1):
            articles = discover_articles(exam_code, year)
            for article in articles:
                try:
                    html = fetch_html(article["url"])
                    pos = extract_pos_link(html)
                    stats = get_summary(BeautifulSoup(html, "html.parser").get_text(" ", strip=True))
                except requests.RequestException:
                    pos = None
                    stats = None

                rows.append({
                    "exam_code": exam_code,
                    "year": year,
                    "month": article.get("month") or "",
                    "article_url": article["url"],
                    "article_title": article["title"],
                    "pos_type": pos["type"] if pos else "",
                    "pos_url": (pos.get("pdf_url") or pos.get("url", "")) if pos else "",
                    "drive_id": pos.get("drive_id", "") if pos else "",
                    "national_passers": stats["total_passers"] if stats else "",
                    "national_takers": stats["total_takers"] if stats else "",
                    "national_pass_rate": stats["pass_rate"] if stats else "",
                })
                time.sleep(PAUSE)

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "prc_pos_links.csv"
    json_path = out_dir / "prc_pos_links.json"

    if rows:
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        with json_path.open("w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)

    pdf_count = sum(1 for r in rows if r["pos_type"] == "pdf")
    print(f"\nCollected {len(rows)} articles, {pdf_count} direct PDF links")
    print(f"Wrote {csv_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Performance of Schools from prc.gov.ph")
    parser.add_argument("exam_code", nargs="?", help="Exam code e.g. CELE")
    parser.add_argument("start_year", nargs="?", type=int, default=2017)
    parser.add_argument("end_year", nargs="?", type=int, help="End year (optional)")
    parser.add_argument("--collect", action="store_true", help="Collect links only, no DB write")
    parser.add_argument("--out", default="output", help="Output dir for --collect")
    parser.add_argument("--no-db", action="store_true", help="Parse only, skip Supabase writes")
    args = parser.parse_args()

    if args.collect:
        codes = [args.exam_code.upper()] if args.exam_code else ALL_CODES
        if args.exam_code and args.exam_code.upper() not in PROGRAMS_DICT:
            print(f"Unknown exam code: {args.exam_code}", file=sys.stderr)
            sys.exit(1)
        end = args.end_year or args.start_year
        collect_links(codes, args.start_year, end, Path(args.out))
        return

    if not args.exam_code:
        parser.print_help()
        sys.exit(1)

    code = args.exam_code.upper()
    if code not in PROGRAMS_DICT:
        print(f"Unknown exam code: {code}", file=sys.stderr)
        sys.exit(1)

    end = args.end_year or args.start_year
    write_db = not args.no_db

    total_saved = 0
    for year in range(args.start_year, end + 1):
        total_saved += scrape_prc_year(code, year, write_db=write_db)

    print(f"\nDone. Cycles saved: {total_saved}")
    if write_db:
        print("Recompute scores: python consistency.py")


if __name__ == "__main__":
    main()
