"""
School-name normalization and region inference.

PRC/aggregator sources spell the same school many ways ("UST", "U OF SANTO
TOMAS", "University of Santo Tomas - Manila"). Normalizing before insert keeps
the `schools` table deduplicated so profiles and rankings stay accurate.
"""

import re

# Common abbreviation expansions (extend as data is enriched).
ABBREV = {
    r"\bUST\b": "University of Santo Tomas",
    r"\bUP\b": "University of the Philippines",
    r"\bADMU\b": "Ateneo de Manila University",
    r"\bDLSU\b": "De La Salle University",
    r"\bPLM\b": "Pamantasan ng Lungsod ng Maynila",
    r"\bPLV\b": "Pamantasan ng Lungsod ng Valenzuela",
    r"\bMSU\b": "Mindanao State University",
    r"\bUSC\b": "University of San Carlos",
}

# Hints to infer region from a school name when explicit region is missing.
REGION_HINTS = {
    "manila": "NCR",
    "quezon city": "NCR",
    "makati": "NCR",
    "cebu": "Region VII",
    "davao": "Region XI",
    "baguio": "CAR",
    "iloilo": "Region VI",
    "cagayan de oro": "Region X",
    "pampanga": "Region III",
}

_SUFFIX_NOISE = re.compile(r"\s*[-–—]\s*(main|campus|main campus)\s*$", re.IGNORECASE)
_MULTISPACE = re.compile(r"\s+")


def normalize_school_name(raw: str) -> str:
    if not raw:
        return ""
    name = raw.strip()
    name = _SUFFIX_NOISE.sub("", name)
    for pat, full in ABBREV.items():
        name = re.sub(pat, full, name, flags=re.IGNORECASE)
    name = _MULTISPACE.sub(" ", name).strip()
    # Title-case all-caps names while preserving short words.
    if name.isupper():
        name = name.title()
    return name


def infer_region(name: str) -> str | None:
    low = (name or "").lower()
    for hint, region in REGION_HINTS.items():
        if hint in low:
            return region
    return None


def slugify(text: str) -> str:
    s = (text or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")
