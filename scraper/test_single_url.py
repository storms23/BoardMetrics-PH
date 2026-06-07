#!/usr/bin/env python3
"""
Test scraper on a SINGLE known-working URL
Fast iteration to prove extraction methods work
"""

import os
import sys
import requests
from bs4 import BeautifulSoup
import re
import base64
import json

# Configuration
URL = "https://www.prcboard.com/top-schools-march-2026-cele-results"
SITE = "https://www.prcboard.com"
OCR_SPACE_KEY = os.getenv("OCR_SPACE_API_KEY", "K87217505288957")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.prcboard.com/",
}


def parse_school_table_from_text(text: str) -> list:
    """Parse OCR.space text output into school records"""
    schools = []
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    
    for line in lines:
        # Try pipe-delimited format first (OCR.space markdown tables)
        # Format: | 1 | UNIVERSITY NAME | 139 | 113 | 81.29% |
        if "|" in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 5:
                try:
                    # Skip header and separator rows
                    if parts[0].upper() in ("RANK", "---", "---|"):
                        continue
                    
                    rank = int(parts[0])
                    school = parts[1].strip()
                    takers = int(parts[2].replace(",", ""))
                    passers = int(parts[3].replace(",", ""))
                    rate = float(parts[4].replace("%", "").strip())
                    
                    schools.append({
                        "rank": rank,
                        "school": school,
                        "takers": takers,
                        "passers": passers,
                        "pass_rate": rate,
                    })
                    continue
                except (ValueError, IndexError):
                    pass
        
        # Fallback: space-delimited format
        # Format: "1 MAPUA UNIVERSITY 441 411 93.20"
        m = re.match(r"^(\d+)\s+(.+?)\s+(\d+)\s+(\d+)\s+([\d.]+)\s*%?\s*$", line, re.I)
        if m:
            rank, school, takers, passers, rate = m.groups()
            schools.append({
                "rank": int(rank),
                "school": school.strip(),
                "takers": int(takers),
                "passers": int(passers),
                "pass_rate": float(rate),
            })
    
    return schools


print(f"Testing URL: {URL}\n")
print("=" * 70)

# STEP 1: Fetch the page HTML
print("\n1. Fetching page HTML...")
try:
    resp = requests.get(URL, headers=HEADERS, timeout=30)
    html = resp.text
    print(f"   ✓ Got HTML ({len(html)} chars, status {resp.status_code})")
    
    # Save HTML for inspection
    with open("/tmp/scraped_page.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"   ✓ Saved HTML to /tmp/scraped_page.html for inspection")
    
    # Show first 2000 chars
    print(f"\n   First 2000 characters of HTML:")
    print(f"   {'-' * 60}")
    print(f"   {html[:2000]}")
    print(f"   {'-' * 60}")
    
except Exception as e:
    print(f"   ✗ Failed to fetch: {e}")
    sys.exit(1)

soup = BeautifulSoup(html, "html.parser")

# STEP 2: Try to find Google Drive PDF ID
print("\n2. Looking for Google Drive PDF...")
drive_id = None
try:
    # Check iframes
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src", "")
        m = re.search(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)", src)
        if m:
            drive_id = m.group(1)
            print(f"   ✓ Found Drive ID in iframe: {drive_id}")
            break
    
    # Check links if no iframe
    if not drive_id:
        for a in soup.find_all("a", href=True):
            m = re.search(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)", a["href"])
            if m:
                drive_id = m.group(1)
                print(f"   ✓ Found Drive ID in link: {drive_id}")
                break
    
    if not drive_id:
        print("   ⚠ No Google Drive ID found")
except Exception as e:
    print(f"   ✗ Error: {e}")

# STEP 3: Try to find wp-content/uploads images
print("\n3. Looking for wp-content/uploads images...")
try:
    all_imgs = soup.find_all("img")
    wp_imgs = [img for img in all_imgs if img.get("src") and "wp-content/uploads" in img.get("src", "")]
    print(f"   Found {len(wp_imgs)} wp-content/uploads images")
    
    for idx, img in enumerate(wp_imgs[:3], 1):
        img_url = img.get("src", "")
        # Ensure absolute URL
        if img_url.startswith("//"):
            img_url = "https:" + img_url
        elif img_url.startswith("/"):
            img_url = SITE + img_url
        elif not img_url.startswith("http"):
            img_url = SITE + "/" + img_url
        
        print(f"   [{idx}] {img_url}")
        
        # Try OCR.space on this image
        if OCR_SPACE_KEY:
            print(f"       Trying OCR.space...")
            try:
                payload = {
                    "url": img_url,
                    "apikey": OCR_SPACE_KEY,
                    "language": "eng",
                    "isTable": "true",
                    "OCREngine": "3",
                    "scale": "true",
                }
                ocr_resp = requests.post("https://api.ocr.space/parse/image", data=payload, timeout=120)
                result = ocr_resp.json()
                
                if not result.get("IsErroredOnProcessing") and result.get("ParsedResults"):
                    parsed = result["ParsedResults"][0]
                    if parsed.get("FileParseExitCode") == 1:
                        text = parsed.get("ParsedText", "")
                        print(f"       ✓ OCR.space extracted {len(text)} characters")
                        schools = parse_school_table_from_text(text)
                        if schools:
                            print(f"       ✓ ✓ ✓ EXTRACTED {len(schools)} SCHOOLS!")
                            print(f"\n       Sample schools:")
                            for s in schools[:5]:
                                print(f"         {s['rank']}. {s['school']} - {s['pass_rate']}%")
                            print(f"\n       ✅ SUCCESS! Image OCR works!")
                            sys.exit(0)
                        else:
                            print(f"       ⚠ Could not parse schools from OCR text")
                            print(f"       First 500 chars: {text[:500]}")
                    else:
                        print(f"       ✗ FileParseExitCode={parsed.get('FileParseExitCode')}")
                else:
                    print(f"       ✗ OCR error: {result.get('ErrorMessage')}")
            except Exception as e:
                print(f"       ✗ OCR error: {e}")
        else:
            print(f"       (No OCR_SPACE_API_KEY)")

except Exception as e:
    print(f"   ✗ Error: {e}")

# STEP 4: Try Playwright screenshot (last resort)
print("\n4. Trying Playwright screenshot (this may take 30-60s)...")
try:
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        print("   Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print(f"   Loading {URL}...")
        page.goto(URL, timeout=60000, wait_until="networkidle")
        page.wait_for_timeout(5000)
        
        # Get the rendered HTML after JavaScript
        rendered_html = page.content()
        with open("/tmp/playwright_rendered.html", "w", encoding="utf-8") as f:
            f.write(rendered_html)
        print(f"   ✓ Saved Playwright-rendered HTML ({len(rendered_html)} chars)")
        
        # Check for Drive iframe in rendered HTML
        if "drive.google.com" in rendered_html:
            print(f"   ✓ Found 'drive.google.com' in rendered HTML!")
        else:
            print(f"   ⚠ NO 'drive.google.com' found in rendered HTML")
        
        if "wp-content/uploads" in rendered_html:
            print(f"   ✓ Found 'wp-content/uploads' in rendered HTML!")
        else:
            print(f"   ⚠ NO 'wp-content/uploads' found in rendered HTML")
        
        # Try iframe first
        screenshot = None
        try:
            print("   Looking for Drive iframe...")
            iframe = page.frame_locator('iframe[src*="drive.google.com"]').first
            if iframe:
                print("   Screenshotting iframe content...")
                screenshot = iframe.locator('body').screenshot(timeout=15000)
                print(f"   ✓ Got iframe screenshot ({len(screenshot)} bytes)")
        except Exception as e:
            print(f"   ⚠ Iframe screenshot failed: {e}")
        
        # Fallback to full page
        if not screenshot:
            print("   Screenshotting full page...")
            screenshot = page.screenshot(full_page=True, timeout=60000)
            print(f"   ✓ Got full page screenshot ({len(screenshot)} bytes)")
        
        browser.close()
        
        # Try OCR.space on screenshot
        if OCR_SPACE_KEY:
            print("   Trying OCR.space on screenshot...")
            try:
                b64 = base64.standard_b64encode(screenshot).decode()
                payload = {
                    "base64Image": f"data:image/png;base64,{b64}",
                    "apikey": OCR_SPACE_KEY,
                    "language": "eng",
                    "isTable": "true",
                    "OCREngine": "3",
                    "scale": "true",
                }
                ocr_resp = requests.post("https://api.ocr.space/parse/image", data=payload, timeout=120)
                result = ocr_resp.json()
                
                if not result.get("IsErroredOnProcessing") and result.get("ParsedResults"):
                    parsed = result["ParsedResults"][0]
                    if parsed.get("FileParseExitCode") == 1:
                        text = parsed.get("ParsedText", "")
                        print(f"   ✓ OCR.space extracted {len(text)} characters")
                        schools = parse_school_table_from_text(text)
                        if schools:
                            print(f"   ✓ ✓ ✓ EXTRACTED {len(schools)} SCHOOLS!")
                            print(f"\n   Sample schools:")
                            for s in schools[:5]:
                                print(f"     {s['rank']}. {s['school']} - {s['pass_rate']}%")
                            print(f"\n   ✅ SUCCESS! Playwright screenshot OCR works!")
                            sys.exit(0)
                        else:
                            print(f"   ⚠ Could not parse schools from OCR text")
                            print(f"   First 1000 chars: {text[:1000]}")
                    else:
                        print(f"   ✗ FileParseExitCode={parsed.get('FileParseExitCode')}")
                else:
                    print(f"   ✗ OCR error: {result.get('ErrorMessage')}")
            except Exception as e:
                print(f"   ✗ OCR error: {e}")
        
except Exception as e:
    print(f"   ✗ Playwright error: {e}")

print("\n" + "=" * 70)
print("❌ All extraction methods failed for this URL")
print("\nDEBUG INFO COLLECTED:")
print(f"  - Page loads: {resp.status_code}")
print(f"  - HTML size: {len(html)} chars")
print(f"  - Drive ID found: {drive_id or 'No'}")
print(f"  - wp-content images found: {len(wp_imgs)}")
print(f"  - OCR.space API key: {'Yes' if OCR_SPACE_KEY else 'No'}")
