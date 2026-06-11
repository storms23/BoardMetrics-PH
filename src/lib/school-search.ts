/**
 * School search helpers — token matching + common Philippine school abbreviations.
 */

const ALIASES: Record<string, string[]> = {
  plv: ["pamantasan", "valenzuela"],
  plm: ["pamantasan", "maynila"],
  ust: ["santo", "tomas"],
  up: ["university", "philippines"],
  admu: ["ateneo", "manila"],
  dlsu: ["la", "salle"],
};

/** Split a query into tokens; expand known abbreviations to word groups. */
export function searchTokens(term: string): string[] {
  const raw = term.trim().toLowerCase();
  if (!raw) return [];
  if (ALIASES[raw]) return ALIASES[raw];
  return raw.split(/\s+/).filter((t) => t.length >= 2);
}
