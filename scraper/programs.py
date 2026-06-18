"""
Program registry (Python mirror of src/lib/programs.ts).

Single source of truth for the scraper. To support a new board exam, add ONE
entry here and a matching row in supabase/seed/seed.sql + src/lib/programs.ts.
"""

# Typical exam cycles (months when each exam is usually held)
EXAM_CYCLES = {
    "CPALE": ["May", "October"],
    "NLE": ["June", "December"],
    "CLE": ["June", "November"],
    "CELE": ["March", "November"],
    "ECE": ["April", "October"],
    "REE": ["April", "October"],
    "MELE": ["April", "October"],
    "PLE": ["June", "December"],
    "MTLE": ["January", "March", "February", "August", "September"],
    "ALE": ["June", "December"],
    "PhLE": ["August"],
    "PSY": ["April", "October"],
    "AgriLE": ["June", "December"],
    "LET-E": ["March", "September"],
    "LET-S": ["March", "September"],
}

PROGRAMS = [
    # exam_code, name, level, slug, scrape_keywords, prcboard_slug
    ("LET-E",  "Licensure Examination for Teachers (Elementary)", "Elementary", "let-elementary",
     ["LET elementary", "teachers elementary", "BLEPT elementary"], "let-elementary"),
    ("LET-S",  "Licensure Examination for Teachers (Secondary)", "Secondary", "let-secondary",
     ["LET secondary", "teachers secondary", "BLEPT secondary"], "let-secondary"),
    ("CPALE",  "Certified Public Accountant Licensure Examination", None, "cpale",
     ["CPALE", "CPA board", "certified public accountant"], "cpa"),
    ("NLE",    "Nurse Licensure Examination", None, "nursing",
     ["NLE", "nurse licensure", "nursing board"], "nle"),
    ("CLE",    "Criminologists Licensure Examination", None, "criminology",
     ["criminology board", "criminologist licensure", "CLE"], "criminology"),
    ("CELE",   "Civil Engineers Licensure Examination", None, "civil-engineering",
     ["civil engineering board", "civil engineer licensure", "CELE"], "cele"),
    ("ECE",    "Electronics Engineers Licensure Examination", None, "electronics-engineering",
     ["electronics engineering board", "ECE board", "electronics engineer"], "ece"),
    ("REE",    "Registered Electrical Engineers Licensure Examination", None, "electrical-engineering",
     ["electrical engineering board", "REE board", "electrical engineer"], "ree"),
    ("MELE",   "Mechanical Engineers Licensure Examination", None, "mechanical-engineering",
     ["mechanical engineering board", "mechanical engineer licensure", "MELE"], "mele"),
    ("PLE",    "Physician Licensure Examination", None, "medicine",
     ["physician licensure", "medical board", "PLE"], "ple"),
    ("MTLE",   "Medical Technologists Licensure Examination", None, "medical-technology",
     ["medical technology board", "medtech licensure", "MTLE"], "mtle"),
    ("ALE",    "Architects Licensure Examination", None, "architecture",
     ["architecture board", "architect licensure", "ALE"], "ale"),
    ("PhLE",   "Pharmacist Licensure Examination", None, "pharmacy",
     ["pharmacy board", "pharmacist licensure", "PhLE"], "phle"),
    ("PSY",    "Psychologist / Psychometrician Licensure Examination", None, "psychology",
     ["psychometrician licensure", "psychologist licensure", "psychology board"], "psychology"),
    ("AgriLE", "Agriculturist Licensure Examination", None, "agriculture",
     ["agriculturist licensure", "agriculture board", "agriculturist"], "agriculture"),
]

# Helper dicts for easy lookup
PROGRAMS_DICT = {
    p[0]: {
        "exam_code": p[0],
        "exam_name": p[1],
        "level": p[2],
        "slug": p[3],
        "keywords": p[4],
        "prcboard_slug": p[5],
    }
    for p in PROGRAMS
}
EXAM_NAMES = {p[0]: p[1] for p in PROGRAMS}
KEYWORDS = {p[0]: p[4] for p in PROGRAMS}
PRCBOARD_SLUGS = {p[0]: p[5] for p in PROGRAMS}
ALL_CODES = [p[0] for p in PROGRAMS]


def resolve_exam_code(code: str) -> str | None:
    """Case-insensitive lookup (AgriLE, PhLE, LET-E, etc.)."""
    if code in PROGRAMS_DICT:
        return code
    key = code.upper()
    for exam_code in ALL_CODES:
        if exam_code.upper() == key:
            return exam_code
    return None
