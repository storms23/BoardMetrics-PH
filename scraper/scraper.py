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
from programs import EXAM_NAMES, KEYWORDS, PRCBOARD_SLUGS, ALL_CODES, PROGRAMS_DICT
from normalize import infer_region

# ── CONFIG ────────────────────────────────────────────────────────────────────
KEY = os.getenv("ANTHROPIC_API_KEY", "")
OCR_SPACE_KEY = os.getenv("OCR_SPACE_API_KEY", "K87217505288957")  # Default to provided key
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.prcboard.com/",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
}
PAUSE = 2  # be polite to the source server
SITE = "https://www.prcboard.com"


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
    """
    Extract national exam statistics from text.
    Handles two formats:
    - prcboard.com: "6,438 out of 18,370 (35.05%)" 
    - legacy: "6,438 out of 18,370 passed"
    """
    # Try prcboard.com format first (with percentage in parentheses)
    m = re.search(r"([\d,]+)\s+out\s+of\s+([\d,]+)\s+\(([\d.]+)%?\)", text, re.IGNORECASE)
    if m:
        passers = int(m.group(1).replace(",", ""))
        takers = int(m.group(2).replace(",", ""))
        pass_rate = float(m.group(3))
        return {
            "total_passers": passers,
            "total_takers": takers,
            "pass_rate": pass_rate,
        }
    
    # Fallback to legacy format
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


# ── EXTRACT: Google Drive PDF ─────────────────────────────────────────────────
def extract_drive_id(html: str) -> str | None:
    """Extract Google Drive file ID from iframe src or anchor href."""
    patterns = [
        r'drive\.google\.com/file/d/([A-Za-z0-9_-]+)',
        r'drive\.google\.com/uc\?.*id=([A-Za-z0-9_-]+)',
    ]
    for pattern in patterns:
        m = re.search(pattern, html)
        if m:
            return m.group(1)
    return None


def download_drive_pdf(file_id: str) -> bytes | None:
    """
    Download a Google Drive PDF, handling large-file confirmation prompts.
    Returns raw PDF bytes or None on failure.
    """
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=60)
        if r.status_code != 200:
            return None
        
        # Check for virus-scan warning page (large files)
        if b'confirm' in r.content[:2000] or b'download_warning' in r.content[:2000]:
            # Extract confirmation token
            token_match = re.search(rb'confirm=([^&"\']+)', r.content)
            if token_match:
                token = token_match.group(1).decode()
                r = requests.get(f"{url}&confirm={token}", headers=HEADERS, timeout=60)
        
        # Verify we got a PDF
        if r.content[:4] == b'%PDF':
            return r.content
        return None
    except Exception as e:
        print(f"  Drive download error: {e}")
        return None


def parse_pdf_table(pdf_bytes: bytes) -> list:
    """
    Extract school performance table from PDF using pdfplumber.
    Falls back to Claude OCR if pdfplumber returns empty (scanned PDF).
    
    Handles both Format A (4-col) and Format B (14-col PRC standard).
    """
    import io
    try:
        import pdfplumber
    except ImportError:
        print("  pdfplumber not installed; falling back to OCR")
        return ocr_pdf_claude(pdf_bytes)
    
    results = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                table = page.extract_table()
                if not table or len(table) < 2:
                    continue
                
                # Detect format: check if first data row col[0] is a number (seq no)
                sample_rows = [r for r in table[1:6] if r and len(r) > 1]
                if not sample_rows:
                    continue
                
                first_vals = [r[0] for r in sample_rows if r[0]]
                col0_is_seqno = sum(1 for v in first_vals if str(v).strip().isdigit()) >= len(first_vals) // 2
                
                for row in table[1:]:  # Skip header
                    if not row or len(row) < 3:
                        continue
                    
                    if col0_is_seqno:
                        # Format B: 14-col with seq_no in col[0], school in col[1]
                        if len(row) < 5:
                            continue
                        name = str(row[1]).strip() if row[1] else ""
                        try:
                            # Overall stats are in last 4 columns
                            passers = int(str(row[-4]).replace(",", "").strip())
                            takers = int(str(row[-2]).replace(",", "").strip())
                            pr = float(str(row[-1]).replace("%", "").replace(",", "").strip())
                        except (ValueError, TypeError, AttributeError):
                            continue
                    else:
                        # Format A: 4-col with school in col[0]
                        name = str(row[0]).strip() if row[0] else ""
                        try:
                            takers = int(str(row[1]).replace(",", "").strip())
                            passers = int(str(row[2]).replace(",", "").strip())
                            pr_raw = str(row[3] if len(row) > 3 else row[-1])
                            pr = float(pr_raw.replace("%", "").replace(",", "").strip())
                        except (ValueError, TypeError, AttributeError):
                            continue
                    
                    if not name:
                        continue
                    
                    # Skip date-like rows, purely numeric names, and header-like rows
                    if re.match(r"^(January|February|March|April|May|June|July|August|"
                               r"September|October|November|December|Jan|Feb|Mar|Apr|"
                               r"Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", name, re.IGNORECASE):
                        continue
                    if re.match(r"^\d+$", name):
                        continue
                    if re.match(r"^(School|Institution|Name|Examinee|Passer|Passed|Total|Seq|No\.?)\b",
                               name, re.IGNORECASE):
                        continue
                    
                    results.append({
                        "school": name,
                        "takers": takers,
                        "passers": passers,
                        "pass_rate": pr,
                        "rank": len(results) + 1,
                        "region": infer_region(name),
                    })
    except Exception as e:
        print(f"  pdfplumber error: {e}")
    
    # If pdfplumber found nothing, try Claude OCR (scanned PDF)
    if not results:
        print("  pdfplumber returned 0 rows; trying Claude OCR...")
        return ocr_pdf_claude(pdf_bytes)
    
    return results


def ocr_pdf_claude(pdf_bytes: bytes) -> list:
    """Use Claude to OCR a scanned PDF."""
    if not KEY:
        print("  No ANTHROPIC_API_KEY; skipping PDF OCR.")
        return []
    try:
        import anthropic
        b64 = base64.standard_b64encode(pdf_bytes).decode()
        cl = anthropic.Anthropic(api_key=KEY)
        msg = cl.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=8192,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extract every row from the school performance table. "
                            "Return ONLY valid JSON, no markdown, no explanation:\n"
                            '[{"rank":1,"school":"School Name","takers":100,'
                            '"passers":80,"pass_rate":80.0}]'
                        ),
                    },
                ],
            }],
        )
        txt = re.sub(r"```json|```", "", msg.content[0].text.strip()).strip()
        data = json.loads(txt)
        # Add region inference
        for item in data:
            if "region" not in item:
                item["region"] = infer_region(item.get("school", ""))
        return data
    except json.JSONDecodeError:
        print("  PDF OCR returned non-JSON.")
        return []
    except Exception as e:
        print(f"  PDF OCR error: {e}")
        return []


# ── EXTRACT: school table (HTML, with OCR fallback) ───────────────────────────
def parse_html_table(html: str) -> list:
    """
    Handles two table formats found in PRC results pages:

    Format A (4-col simplified, used by boardexams.ph):
      School Name | No. of Examinees | No. of Passers | % Passed

    Format B (14-col PRC standard, with breakdown):
      Seq | School | FT_Pass | FT_Fail | FT_Total | FT_% |
          | Rep_Pass | Rep_Fail | Rep_Total | Rep_% |
          | Overall_Pass | Overall_Fail | Overall_Total | Overall_%
    """
    soup = BeautifulSoup(html, "html.parser")
    best_results = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        # Need header row + at least 2 data rows
        if len(rows) < 3:
            continue

        # Sample the first few data rows to decide column layout
        sample_rows = []
        for row in rows[1:6]:
            cols = [td.get_text(strip=True) for td in row.find_all("td")]
            if cols:
                sample_rows.append(cols)
        if not sample_rows:
            continue

        # Detect column layout by checking if col[0] is a sequential number
        # (Format B) or a school name (Format A)
        first_vals = [r[0] for r in sample_rows if r]
        col0_is_seqno = sum(1 for v in first_vals if re.match(r"^\d+$", v.strip())) >= len(first_vals) // 2

        results = []
        for row in rows[1:]:
            cols = [td.get_text(strip=True) for td in row.find_all("td")]

            if col0_is_seqno:
                # Format B: col[0]=seq_no, col[1]=school, last cols are Overall
                if len(cols) < 5:
                    continue
                name = cols[1].strip() if len(cols) > 1 else ""
                # Overall performance is in the last 4 columns
                try:
                    takers  = int(str(cols[-2]).replace(",", "").strip())
                    passers = int(str(cols[-4]).replace(",", "").strip())
                    pr_raw  = cols[-1].replace("%", "").replace(",", "").strip()
                    pr      = float(pr_raw)
                except (ValueError, IndexError):
                    takers, passers, pr = None, None, None
            else:
                # Format A: col[0]=school, col[1]=takers, col[2]=passers, col[3]=pass_rate
                if len(cols) < 3:
                    continue
                name = cols[0].strip()
                try:
                    takers  = int(str(cols[1]).replace(",", "").strip())
                    passers = int(str(cols[2]).replace(",", "").strip())
                    pr_raw  = (cols[3] if len(cols) > 3 else cols[-1]).replace("%", "").replace(",", "").strip()
                    pr      = float(pr_raw)
                except (ValueError, IndexError):
                    takers, passers, pr = None, None, None

            if not name:
                continue

            # Skip rows where name is a date ("May 2016", "Sept-Oct 2023", etc.)
            if re.match(
                r"^(January|February|March|April|May|June|July|August|"
                r"September|October|November|December|Jan|Feb|Mar|Apr|"
                r"Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b",
                name, re.IGNORECASE,
            ):
                continue

            # Skip rows where name is purely numeric (stray seq-no rows)
            if re.match(r"^\d+$", name):
                continue

            # Skip header-like rows (contain keywords like "School", "Examinee")
            if re.match(r"^(School|Institution|Name|Examinee|Passer|Passed|Total|Seq|No\.?)\b",
                        name, re.IGNORECASE):
                continue

            results.append({
                "school": name,
                "takers": takers,
                "passers": passers,
                "pass_rate": pr,
                "rank": len(results) + 1,
                "region": infer_region(name),
            })

        # Keep the table with the most valid school rows
        if len(results) > len(best_results):
            best_results = results

    return best_results


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
        keywords = ["school", "performance", "result", "topnotch", "image"]
        return [
            s for s in srcs
            if s.startswith("http")
            and any(k in s.lower() for k in keywords)
            and "logo" not in s.lower()
        ]
    except Exception as e:
        print(f"  Playwright error: {e}")
        return []


def ocr_image_ocrspace(image_url: str, mode: str = "school") -> list:
    """
    OCR an image using OCR.space API (free tier: 25,000/month).
    Engine 3 is used for best table recognition.
    """
    if not OCR_SPACE_KEY:
        print("  No OCR_SPACE_API_KEY set; skipping OCR.space.")
        return []
    
    try:
        print(f"  Trying OCR.space on: {image_url[:80]}...")
        payload = {
            "url": image_url,
            "apikey": OCR_SPACE_KEY,
            "language": "eng",
            "isTable": "true",  # Line-by-line parsing for tables
            "OCREngine": "3",   # Engine 3: best for tables (returns Markdown)
            "scale": "true",    # Upscale for better accuracy
        }
        
        response = requests.post(
            "https://api.ocr.space/parse/image",
            data=payload,
            timeout=60
        )
        result = response.json()
        
        print(f"  OCR.space response: OCRExitCode={result.get('OCRExitCode')}, IsErrored={result.get('IsErroredOnProcessing')}")
        
        if result.get("IsErroredOnProcessing"):
            print(f"  OCR.space error: {result.get('ErrorMessage')}")
            return []
        
        parsed_results = result.get("ParsedResults", [])
        if not parsed_results:
            print(f"  OCR.space: No ParsedResults")
            return []
            
        exit_code = parsed_results[0].get("FileParseExitCode")
        if exit_code != 1:
            print(f"  OCR.space parse failed: FileParseExitCode={exit_code}, Error={parsed_results[0].get('ErrorMessage')}")
            return []
        
        text = parsed_results[0].get("ParsedText", "")
        if not text:
            print(f"  OCR.space: Empty ParsedText")
            return []
        
        print(f"  OCR.space extracted {len(text)} characters, {len(text.split())} words")
        
        # Parse the OCR text into structured data
        # For school mode: extract table rows
        if mode == "school":
            return parse_school_table_from_text(text)
        else:  # topnotcher mode
            return parse_topnotcher_from_text(text)
            
    except Exception as e:
        print(f"  OCR.space exception: {e}")
        import traceback
        traceback.print_exc()
        return []


def parse_school_table_from_text(text: str) -> list:
    """Parse school performance table from OCR text."""
    schools = []
    lines = text.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Try to extract: rank, school name, takers, passers, pass_rate
        # Common patterns:
        # "1 UNIVERSITY OF SANTO TOMAS 100 95 95.00%"
        # "1 | UNIVERSITY OF SANTO TOMAS | 100 | 95 | 95.00%"
        
        # Remove common table separators
        line = line.replace("|", " ").replace("\t", " ")
        
        # Extract numbers (rank, takers, passers, percentage)
        import re
        numbers = re.findall(r"[\d,]+\.?\d*", line)
        if len(numbers) < 3:  # Need at least rank, takers, passers
            continue
        
        # Try to extract school name (text between first number and subsequent numbers)
        match = re.match(r"^\s*(\d+)\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)", line)
        if not match:
            continue
        
        rank, school, takers, passers, pass_rate = match.groups()
        
        # Clean up
        school = school.strip()
        takers = int(takers.replace(",", ""))
        passers = int(passers.replace(",", ""))
        pass_rate = float(pass_rate)
        
        # Skip header rows
        if "school" in school.lower() or "institution" in school.lower():
            continue
        
        schools.append({
            "rank": int(rank),
            "school": school,
            "takers": takers,
            "passers": passers,
            "pass_rate": pass_rate,
            "region": infer_region(school),
        })
    
    return schools


def parse_topnotcher_from_text(text: str) -> list:
    """Parse topnotchers list from OCR text."""
    topnotchers = []
    lines = text.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Pattern: "1 DELA CRUZ, JUAN A. UNIVERSITY OF XYZ 92.50"
        import re
        match = re.match(r"^\s*(\d+)\s+([A-Z\s,.-]+?)\s+([A-Z\s.-]+?)\s+([\d.]+)", line)
        if not match:
            continue
        
        rank, name, school, rating = match.groups()
        
        topnotchers.append({
            "rank": int(rank),
            "name": name.strip(),
            "school": school.strip(),
            "rating": float(rating),
        })
    
    return topnotchers


def ocr_image(image_url: str, mode: str = "school") -> list:
    """
    OCR an image using OCR.space first, then fall back to Claude if needed.
    """
    # Try OCR.space first (free, fast, good for tables)
    schools = ocr_image_ocrspace(image_url, mode)
    if schools:
        return schools
    
    # Fall back to Claude Vision OCR (requires credits)
    if not KEY:
        print("  No ANTHROPIC_API_KEY set; skipping Claude OCR fallback.")
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
        
        # Detect image type from URL extension
        media_type = "image/png" if image_url.lower().endswith(".png") else "image/jpeg"
        
        cl = anthropic.Anthropic(api_key=KEY)
        msg = cl.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image",
                     "source": {"type": "base64", "media_type": media_type, "data": b64}},
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
def scrape_direct_url(exam_code: str, year: int, month: str) -> None:
    """
    Scrape a specific exam by constructing the URL directly (no WordPress API search).
    Used when we know the month and URL pattern.
    """
    prog = PROGRAMS_DICT.get(exam_code)
    if not prog:
        print(f"  Unknown exam code: {exam_code}")
        return
    
    prcboard_slug = prog["prcboard_slug"]
    exam_name_slug = prog["exam_name"].lower().replace(" licensure examination", "").replace(" ", "-")
    
    # Construct known URL patterns
    month_lower = month.lower()
    main_url = f"{SITE}/{prcboard_slug}-results-{month_lower}-{year}-{exam_name_slug}-list-of-passers"
    school_url = f"{SITE}/top-schools-{month_lower}-{year}-{prcboard_slug}-results"
    
    print(f"\n{'='*55}")
    print(f"  {exam_code} {month} {year} — {prog['exam_name']}")
    print(f"  Main URL: {main_url}")
    print(f"  School URL: {school_url}")
    print(f"{'='*55}")
    
    job_id = db.start_import_job(exam_code, year)
    affected = 0
    
    try:
        # Step 1: Try to fetch main results page for summary stats
        try:
            r = requests.get(main_url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                html = r.text
                text = BeautifulSoup(html, "html.parser").get_text()
                stats = get_summary(text)
                if stats:
                    print(f"  {stats['total_passers']:,}/{stats['total_takers']:,} ({stats['pass_rate']}%)")
                    eid = db.upsert_exam_result(exam_code, month, year, stats, main_url)
                    db.audit("import", "exam_results", eid, {"exam_code": exam_code, "year": year, "month": month})
                else:
                    print(f"  ⚠ No summary stats found on main page")
                    # Create a minimal exam_result anyway so we can still save schools
                    eid = db.upsert_exam_result(exam_code, month, year, 
                        {"total_passers": 0, "total_takers": 0, "pass_rate": 0.0}, main_url)
            else:
                print(f"  ⚠ Main page returned {r.status_code}")
                # Create minimal exam_result
                eid = db.upsert_exam_result(exam_code, month, year,
                    {"total_passers": 0, "total_takers": 0, "pass_rate": 0.0}, main_url)
        except Exception as e:
            print(f"  ⚠ Error fetching main page: {e}")
            # Create minimal exam_result
            eid = db.upsert_exam_result(exam_code, month, year,
                {"total_passers": 0, "total_takers": 0, "pass_rate": 0.0}, main_url)
        
        # Step 2: Fetch top-schools page and extract school data
        try:
            r = requests.get(school_url, headers=HEADERS, timeout=15)
            if r.status_code != 200:
                print(f"  ⚠ School page returned {r.status_code}")
                db.finish_import_job(job_id, "success", 0, f"school page {r.status_code}")
                return
            
            html = r.text
            schools = []
            
            # Try 1: HTML table extraction
            schools = parse_html_table(html)
            if schools:
                print(f"  Extracted {len(schools)} schools from HTML table")
            
            # Try 2: Image extraction (wp-content/uploads images)
            if not schools:
                soup = BeautifulSoup(html, "html.parser")
                imgs = soup.find_all("img", src=re.compile(r"wp-content/uploads/.*\.(png|jpe?g)", re.I))
                print(f"  Found {len(imgs)} images in HTML")
                for img in imgs[:3]:
                    img_url = img.get("src", "")
                    if not img_url.startswith("http"):
                        img_url = SITE + img_url
                    print(f"  Trying image: {img_url}")
                    schools = ocr_image(img_url, "school")
                    if schools:
                        print(f"  Extracted {len(schools)} schools from image OCR")
                        break
            
            # Try 3: Playwright screenshot of the page (captures embedded Drive viewer)
            if not schools:
                print(f"  Trying Playwright screenshot of school page...")
                try:
                    from playwright.sync_api import sync_playwright
                    with sync_playwright() as p:
                        browser = p.chromium.launch(headless=True)
                        page = browser.new_page()
                        page.goto(school_url, timeout=30000, wait_until="networkidle")
                        page.wait_for_timeout(3000)  # Wait for Drive embed to load
                        screenshot = page.screenshot(full_page=True)
                        browser.close()
                        
                        # OCR the screenshot using OCR.space (base64)
                        if OCR_SPACE_KEY:
                            print(f"  Trying OCR.space on Playwright screenshot...")
                            b64 = base64.standard_b64encode(screenshot).decode()
                            payload = {
                                "base64Image": f"data:image/png;base64,{b64}",
                                "apikey": OCR_SPACE_KEY,
                                "language": "eng",
                                "isTable": "true",
                                "OCREngine": "3",
                                "scale": "true",
                            }
                            response = requests.post("https://api.ocr.space/parse/image", data=payload, timeout=120)
                            result = response.json()
                            
                            print(f"  OCR.space response: OCRExitCode={result.get('OCRExitCode')}, IsErrored={result.get('IsErroredOnProcessing')}")
                            
                            if not result.get("IsErroredOnProcessing") and result.get("ParsedResults"):
                                parsed = result["ParsedResults"][0]
                                if parsed.get("FileParseExitCode") == 1:
                                    text = parsed.get("ParsedText", "")
                                    print(f"  OCR.space extracted {len(text)} characters from screenshot")
                                    schools = parse_school_table_from_text(text)
                                    if schools:
                                        print(f"  Extracted {len(schools)} schools from Playwright screenshot (OCR.space)")
                                else:
                                    print(f"  OCR.space FileParseExitCode={parsed.get('FileParseExitCode')}, Error={parsed.get('ErrorMessage')}")
                            else:
                                print(f"  OCR.space processing error: {result.get('ErrorMessage')}")
                        else:
                            print(f"  No OCR_SPACE_API_KEY; skipping OCR.space screenshot OCR")
                        
                        # Fallback to Claude if OCR.space failed and key is available
                        if not schools and KEY:
                            import anthropic
                            b64 = base64.standard_b64encode(screenshot).decode()
                            cl = anthropic.Anthropic(api_key=KEY)
                            msg = cl.messages.create(
                                model="claude-sonnet-4-5",
                                max_tokens=8192,
                                messages=[{
                                    "role": "user",
                                    "content": [
                                        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                                        {"type": "text", "text": (
                                            "Extract the school performance table. Return ONLY valid JSON:\n"
                                            '[{"rank":1,"school":"School Name","takers":100,"passers":80,"pass_rate":80.0}]'
                                        )},
                                    ],
                                }],
                            )
                            txt = re.sub(r"```json|```", "", msg.content[0].text.strip()).strip()
                            schools = json.loads(txt)
                            for item in schools:
                                if "region" not in item:
                                    item["region"] = infer_region(item.get("school", ""))
                            print(f"  Extracted {len(schools)} schools from Playwright screenshot (Claude)")
                except Exception as e:
                    print(f"  Playwright OCR error: {e}")
            
            if schools:
                affected += db.upsert_school_performance(eid, schools)
                print(f"  ✓ Saved {len(schools)} schools")
            else:
                print("  ⚠ No school data found")
        
        except Exception as e:
            print(f"  Error processing schools: {e}")
            import traceback
            traceback.print_exc()
        
        db.finish_import_job(job_id, "success", affected)
    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()
        db.finish_import_job(job_id, "failed", affected, str(e))


def scrape(exam_code: str, year: int) -> None:
    """
    Scrape exam results for a given year by trying all typical exam cycles.
    Uses direct URL construction instead of WordPress API search (which is unreliable).
    """
    from programs import EXAM_CYCLES
    
    prog = PROGRAMS_DICT.get(exam_code)
    if not prog:
        print(f"\n⚠ Unknown exam code: {exam_code}")
        return
    
    # Get typical exam months for this program
    typical_months = EXAM_CYCLES.get(exam_code, ["March", "June", "September", "December"])
    
    print(f"\n{'='*55}")
    print(f"  {exam_code} {year} — {prog['exam_name']}")
    print(f"  Will try months: {', '.join(typical_months)}")
    print(f"{'='*55}")
    
    success_count = 0
    for month in typical_months:
        try:
            scrape_direct_url(exam_code, year, month)
            success_count += 1
        except Exception as e:
            print(f"  Error scraping {month} {year}: {e}")
    
    if success_count == 0:
        print(f"  ⚠ No data found for {exam_code} {year}")


def scrape_legacy(exam_code: str, year: int) -> None:
    name = EXAM_NAMES.get(exam_code, exam_code)
    print(f"\n{'='*55}\n  {exam_code} {year} — {name}\n{'='*55}")

    job_id = db.start_import_job(exam_code, year)
    affected = 0
    try:
        # Step 1: discover posts on prcboard.com
        # prcboard.com has TWO pages per exam:
        #   1. Main results page: has summary stats ("X out of Y (Z%) passed")
        #   2. Top-schools page: has school performance data (PDF/image)
        
        prcboard_slug = PRCBOARD_SLUGS.get(exam_code, exam_code.lower())
        exam_name = EXAM_NAMES.get(exam_code, "")
        # Extract key words from exam name (e.g., "Civil Engineers" from "Civil Engineers Licensure Examination")
        exam_keywords = [w for w in exam_name.split() if len(w) > 4 and w.lower() not in ["licensure", "examination", "exam", "board"]][:3]
        
        # Search for main results pages (contains summary stats)
        # Try multiple search strategies: keywords, slug pattern, exam code
        main_posts = []
        
        # Strategy 1: Keyword-based search (e.g., "Civil Engineers results 2026")
        search_terms = [" ".join(exam_keywords[:2]), exam_code] if exam_keywords else [exam_code]
        for search_term in search_terms:
            posts = wp_search(f"{search_term} results {year}", n=30)
            print(f"  DEBUG: WordPress search '{search_term} results {year}' returned {len(posts)} posts")
            # Filter to main results posts (title starts with exam code + "RESULTS:" or contains "List of Passers")
            main_posts = [
                p for p in posts 
                if BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().upper().startswith((exam_code + " RESULTS", prcboard_slug.upper() + " RESULTS"))
                or ("list of passers" in BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().lower()
                    and exam_code.lower() in BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().lower())
            ]
            print(f"  DEBUG: After title filter, {len(main_posts)} posts remain")
            # Exclude alphabetical passer lists (A-C, D-F, etc.) and support pages
            main_posts = [
                p for p in main_posts
                if not re.match(r'^[A-Z]-[A-Z]\s+', BeautifulSoup(p["title"]["rendered"], "html.parser").get_text())
                and not BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().upper().startswith(("TOP SCHOOLS", "TOPNOTCHERS", "TOP 10", "ROOM ASSIGNMENTS"))
            ]
            if main_posts:
                print(f"  Found {len(main_posts)} main result posts for {exam_code} (search: {search_term})")
                break
        
        # Strategy 2: If keyword search fails, try finding posts by slug pattern match
        # prcboard.com uses: /{slug}-results-{month}-{year}-...-list-of-passers
        if not main_posts:
            posts = wp_search(f"{prcboard_slug} {year}", n=50)
            for p in posts:
                title_lower = BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().lower()
                slug_lower = p.get("slug", "").lower()
                # Match: title contains "results" and "list of passers", OR slug matches pattern
                if (("results" in title_lower and "list of passers" in title_lower) 
                    or f"{prcboard_slug}-results" in slug_lower):
                    # Exclude support pages and alphabetical lists
                    if (not re.match(r'^[A-Z]-[A-Z]\s+', BeautifulSoup(p["title"]["rendered"], "html.parser").get_text())
                        and not BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().upper().startswith(("TOP SCHOOLS", "TOPNOTCHERS", "TOP 10", "ROOM ASSIGNMENTS"))):
                        main_posts.append(p)
            if main_posts:
                print(f"  Found {len(main_posts)} main result posts for {exam_code} (slug pattern match)")

        
        # Search for top-schools pages (contains school performance PDF)
        school_posts = []
        for pattern in [f"top schools {year} {prcboard_slug}", f"{year} {prcboard_slug} performance"]:
            posts = wp_search(pattern, n=20)
            # Filter to posts for this specific exam
            school_posts = [
                p for p in posts
                if exam_code.lower() in BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().lower()
                or any(kw in BeautifulSoup(p["title"]["rendered"], "html.parser").get_text().lower()
                       for kw in exam_name_keywords if len(kw) > 4)
            ]
            if school_posts:
                print(f"  Found {len(school_posts)} top-school posts for {exam_code}")
                break
        
        if not main_posts and not school_posts:
            print("  No posts found on prcboard.com.")
            db.finish_import_job(job_id, "success", 0, "no posts")
            return

        # Step 2: Process main results pages for summary stats
        processed_exams = set()
        
        for post in main_posts[:5]:  # Check top 5 main posts
            title = BeautifulSoup(post["title"]["rendered"], "html.parser").get_text()
            url = post["link"]
            html = wp_get_content(post["id"])
            text = BeautifulSoup(html, "html.parser").get_text()

            stats = get_summary(text)
            date = get_date(title, text)
            
            if not stats:
                print(f"  No summary stats in: {title[:50]}")
                continue

            # Skip posts whose extracted year doesn't match the target year
            if date["year"] and abs(date["year"] - year) > 1:
                print(f"  Skipping post year={date['year']} (target={year}): {title[:60]}")
                continue

            exam_key = (date["month"], date["year"])
            if exam_key in processed_exams:
                continue
            processed_exams.add(exam_key)

            print(f"  {stats['total_passers']:,}/{stats['total_takers']:,} "
                  f"({stats['pass_rate']}%) — {date['month']} {date['year']}")

            eid = db.upsert_exam_result(exam_code, date["month"], date["year"], stats, url)
            db.audit("import", "exam_results", eid, {"exam_code": exam_code, "year": year})

        # Step 3: Process top-schools pages for school performance data
        for post in school_posts[:5]:  # Check top 5 school posts
            title = BeautifulSoup(post["title"]["rendered"], "html.parser").get_text()
            url = post["link"]
            html = wp_get_content(post["id"])
            text = BeautifulSoup(html, "html.parser").get_text()

            date = get_date(title, text)
            
            # Skip posts whose extracted year doesn't match target
            if date["year"] and abs(date["year"] - year) > 1:
                print(f"  Skipping school post year={date['year']}: {title[:60]}")
                continue

            # Find the exam_result record for this exam cycle
            exam_key = (date["month"], date["year"])
            if exam_key not in processed_exams:
                print(f"  No exam record for {date['month']} {date['year']}, skipping schools")
                continue

            # Get the exam_result_id
            try:
                eid_row = db.client().from_("exam_results").select("id").eq(
                    "program_id", 
                    db.client().from_("programs").select("id").eq("exam_code", exam_code).single().data["id"]
                ).eq("month", date["month"]).eq("year", date["year"]).maybe_single().execute()
                
                if not eid_row.data:
                    print(f"  No exam_result_id found for {date['month']} {date['year']}")
                    continue
                eid = eid_row.data["id"]
            except Exception as e:
                print(f"  Error finding exam_result: {e}")
                continue

            print(f"  Processing schools for {date['month']} {date['year']}")

            # ──────────────────────────────────────────────────────────────────
            # Extract school performance: PDF → HTML → Image OCR
            # ──────────────────────────────────────────────────────────────────
            schools = []
            
            # Try 1: Google Drive PDF embed
            drive_id = extract_drive_id(html)
            if drive_id:
                print(f"  Found Drive PDF: {drive_id}")
                pdf_bytes = download_drive_pdf(drive_id)
                if pdf_bytes:
                    schools = parse_pdf_table(pdf_bytes)
                    if schools:
                        print(f"  Extracted {len(schools)} schools from PDF")
            
            # Try 2: HTML table (legacy format)
            if not schools:
                schools = parse_html_table(html)
                if schools:
                    print(f"  Extracted {len(schools)} schools from HTML table")
            
            # Try 3: Image OCR fallback
            if not schools:
                for img in get_images_via_playwright(url)[:3]:
                    schools = ocr_image(img, "school")
                    if schools:
                        print(f"  Extracted {len(schools)} schools from image OCR")
                        break
                    time.sleep(0.5)
            
            if schools:
                affected += db.upsert_school_performance(eid, schools)
                print(f"  ✓ Saved {len(schools)} schools")
            else:
                print("  ⚠ No school data found")

            # Topnotchers (try main post URL and top-schools URL)
            notch_url = (url.replace("top-schools", "topnotchers")
                            .replace("performance-of-schools", "topnotchers"))
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
                print(f"  ✓ Saved {len(tops)} topnotchers")

            time.sleep(PAUSE)

        db.finish_import_job(job_id, "success", affected)
    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()
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
