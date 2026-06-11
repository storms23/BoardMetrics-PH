# Agent Handover — CELE Manual Ingest (Pasa Rate PH)

**Date:** 2026-06-10  
**Program:** CELE (Civil Engineers Licensure Examination)  
**Slug:** `civil-engineering` → `/exams/civil-engineering`

---

## Goal

Replace scraped CELE data with **manual sources** from the user's Google Drive folder. User chose **manual ingest** over automated scraping for school performance.

**Drive folder (POS PDFs):**  
https://drive.google.com/drive/folders/1nlmlyXLDZSzQJWbiB2ZSMBbAKS8MrN2v

---

## Current database state (CELE)

| Layer | Status |
|-------|--------|
| **National pass rates** | **Done** — 20 cycles in `exam_results` (user-provided CSV) |
| **School performance** | **Not done** — 0 cycles with `school_performance` rows |
| **Topnotchers** | Not in scope for this handover |

### National cycles in DB (all have `total_takers` > 0)

May/November 2015–2019, November 2021, May/November 2022, April/November 2023, April/November 2024, April/November 2025, March 2026.

**Intentional gap:** No CELE in **2020** (no row in user CSV; verify audit flags this).

**Month labeling:** Store months **as PRC release timing** (May, April, March, November) — **not** forced to `EXAM_CYCLES` March/November only. User explicitly requested this.

**Cleanup done:** Removed wrong **April 2017** duplicate (same stats as May 2017).

---

## What was completed in code

### New scripts

| Script | Purpose |
|--------|---------|
| [`scraper/cleanup_program.py`](../scraper/cleanup_program.py) | Wipe all `exam_results` for one `exam_code` (cascades `school_performance`, `topnotchers`) |
| [`scraper/ingest_manual_national.py`](../scraper/ingest_manual_national.py) | Upsert national stats from CSV |
| [`scraper/ingest_manual_pos.py`](../scraper/ingest_manual_pos.py) | Ingest school tables from local POS PDFs |

### Dependencies / gitignore

- `gdown` added to [`scraper/requirements.txt`](../scraper/requirements.txt) for Drive folder download
- `scraper/input/` in [`.gitignore`](../.gitignore) (PDFs not committed)

### Local files (not in git)

```
scraper/input/cele_pos/          # 20 PDFs downloaded via gdown
scraper/input/cele_national.csv  # User's 20-row national CSV (already ingested)
```

### National CSV already ingested

Source: user message / `scraper/input/cele_national.csv`  
`source_url` tag: `manual://user-csv-national`

```bash
cd scraper
py -3 ingest_manual_national.py input/cele_national.csv   # already run successfully
```

---

## School performance — what’s blocking

### PDF types in `scraper/input/cele_pos/`

**8 text PDFs (~150–170 KB)** — parse with `pdfplumber` / `parse_prc_pos_pdf`, **no OCR**:

- `MAY_2015_CELE.pdf`, `MAY_2016_CELE.pdf`, `MAY_2017_CELE.pdf`, `May_2018_CELE.pdf`
- `NOV_2015_CELE.pdf`, `NOV_2016_CELE.pdf`, `NOV_2017_CELE.pdf`, `NOV_2018_CELE.pdf`

**12 scanned PDFs (~1.6–1.8 MB)** — image-only; **OCR.space times out** frequently from user's network. User should send **Excel/CSV** for these:

| File | Cycle |
|------|-------|
| `MAY_2019_CELE.pdf` | May 2019 |
| `MAY_2022_CELE.pdf` | May 2022 |
| `NOV_2019_CELE.pdf` | November 2019 |
| `NOV_2021_CELE.pdf` | November 2021 |
| `NOV_2022_CELE.pdf` | November 2022 |
| `NOV_2023_CELE.pdf` | November 2023 |
| `NOV_2024_CELE.pdf` | November 2024 |
| `NOV_2025_CELE.pdf` | November 2025 |
| `April_2023_CELE.pdf` | April 2023 |
| `April_2024_CELE.pdf` | April 2024 |
| `April_2025_CELE.pdf` | April 2025 |
| `MARCH_2026_CELE.pdf` | March 2026 |

### Dry-run results (school ingest, not saved)

- Text PDFs: ~116–253 schools parsed in dry-run
- Scanned PDFs: partial (40–73 schools) or failed when OCR.space timed out
- **Full ingest was never run** for schools after national CSV was saved

### POS PDFs do not contain national stats

National lines like "X out of Y (Z%)" live on **results announcement pages**, not school-performance PDFs. National is already handled via user CSV.

---

## OCR / DeepSeek facts (do not re-discover)

1. **`deepseek-chat` API is text-only** — does not accept `image_url`. Cannot replace OCR.space for vision.
2. **Pipeline in `ocr_llm.py`:** OCR.space → raw text → DeepSeek structures JSON (optional).
3. **`ingest_manual_pos.py`** uses: `parse_prc_pos_pdf` first, then per-page PNG → OCR.space → `parse_prc_pos_text` / regex for scanned PDFs.
4. **Playwright "stealth"** in `scraper.py` is hand-rolled (hide `navigator.webdriver`, disable AutomationControlled) — not the `playwright-stealth` package. Used for prcboard scraping, not needed for manual PDF/CSV path.

---

## Recommended next steps for agent

### Priority 1 — Ingest 8 text PDFs (fast, no OCR)

```bash
cd scraper
py -3 ingest_manual_pos.py CELE input/cele_pos --dry-run   # verify counts
py -3 ingest_manual_pos.py CELE input/cele_pos             # real write
py -3 consistency.py
py -3 verify_data.py --scope full --program CELE --start 2015 --end 2026
```

Expect `national_missing: true` in report for school-only upserts (national already set from CSV). Ensure ingest does **not** overwrite good national rows with zeros — check `ingest_manual_pos.py` behavior before run.

### Priority 2 — Excel/CSV for 12 scanned cycles

User should provide files named e.g. `CELE_May_2019.xlsx` with columns:

```
rank,school,takers,passers,pass_rate
```

**Not yet implemented:** `ingest_manual_pos.py` does not read XLSX/CSV — agent should extend it or add `ingest_manual_schools_csv.py`.

### Priority 3 — Verify app

- `/exams/civil-engineering` — national trend chart should show all 20 CSV cycles
- Cycle detail pages — school tables empty until Priority 1/2 complete

---

## Useful commands

```bash
cd scraper

# Wipe CELE only (already done once; use before full re-ingest if needed)
py -3 cleanup_program.py CELE --dry-run
py -3 cleanup_program.py CELE --delete

# Re-download PDFs from Drive
py -3 -m pip install gdown
py -3 -m gdown --folder "https://drive.google.com/drive/folders/1nlmlyXLDZSzQJWbiB2ZSMBbAKS8MrN2v" -O input/cele_pos

# National CSV (done)
py -3 ingest_manual_national.py input/cele_national.csv

# School PDFs
py -3 ingest_manual_pos.py CELE input/cele_pos

# Audit
py -3 verify_data.py --scope national --program CELE --start 2015 --end 2026
py -3 verify_data.py --scope full --program CELE --start 2015 --end 2026
py -3 consistency.py
```

---

## Env required

From project root `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY` (optional; text structuring only)
- `OCR_SPACE_API_KEY` (needed for scanned PDF path; default key in code may rate-limit)

---

## Conventions (repo rules)

- Program registry: `scraper/programs.py`, `src/lib/programs.ts`, `supabase/seed/seed.sql`
- DB writes: `scraper/db.py` upserts only
- Do **not** scrape full passer lists
- Do **not** edit `.cursor/plans/*.plan.md` unless user asks

---

## Related national pipeline (separate from CELE schools)

Long-running `collect_national_links.py 2015 2026 --merge` completed (~4h). PRC.gov.ph searches mostly timed out; prcboard index still useful. Not required for CELE manual school ingest.

---

## User preferences (important)

1. **Manual over scrape** for CELE school performance
2. **Month = release timing** from filename (May, April, etc.)
3. Willing to send **Excel for 12 scanned PDFs**
4. Already sent **national CSV** (20 rows) — do not ask again unless re-ingesting

---

## Success criteria

- [x] CELE national trend complete (20 cycles, 0 critical audit issues)
- [ ] CELE school performance for all 20 cycles user has PDFs for
- [ ] `verify_data.py --scope full --program CELE` — no `exam_no_schools` for ingested cycles
- [ ] `consistency.py` run after school ingest
