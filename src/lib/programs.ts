/**
 * Program registry — the single source of truth for supported board exams.
 *
 * RULE: Never hardcode exam lists anywhere else. To support a new board exam,
 * add ONE entry here and a matching scraper keyword mapping. The DB `programs`
 * table is seeded from this list (see supabase/seed/seed.sql), so the website,
 * API, and ETL all agree on what exists.
 *
 * `level` distinguishes sub-tracks of the same exam (e.g., LET Elementary vs
 * Secondary). `slug` is the URL-safe identifier used in routes.
 */

export type ProgramLevel = "Elementary" | "Secondary" | null;

export interface Program {
  examCode: string;
  name: string;
  level: ProgramLevel;
  slug: string;
  /** Keywords the scraper uses to discover posts for this program. */
  scrapeKeywords: string[];
}

export const PROGRAMS: Program[] = [
  {
    examCode: "LET-E",
    name: "Licensure Examination for Teachers (Elementary)",
    level: "Elementary",
    slug: "let-elementary",
    scrapeKeywords: ["LET elementary", "teachers elementary", "BLEPT elementary"],
  },
  {
    examCode: "LET-S",
    name: "Licensure Examination for Teachers (Secondary)",
    level: "Secondary",
    slug: "let-secondary",
    scrapeKeywords: ["LET secondary", "teachers secondary", "BLEPT secondary"],
  },
  {
    examCode: "CPALE",
    name: "Certified Public Accountant Licensure Examination",
    level: null,
    slug: "cpale",
    scrapeKeywords: ["CPALE", "CPA board", "certified public accountant"],
  },
  {
    examCode: "NLE",
    name: "Nurse Licensure Examination",
    level: null,
    slug: "nursing",
    scrapeKeywords: ["NLE", "nurse licensure", "nursing board"],
  },
  {
    examCode: "CLE",
    name: "Criminologists Licensure Examination",
    level: null,
    slug: "criminology",
    scrapeKeywords: ["criminology board", "criminologist licensure", "CLE"],
  },
  {
    examCode: "CELE",
    name: "Civil Engineers Licensure Examination",
    level: null,
    slug: "civil-engineering",
    scrapeKeywords: ["civil engineering board", "civil engineer licensure", "CELE"],
  },
  {
    examCode: "ECE",
    name: "Electronics Engineers Licensure Examination",
    level: null,
    slug: "electronics-engineering",
    scrapeKeywords: ["electronics engineering board", "ECE board", "electronics engineer"],
  },
  {
    examCode: "REE",
    name: "Registered Electrical Engineers Licensure Examination",
    level: null,
    slug: "electrical-engineering",
    scrapeKeywords: ["electrical engineering board", "REE board", "electrical engineer"],
  },
  {
    examCode: "MELE",
    name: "Mechanical Engineers Licensure Examination",
    level: null,
    slug: "mechanical-engineering",
    scrapeKeywords: ["mechanical engineering board", "mechanical engineer licensure", "MELE"],
  },
  {
    examCode: "PLE",
    name: "Physician Licensure Examination",
    level: null,
    slug: "medicine",
    scrapeKeywords: ["physician licensure", "medical board", "PLE"],
  },
  {
    examCode: "MTLE",
    name: "Medical Technologists Licensure Examination",
    level: null,
    slug: "medical-technology",
    scrapeKeywords: ["medical technology board", "medtech licensure", "MTLE"],
  },
  {
    examCode: "ALE",
    name: "Architects Licensure Examination",
    level: null,
    slug: "architecture",
    scrapeKeywords: ["architecture board", "architect licensure", "ALE"],
  },
  {
    examCode: "PhLE",
    name: "Pharmacist Licensure Examination",
    level: null,
    slug: "pharmacy",
    scrapeKeywords: ["pharmacy board", "pharmacist licensure", "PhLE"],
  },
  {
    examCode: "PSY",
    name: "Psychologist / Psychometrician Licensure Examination",
    level: null,
    slug: "psychology",
    scrapeKeywords: ["psychometrician licensure", "psychologist licensure", "psychology board"],
  },
  {
    examCode: "DLE",
    name: "Dentist Licensure Examination",
    level: null,
    slug: "dentistry",
    scrapeKeywords: ["dentist licensure", "dentistry board", "DLE"],
  },
  {
    examCode: "AgriLE",
    name: "Agriculturist Licensure Examination",
    level: null,
    slug: "agriculture",
    scrapeKeywords: ["agriculturist licensure", "agriculture board", "agriculturist"],
  },
];

export const PROGRAM_BY_CODE: Record<string, Program> = Object.fromEntries(
  PROGRAMS.map((p) => [p.examCode.toUpperCase(), p]),
);

export const PROGRAM_BY_SLUG: Record<string, Program> = Object.fromEntries(
  PROGRAMS.map((p) => [p.slug, p]),
);

export function getProgramByCode(code: string): Program | undefined {
  return PROGRAM_BY_CODE[code.toUpperCase()];
}

export function getProgramBySlug(slug: string): Program | undefined {
  return PROGRAM_BY_SLUG[slug];
}
