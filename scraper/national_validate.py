"""Strict validation for national pass-rate rows before DB upsert."""

from __future__ import annotations

import re

from programs import EXAM_CYCLES, PROGRAMS_DICT

EXCLUDE_TITLE_RE = re.compile(
    r"top[\s-]?schools|topnotchers|performance[\s-]?of[\s-]?schools|"
    r"room\s+assignment|procurement|advisory|cancellation|"
    r"passers\s*\([A-Z]-[A-Z]\)|passers\s*\([A-Z]\s*-\s*[A-Z]\)|"
    r"^[A-Z]-[A-Z]\s+|master\s+plumber|\bmple\b",
    re.I,
)

PARTIAL_ROLL_RE = re.compile(
    r"passers\s*\([A-Z]-[A-Z]\)|passers\s*\([A-Z]\s*-\s*[A-Z]\)|"
    r"\([A-Z]-[A-Z]\)\s*$|sple\b",
    re.I,
)

MIN_EXAM_SCORE = 5

# Generic words from exam names that appear on many unrelated PRC pages.
_GENERIC_NAME_PARTS = frozenset({
    "registered", "engineers", "engineer", "licensure", "examination",
    "examinations", "board", "professional", "results", "passers", "list",
})

SOURCE_PRIORITY = {
    "prc.gov.ph": 3,
    "prcboard.com": 2,
    "prcboard.com/direct": 1,
}


def _code_in_text(code: str, text: str) -> bool:
    """Avoid substring false positives (e.g. CLE inside 'civil', PLE inside 'ptle')."""
    c = code.lower()
    if len(c) <= 4:
        return bool(re.search(rf"\b{re.escape(c)}\b", text))
    return c in text


def _keyword_in_text(keyword: str, text: str) -> bool:
    """Match scrape keywords without substring false positives on short tokens."""
    kw = keyword.lower().strip()
    if len(kw) <= 4:
        return bool(re.search(rf"\b{re.escape(kw)}\b", text))
    return kw in text


def _slug_in_text(slug: str, text: str) -> bool:
    """Match prcboard slug without substring false positives (ree in released)."""
    s = slug.lower().strip()
    if len(s) <= 4:
        return bool(re.search(rf"\b{re.escape(s)}\b", text))
    return s in text


def exam_inference_score(url: str, title: str, exam_code: str) -> int:
    """Score how well page content matches the expected exam (no hint bypass)."""
    text = f"{url} {title}".lower()
    prog = PROGRAMS_DICT[exam_code]
    score = 0
    if _slug_in_text(prog["prcboard_slug"], text):
        score += 10
    if prog["slug"].replace("-", " ") in text:
        score += 8
    if _code_in_text(exam_code, text):
        score += 6
    for kw in prog["keywords"]:
        if _keyword_in_text(kw, text):
            score += 5
    name_parts = [
        w for w in prog["exam_name"].lower().split()
        if w not in _GENERIC_NAME_PARTS
        and w not in ("for", "the", "and", "/")
        and len(w) > 3
    ]
    score += sum(3 for p in name_parts[:4] if p in text)
    return score


def inference_text(url: str, title: str, page_text: str = "") -> str:
    """Combine URL, title, and optional page snippet for exam matching."""
    snippet = (page_text or "")[:800]
    return f"{url} {title} {snippet}".strip()


def infer_exam_from_content(url: str, title: str, page_text: str = "") -> str:
    """Best exam_code for page content; UNKNOWN if no confident match."""
    from programs import ALL_CODES

    text = inference_text(url, title, page_text)
    best_code = "UNKNOWN"
    best_score = 0
    second_score = 0
    for code in ALL_CODES:
        s = exam_inference_score(text, "", code)
        if s > best_score:
            second_score = best_score
            best_score = s
            best_code = code
        elif s > second_score:
            second_score = s
    if best_score < MIN_EXAM_SCORE:
        return "UNKNOWN"
    # Reject ambiguous pages where two programs score similarly.
    if second_score >= MIN_EXAM_SCORE and best_score - second_score < 3:
        return "UNKNOWN"
    return best_code


def exam_matches_target(
    url: str,
    title: str,
    exam_code: str,
    *,
    page_text: str = "",
) -> tuple[bool, str]:
    """True when URL/title/body confidently identify the expected exam."""
    inferred = infer_exam_from_content(url, title, page_text)
    score = exam_inference_score(inference_text(url, title, page_text), "", exam_code)
    return inferred == exam_code and score >= MIN_EXAM_SCORE, inferred


def probe_url_for_exam(url: str, exam_code: str) -> tuple[bool, str]:
    """
    HEAD/GET a candidate URL and verify it belongs to exam_code.
    Returns (matched, page_title).
    """
    import requests
    from bs4 import BeautifulSoup

    from national_extract import HEADERS

    try:
        resp = requests.get(url, headers=HEADERS, timeout=20, stream=True)
        if resp.status_code != 200:
            resp.close()
            return False, ""
        raw = b""
        for chunk in resp.iter_content(8192):
            raw += chunk
            if len(raw) >= 16384:
                break
        resp.close()
        html = raw.decode("utf-8", errors="replace")
        soup = BeautifulSoup(html, "html.parser")
        title_tag = soup.find("title")
        page_title = title_tag.get_text(" ", strip=True) if title_tag else ""
        body_snippet = soup.get_text(" ", strip=True)[:800]
        ok, _ = exam_matches_target(url, page_title, exam_code, page_text=body_snippet)
        return ok, page_title
    except Exception:
        return False, ""


def is_excluded_title(title: str) -> bool:
    return bool(EXCLUDE_TITLE_RE.search(title) or PARTIAL_ROLL_RE.search(title))


def infer_month_from_cycles(exam_code: str, year: int, title: str, url: str) -> str | None:
    text = f"{title} {url}".lower()
    for month in EXAM_CYCLES.get(exam_code, []):
        if month.lower() in text:
            return month
    return None


def validate_stats(stats: dict) -> tuple[bool, str]:
    takers = stats.get("total_takers") or 0
    passers = stats.get("total_passers") or 0
    rate = stats.get("pass_rate")

    if takers <= 0:
        return False, "total_takers <= 0"
    if passers > takers:
        return False, "passers > takers"
    if rate is None:
        return False, "missing pass_rate"

    expected = round(passers / takers * 100, 2)
    if abs(float(rate) - expected) > 1.0:
        return False, f"pass_rate mismatch ({rate} vs {expected})"
    return True, ""


PROGRAM_TITLE_RULES: dict[str, dict] = {
    "LET-E": {"require_any": ("elementary", "let-e", "let elementary", "blept elementary")},
    "LET-S": {"require_any": ("secondary", "let-s", "let secondary", "blept secondary")},
    "PSY": {"require_any": ("psychometrician", "psychologist", "psychology")},
    "PLE": {"exclude_any": ("master plumber", "mple", "master-plumber")},
    "AgriLE": {"require_any": ("agriculturist", "agriculture", "agri")},
    "ALE": {"require_any": ("architect", "architecture"), "exclude_any": ("agriculturist", "agriculture")},
    "ECE": {
        "require_any": ("electronics", "electronics engineer", "ece"),
        "exclude_any": ("physical therapist", "ptle", "pharmacist", "phle"),
    },
    "PhLE": {
        "require_any": ("pharmacist", "pharmacy", "phle"),
        "exclude_any": ("physical therapist", "ptle", "electronics"),
    },
    "CELE": {
        "require_any": ("civil engineer", "civil engineering", "cele"),
        "exclude_any": ("criminolog", "electrical engineer", "electronics"),
    },
}


def _program_title_ok(exam_code: str, title: str) -> bool:
    rules = PROGRAM_TITLE_RULES.get(exam_code)
    if not rules:
        return True
    lower = title.lower()
    for token in rules.get("exclude_any", ()):
        if token in lower:
            return False
    required = rules.get("require_any")
    if required and not any(token in lower for token in required):
        return False
    return True


def validate_row(
    index: dict,
    *,
    title: str,
    url: str,
    parsed_year: int | None,
    parsed_month: str | None,
    parsed_exam: str,
    exam_score: int,
    stats: dict | None,
) -> tuple[bool, str]:
    if is_excluded_title(title):
        return False, "excluded title pattern"

    if not _program_title_ok(index["exam_code"], title):
        return False, "program-specific title rules failed"

    if parsed_year is None:
        return False, "no parsed year"
    if parsed_year != index["year"]:
        return False, f"year mismatch (parsed={parsed_year}, index={index['year']})"

    if exam_score < MIN_EXAM_SCORE or parsed_exam != index["exam_code"]:
        return False, f"exam mismatch (parsed={parsed_exam}, index={index['exam_code']})"

    # Prefer month parsed from page title/URL over registry EXAM_CYCLES.
    month = parsed_month or index.get("month") or infer_month_from_cycles(
        index["exam_code"], index["year"], title, url
    )
    if not month:
        return False, "month not present or inferable"

    if not stats:
        return False, "no summary stats"

    ok, reason = validate_stats(stats)
    if not ok:
        return False, reason

    return True, month


def should_overwrite(existing_url: str | None, new_source: str, existing_stats: dict, new_stats: dict) -> bool:
    """Official prc.gov.ph rows are not overwritten by mirrors unless numbers agree."""
    if not existing_url:
        return True
    if "prc.gov.ph" in (existing_url or "") and "prc.gov.ph" not in new_source:
        for key in ("total_takers", "total_passers", "pass_rate"):
            a = existing_stats.get(key)
            b = new_stats.get(key)
            if a is None or b is None:
                return False
            if key == "pass_rate":
                if abs(float(a) - float(b)) > 1.0:
                    return False
            elif int(a) != int(b):
                return False
        return False
    new_pri = SOURCE_PRIORITY.get(new_source, 0)
    old_pri = 0
    for src, pri in SOURCE_PRIORITY.items():
        if src in (existing_url or ""):
            old_pri = pri
            break
    return new_pri >= old_pri
