"""
Program registry (Python mirror of src/lib/programs.ts).

Single source of truth for the scraper. To support a new board exam, add ONE
entry here and a matching row in supabase/seed/seed.sql + src/lib/programs.ts.
"""

PROGRAMS = [
    # exam_code, name, level, slug, scrape_keywords
    ("LET-E",  "Licensure Examination for Teachers (Elementary)", "Elementary", "let-elementary",
     ["LET elementary", "teachers elementary", "BLEPT elementary"]),
    ("LET-S",  "Licensure Examination for Teachers (Secondary)", "Secondary", "let-secondary",
     ["LET secondary", "teachers secondary", "BLEPT secondary"]),
    ("CPALE",  "Certified Public Accountant Licensure Examination", None, "cpale",
     ["CPALE", "CPA board", "certified public accountant"]),
    ("NLE",    "Nurse Licensure Examination", None, "nursing",
     ["NLE", "nurse licensure", "nursing board"]),
    ("CLE",    "Criminologists Licensure Examination", None, "criminology",
     ["criminology board", "criminologist licensure", "CLE"]),
    ("CELE",   "Civil Engineers Licensure Examination", None, "civil-engineering",
     ["civil engineering board", "civil engineer licensure", "CELE"]),
    ("ECE",    "Electronics Engineers Licensure Examination", None, "electronics-engineering",
     ["electronics engineering board", "ECE board", "electronics engineer"]),
    ("REE",    "Registered Electrical Engineers Licensure Examination", None, "electrical-engineering",
     ["electrical engineering board", "REE board", "electrical engineer"]),
    ("MELE",   "Mechanical Engineers Licensure Examination", None, "mechanical-engineering",
     ["mechanical engineering board", "mechanical engineer licensure", "MELE"]),
    ("PLE",    "Physician Licensure Examination", None, "medicine",
     ["physician licensure", "medical board", "PLE"]),
    ("MTLE",   "Medical Technologists Licensure Examination", None, "medical-technology",
     ["medical technology board", "medtech licensure", "MTLE"]),
    ("ALE",    "Architects Licensure Examination", None, "architecture",
     ["architecture board", "architect licensure", "ALE"]),
    ("PhLE",   "Pharmacist Licensure Examination", None, "pharmacy",
     ["pharmacy board", "pharmacist licensure", "PhLE"]),
    ("PSY",    "Psychologist / Psychometrician Licensure Examination", None, "psychology",
     ["psychometrician licensure", "psychologist licensure", "psychology board"]),
    ("DLE",    "Dentist Licensure Examination", None, "dentistry",
     ["dentist licensure", "dentistry board", "DLE"]),
    ("AgriLE", "Agriculturist Licensure Examination", None, "agriculture",
     ["agriculturist licensure", "agriculture board", "agriculturist"]),
]

EXAM_NAMES = {p[0]: p[1] for p in PROGRAMS}
KEYWORDS = {p[0]: p[4] for p in PROGRAMS}
ALL_CODES = [p[0] for p in PROGRAMS]
