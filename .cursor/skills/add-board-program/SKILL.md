---
name: add-board-program
description: Onboard a new PRC board-exam program to Pasa Rate PH. Use when adding a new licensure exam/program to the platform, extending exam coverage, or when the user mentions adding a board exam, program, or exam code.
---

# Add a Board Program to Pasa Rate PH

The platform keeps supported programs in a registry, so a new exam is added as
data in three synchronized places plus a scrape. No schema changes.

## Inputs needed
- `exam_code` (e.g., `GEO`) — short, unique, uppercase
- Full official name (e.g., `Geologist Licensure Examination`)
- `slug` (URL-safe, e.g., `geology`)
- `level` (optional, e.g., `Elementary`/`Secondary`; else `null`)
- Scrape keywords (1-3 phrases used to discover posts)

## Workflow

```
- [ ] 1. Add to TypeScript registry: src/lib/programs.ts
- [ ] 2. Add to Python registry:     scraper/programs.py
- [ ] 3. Add to DB seed + run it:    supabase/seed/seed.sql
- [ ] 4. Scrape it:                  python scraper.py <CODE> <YEAR>
- [ ] 5. Recompute scores:           python consistency.py
- [ ] 6. Verify it appears at /exams/<slug>
```

**1. `src/lib/programs.ts`** — add an entry to the `PROGRAMS` array:
```ts
{ examCode: "GEO", name: "Geologist Licensure Examination", level: null,
  slug: "geology", scrapeKeywords: ["geologist licensure", "geology board"] },
```

**2. `scraper/programs.py`** — add a matching tuple to `PROGRAMS`:
```python
("GEO", "Geologist Licensure Examination", None, "geology",
 ["geologist licensure", "geology board"]),
```

**3. `supabase/seed/seed.sql`** — add a row to the `insert into programs (...) values`
list (the `on conflict` clause makes re-running safe), then run the file in the
Supabase SQL editor.

**4-5. Ingest:** `cd scraper && python scraper.py GEO 2025 && python consistency.py`

**6. Verify:** the program shows on the home grid and `/exams/geology`; the API
returns it at `/api/v1/exams`.

## Rules
- Keep `exam_code`, `name`, `slug` identical across all three registries.
- Never hardcode the program anywhere outside the registries.
