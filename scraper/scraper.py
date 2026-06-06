#!/usr/bin/env python3
"""
scraper.py — Pasa Rate PH ETL

Collects: exam summary stats · school performance · topnotchers
Writes:   Supabase (Postgres) via db.py — idempotent upserts
Skips:    individual passers list (no feature needs it)

Usage:
  python scraper.py                 # run the default target list
  python scraper.py NLE 2025        # scrape one program + year
  python scraper.py --all 2025      # scrape all 16 programs for a year
"""

import os
import re
import sys
import json
import time
import base64

import requests
from bs4 import BeautifulSoup

import db
from programs import EXAM_NAMES, KEYWORDS, ALL_CODES
from normalize import infer_region

# ── CONFIG ────────────────────────────────────────────────────────────────────
KEY = os.getenv("ANTHROPIC_API_KEY", "")
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
PAUSE = 1.5  # be polite to the source server
SITE = "https://boardexams.ph"


# ── DISCOVERY: WordPress REST API ─────────────────────────────────────────────
def wp_search(keyword: str, n: int = 20) -> list:
    try:
        r = requests.get(
            f"{SITE}/wp-json/wp/v2/posts",
            params={"search": keyword, "per_page": n, "_fields": "id,title,link,date"},
            headers=HEADERS, timeout=15,
        )
        posts = r.json()
        return posts if isinstance(posts, list) else []
    except Exception as e:
        print(f"  WP API error: {e}")
        return []


def wp_get_content(post_id: int) -> str:
    try:
        r = requests.get(
            f"{SITE}/wp-json/wp/v2/posts/{post_id}",
            params={"_fields": "content"}, headers=HEADERS, timeout=15,
        )
        return r.json().get("content", {}).get("rendered", "")
    except Exception as e:
        print(f"  content error: {e}")
        return ""


# ── EXTRACT: national summary ─────────────────────────────────────────────────
def get_summary(text: str) -> dict | None:
    m = re.search(r"([\d,]+)\s+out\s+of\s+([\d,]+)\s+passed", text, re.IGNORECASE)
    if not m:
        return None
    passers = int(m.group(1).replace(",", ""))
    takers = int(m.group(2).replace(",", ""))
    return {
        "total_passers": passers,
        "total_takers": takers,
        "pass_rate": round(passers / takers * 100, 2) if takers else 0,
    }


def get_date(title: str, text: str = "") -> dict:
    months = (r"(January|February|March|April|May|June|July|August|"
              r"September|October|November|December)")
    for src in [title, text]:
        m = re.search(rf"{months}\s+(20\d\d)", src, re.IGNORECASE)
        if m:
            return {"month": m.group(1).capitalize(), "year": int(m.group(2))}
    m = re.search(r"\b(20\d\d)\b", title)
    return {"month": None, "year": int(m.group(1)) if m else None}


# ── EXTRACT: school table (HTML, with OCR fallback) ───────────────────────────
def parse_html_table(html: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue
        results = []
        for row in rows[1:]:
            cols = [td.get_text(strip=True) for td in row.find_all("td")]
            if len(cols) < 3:
                continue
            try:
                pr_str = cols[3] if len(cols) > 3 else cols[-1]
                pr = float(pr_str.replace("%", "").replace(",", "").strip())
            except (ValueError, IndexError):
                pr = None
            name = cols[0]
            results.append({
                "school": name,
                "takers": cols[1],
                "passers": cols[2],
                "pass_rate": pr,
                "rank": len(results) + 1,
                "region": infer_region(name),
            })
        if results:
            return results
    return []


def get_images_via_playwright(url: str) -> list:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(user_agent=HEADERS["User-Agent"])
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)
            srcs = page.eval_on_selector_all("img", "els => els.map(e => e.src)")
            browser.close()
        keywords = ["school", "performance", "result", "topnotch"]
        return [
            s for s in srcs
            if s.startswith("http")
            and any(k in s.lower() for k in keywords)
            and "logo" not in s.lower()
        ]
    except Exception as e:
        print(f"  Playwright error: {e}")
        return []


def ocr_image(image_url: str, mode: str = "school") -> list:
    if not KEY:
        print("  No ANTHROPIC_API_KEY set; skipping OCR.")
        return []
    prompts = {
        "school": (
            "Extract the school performance table from this image. "
            "Return ONLY a valid JSON array, no explanation:\n"
            '[{"rank":1,"school":"School Name","takers":100,"passers":95,"pass_rate":95.0}]'
        ),
        "topnotcher": (
            "Extract the top 10 board exam passers from this image. "
            "Return ONLY a valid JSON array, no explanation:\n"
            '[{"rank":1,"name":"LAST, FIRST MIDDLE","school":"School Name","rating":92.5}]'
        ),
    }
    try:
        import anthropic
        raw = requests.get(image_url, timeout=30).content
        b64 = base64.standard_b64encode(raw).decode()
        cl = anthropic.Anthropic(api_key=KEY)
        msg = cl.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image",
                     "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": prompts[mode]},
                ],
            }],
        )
        txt = re.sub(r"```json|```", "", msg.content[0].text.strip()).strip()
        return json.loads(txt)
    except json.JSONDecodeError:
        print("  OCR returned non-JSON; skipping.")
        return []
    except Exception as e:
        print(f"  OCR error: {e}")
        return []


# ── EXTRACT: topnotchers ──────────────────────────────────────────────────────
def parse_topnotchers(html: str) -> list:
    text = BeautifulSoup(html, "html.parser").get_text("\n")
    pat = re.compile(
        r"(\d+)[.)]\s*([A-Z][A-Z\s,.']+?)\s*[-–]\s*(.+?)\s*[-–]\s*([\d.]+)\s*%",
        re.MULTILINE,
    )
    return [
        {"rank": int(m.group(1)), "name": m.group(2).strip(),
         "school": m.group(3).strip(), "rating": float(m.group(4))}
        for m in pat.finditer(text)
    ][:10]


# ── MAIN ──────────────────────────────────────────────────────────────────────
def scrape(exam_code: str, year: int) -> None:
    name = EXAM_NAMES.get(exam_code, exam_code)
    print(f"\n{'='*55}\n  {exam_code} {year} — {name}\n{'='*55}")

    job_id = db.start_import_job(exam_code, year)
    affected = 0
    try:
        # Step 1: discover posts (try each keyword until we hit results)
        posts = []
        for kw in KEYWORDS.get(exam_code, [exam_code]):
            posts = wp_search(f"{kw} {year} performance schools")
            if posts:
                break
        if not posts:
            print("  No posts found.")
            db.finish_import_job(job_id, "success", 0, "no posts")
            return

        for post in posts[:2]:
            title = BeautifulSoup(post["title"]["rendered"], "html.parser").get_text()
            url = post["link"]
            html = wp_get_content(post["id"])
            text = BeautifulSoup(html, "html.parser").get_text()

            stats = get_summary(text)
            date = get_date(title, text)
            if not stats:
                continue

            print(f"  {stats['total_passers']:,}/{stats['total_takers']:,} "
                  f"({stats['pass_rate']}%) — {date['month']} {date['year']}")

            eid = db.upsert_exam_result(exam_code, date["month"], date["year"], stats, url)
            db.audit("import", "exam_results", eid, {"exam_code": exam_code, "year": year})

            # School table (HTML → OCR fallback)
            schools = parse_html_table(html)
            if not schools:
                for img in get_images_via_playwright(url)[:3]:
                    schools = ocr_image(img, "school")
                    if schools:
                        break
                    time.sleep(0.5)
            if schools:
                affected += db.upsert_school_performance(eid, schools)
                print(f"  saved {len(schools)} schools")

            # Topnotchers (text → OCR fallback)
            notch_url = (url.replace("performance-of-schools", "topnotchers")
                            .replace("top-schools", "topnotchers"))
            try:
                notch_html = requests.get(notch_url, headers=HEADERS, timeout=15).text
            except Exception:
                notch_html = ""
            tops = parse_topnotchers(notch_html) or parse_topnotchers(html)
            if not tops:
                for img in get_images_via_playwright(notch_url)[:2]:
                    tops = ocr_image(img, "topnotcher")
                    if tops:
                        break
            if tops:
                db.upsert_topnotchers(eid, tops)
                print(f"  saved {len(tops)} topnotchers")

            time.sleep(PAUSE)

        db.finish_import_job(job_id, "success", affected)
    except Exception as e:
        print(f"  ERROR: {e}")
        db.finish_import_job(job_id, "failed", affected, str(e))


def scrape_batch(targets: list) -> None:
    for code, year in targets:
        scrape(code, year)
        time.sleep(2)


def _cli() -> list:
    args = sys.argv[1:]
    if not args:
        return [("CPALE", 2025), ("NLE", 2025), ("CELE", 2025),
                ("LET-E", 2025), ("LET-S", 2025)]
    if args[0] == "--all":
        year = int(args[1]) if len(args) > 1 else 2025
        return [(c, year) for c in ALL_CODES]
    return [(args[0], int(args[1]))]


if __name__ == "__main__":
    scrape_batch(_cli())
    print("\nDone. Recompute scores:  python consistency.py")
