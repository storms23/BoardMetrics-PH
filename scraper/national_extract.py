"""Extract national pass-rate summary stats from PRC result pages."""

from __future__ import annotations

import io
import json
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.prcboard.com/",
}

PRC_SITE = "https://www.prc.gov.ph"

SUMMARY_PATTERNS: list[tuple[str, bool]] = [
    (r"([\d,]+)\s+out\s+of\s+([\d,]+)\s+\(([\d.]+)%?\)", True),
    (r"([\d,]+)\s+out\s+of\s+([\d,]+)\s+passed", False),
    (r"([\d,]+)\s+passed\s+and\s+([\d,]+)\s+failed\s+out\s+of\s+([\d,]+)", False),
    (r"passing\s+rate\s+of\s+([\d.]+)%.*?([\d,]+)\s+out\s+of\s+([\d,]+)", True),
    (r"([\d,]+)\s+examinees.*?([\d,]+)\s+passers.*?([\d.]+)%", True),
    (r"total\s+(?:number\s+of\s+)?passers[:\s]+([\d,]+).*?examinees[:\s]+([\d,]+)", False),
]


def _build_stats(passers: int, takers: int, rate: float | None = None) -> dict:
    if takers <= 0 or passers > takers:
        return {}
    pr = rate if rate is not None else round(passers / takers * 100, 2)
    return {
        "total_passers": passers,
        "total_takers": takers,
        "pass_rate": float(pr),
    }


def get_summary(text: str) -> dict | None:
    """
    Extract national exam statistics from page or PDF text.
    Handles prcboard.com "X out of Y (Z%)" and several PRC phrasings.
    """
    if not text:
        return None

    for pattern, has_rate in SUMMARY_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if not m:
            continue
        groups = m.groups()
        try:
            if has_rate and len(groups) >= 3:
                if "passing rate" in pattern:
                    rate = float(groups[0].replace(",", ""))
                    passers = int(groups[1].replace(",", ""))
                    takers = int(groups[2].replace(",", ""))
                else:
                    passers = int(groups[0].replace(",", ""))
                    takers = int(groups[1].replace(",", ""))
                    rate = float(groups[2].replace(",", "").replace("%", ""))
                stats = _build_stats(passers, takers, rate)
            elif "passed and" in pattern and len(groups) >= 3:
                passers = int(groups[0].replace(",", ""))
                failed = int(groups[1].replace(",", ""))
                takers = int(groups[2].replace(",", ""))
                stats = _build_stats(passers, takers)
            elif "examinees" in pattern and len(groups) >= 3:
                takers = int(groups[0].replace(",", ""))
                passers = int(groups[1].replace(",", ""))
                rate = float(groups[2].replace(",", "").replace("%", ""))
                stats = _build_stats(passers, takers, rate)
            elif "total" in pattern and len(groups) >= 2:
                passers = int(groups[0].replace(",", ""))
                takers = int(groups[1].replace(",", ""))
                stats = _build_stats(passers, takers)
            else:
                passers = int(groups[0].replace(",", ""))
                takers = int(groups[1].replace(",", ""))
                stats = _build_stats(passers, takers)
            if stats:
                return stats
        except (ValueError, TypeError, IndexError):
            continue
    return None


def get_date(title: str, text: str = "") -> dict:
    months = (
        r"(January|February|March|April|May|June|July|August|"
        r"September|October|November|December)"
    )
    for src in (title, text):
        m = re.search(rf"{months}\s+(20\d\d)", src, re.IGNORECASE)
        if m:
            return {"month": m.group(1).capitalize(), "year": int(m.group(2))}
    m = re.search(r"\b(20\d\d)\b", title)
    return {"month": None, "year": int(m.group(1)) if m else None}


def fetch_page(url: str, *, timeout: int = 20, retries: int = 1) -> tuple[int, str]:
    """Fetch URL; return (status_code, plain text). Retries once on failure."""
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=timeout)
            text = BeautifulSoup(resp.text, "html.parser").get_text(" ", strip=True)
            return resp.status_code, text
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < retries:
                continue
            raise last_exc
    raise RuntimeError("unreachable")


def fetch_html_raw(url: str, *, timeout: int = 25) -> tuple[int, str]:
    """Fetch URL; return (status_code, raw HTML)."""
    resp = requests.get(url, headers=HEADERS, timeout=timeout)
    return resp.status_code, resp.text


def _find_pdf_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[str] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#"):
            continue
        if href.lower().endswith(".pdf") or "uploaded/documents" in href.lower():
            full = urljoin(base_url, href)
            if full not in seen:
                seen.add(full)
                links.append(full)
    return links


def _find_stats_images(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    imgs: list[str] = []
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if not src or "logo" in src.lower() or "icon" in src.lower():
            continue
        if any(k in src.lower() for k in ("upload", "result", "passer", "banner", "wp-content")):
            imgs.append(urljoin(base_url, src))
    return imgs[:3]


def extract_summary_from_pdf_url(pdf_url: str) -> dict | None:
    """Download official PDF and extract stats from first-page text."""
    try:
        resp = requests.get(pdf_url, headers=HEADERS, timeout=60)
        if resp.status_code != 200 or resp.content[:4] != b"%PDF":
            return None
        import pdfplumber

        with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
            if not pdf.pages:
                return None
            text = pdf.pages[0].extract_text() or ""
            if len(text.strip()) < 20 and len(pdf.pages) > 1:
                text = "\n".join(
                    (p.extract_text() or "") for p in pdf.pages[:2]
                )
            return get_summary(text)
    except Exception:
        return None


def extract_stats_from_html(html: str, page_url: str) -> dict | None:
    """
    Try HTML text, linked PDFs, then image OCR (DeepSeek) for national stats.
    """
    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    stats = get_summary(text)
    if stats:
        return stats

    for pdf_url in _find_pdf_links(html, page_url)[:3]:
        stats = extract_summary_from_pdf_url(pdf_url)
        if stats:
            return stats

    try:
        from ocr_llm import extract_national_summary_from_image_url

        for img_url in _find_stats_images(html, page_url):
            stats = extract_national_summary_from_image_url(img_url)
            if stats:
                return stats
    except ImportError:
        pass

    return None


def extract_stats_from_url(url: str) -> tuple[dict | None, str]:
    """
    Fetch a results page and extract national stats.
    Returns (stats dict or None, plain text for date parsing).
    """
    try:
        status, html = fetch_html_raw(url, timeout=25)
        if status != 200:
            return None, ""
        stats = extract_stats_from_html(html, url)
        text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
        return stats, text
    except requests.RequestException:
        return None, ""
