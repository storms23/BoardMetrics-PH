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

# STEP 1: Fetch the page HTML with Playwright (handles JavaScript + avoids some blocks)
print("\n1. Fetching page with Playwright (handles JavaScript)...")
screenshot = None
rendered_html = ""
try:
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        print("   Launching browser...")
        # Use non-headless mode simulation to avoid detection
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1920, "height": 1080},
            locale='en-US',
        )
        page = context.new_page()
        
        # Add stealth JavaScript
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)
        
        print(f"   Loading {URL}...")
        page.goto(URL, timeout=60000, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)  # Long wait for content to load
        
        # Get the rendered HTML
        rendered_html = page.content()
        print(f"   ✓ Page loaded ({len(rendered_html)} chars)")
        
        # Save for inspection
        with open("/tmp/playwright_rendered.html", "w", encoding="utf-8") as f:
            f.write(rendered_html)
        
        # Check for content
        has_drive = "drive.google.com" in rendered_html
        has_wp = "wp-content/uploads" in rendered_html
        has_cloudflare = "cloudflare" in rendered_html.lower() or "please wait" in rendered_html.lower()
        
        print(f"   Drive iframe: {'✓' if has_drive else '✗'}")
        print(f"   wp-content images: {'✓' if has_wp else '✗'}")
        print(f"   Cloudflare block: {'✓ (BLOCKED!)' if has_cloudflare else '✗'}")
        
        # Take screenshot anyway
        if not has_cloudflare:
            screenshot = page.screenshot(full_page=True, timeout=30000)
            print(f"   ✓ Screenshot taken ({len(screenshot)} bytes)")
        
        browser.close()

except Exception as e:
    print(f"   ✗ Playwright error: {e}")
    rendered_html = ""

# Use rendered HTML for parsing
html = rendered_html if rendered_html else ""
if not html:
    print("   Falling back to requests.get...")
    try:
        resp = requests.get(URL, headers=HEADERS, timeout=30)
        html = resp.text
        print(f"   ✓ Got HTML ({len(html)} chars, status {resp.status_code})")
    except Exception as e:
        print(f"   ✗ Failed to fetch: {e}")
        sys.exit(1)

# STEP 2: Use screenshot if we got one from Playwright
if screenshot:
    print("\n2. Using Playwright screenshot from step 1...")
    if OCR_SPACE_KEY:
        print("   Trying OCR.space...")
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
                        print(f"   ✓ ✓ ✓ EXTRACTED {len(schools)} SCHOOLS FROM SCREENSHOT!")
                        print(f"\n   Sample schools:")
                        for s in schools[:5]:
                            print(f"     {s['rank']}. {s['school']} - {s['pass_rate']}%")
                        print(f"\n   ✅ SUCCESS!")
                        sys.exit(0)
                    else:
                        print(f"   ⚠ Could not parse schools")
                        print(f"   First 1000 chars: {text[:1000]}")
        except Exception as e:
            print(f"   ✗ OCR error: {e}")
else:
    print("\n2. No screenshot from Playwright (skipping)")

soup = BeautifulSoup(html, "html.parser") if html else None

# STEP 3: Try to find Google Drive PDF ID
print("\n3. Looking for Google Drive PDF...")
if soup:
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
else:
    print("   ✗ No HTML to parse")

# STEP 4: Try to find wp-content/uploads images
print("\n4. Looking for wp-content/uploads images...")
if soup:
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
                                print(f"       ✓ ✓ ✓ EXTRACTED {len(schools)} SCHOOLS FROM IMAGE!")
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
else:
    print("   ✗ No HTML to parse")

print("\n" + "=" * 70)
print("❌ All extraction methods failed for this URL")
print("\nDEBUG INFO COLLECTED:")
print(f"  - Page loads: Yes ({len(html)} chars)")
print(f"  - Screenshot taken: {'Yes' if screenshot else 'No'}")
print(f"  - Drive ID found: {drive_id or 'No'}")
print(f"  - wp-content images found: {len(wp_imgs) if soup else 0}")
print(f"  - OCR.space API key: {'Yes' if OCR_SPACE_KEY else 'No'}")
