# Pasa Rate PH — Scraper / ETL

Python pipeline that ingests PRC board-exam results into Supabase.

## What it collects
- National summary stats per exam cycle (regex)
- Per-school performance (HTML table -> DeepSeek OCR fallback)
- Top 10 topnotchers per cycle (text -> OCR fallback)

It does **not** collect the full passer roll (no feature needs it).

## Setup
```bash
cd scraper
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium      # only needed for image-based tables
```

Create a `.env` in the project root (copy from `.env.example`) with:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`  (server-only; bypasses RLS for writes)
- `DEEPSEEK_API_KEY`             (OCR fallback for school tables + stat images)
- `ANTHROPIC_API_KEY`            (deprecated; optional legacy fallback)

Before the first run, apply the DB schema + seed (see project root README):
`supabase/migrations/0001_init.sql` then `supabase/seed/seed.sql`.

## Run (school + full scrape)
```bash
python scraper.py                 # default target list
python scraper.py NLE 2025        # one program + year
python scraper.py --all 2025      # all 16 programs for a year
python consistency.py             # recompute Consistency Scores after scraping
```

## National pass rates (2015–2026 backfill)

Two-phase pipeline — discover URLs once, ingest many. No school PDFs, Playwright, or OCR.

```bash
# Step 1: build URL index (~10–20 min)
python collect_national_links.py 2015 2026
# or:  python scraper.py --national --index 2015 2026

# Step 2: fetch + validate + upsert (~15–30 min)
python national_ingest.py --from-index output/national_links.json
# or:  python scraper.py --national --ingest

# Step 3: on-demand gap fill (discovers prc.gov.ph + prcboard for missing years)
python national_gap_fill.py AgriLE 2015 2026
python national_gap_fill.py --all 2015 2026
# or legacy:  python national_ingest.py --fill-gaps 2015 2026

# Step 3b: re-ingest placeholder shells (total_takers=0) from prc.gov.ph
# LET-E / LET-S share one PRC article — pass both codes together.
python national_reingest_placeholders.py LET-E LET-S MTLE PSY REE 2015 2026
python national_reingest_placeholders.py --all 2015 2026
python national_reingest_placeholders.py MTLE 2025 2025 --dry-run

# Full pipeline (build index if missing, then ingest)
python scraper.py --national --all 2015 2026

# One program / year
python scraper.py --national CELE 2025
```

Before re-ingesting after a bad backfill, audit and remove wrong-year rows:

```bash
python cleanup_national.py --audit
python cleanup_national.py --delete --dry-run
python cleanup_national.py --delete
python cleanup_national.py --delete-placeholders --dry-run
python cleanup_national.py --delete-placeholders   # dead prcboard shells after re-ingest
python cleanup_national.py --delete-all-bad --dry-run   # placeholders + dupes + mismatches
python cleanup_national.py --delete-all-bad
```

Verify data quality (markdown tables of suspicious rows and gaps):

```bash
python verify_data.py --scope national --start 2015 --end 2026
python verify_data.py --scope full
python verify_data.py --scope national --program CELE
python verify_data.py --scope national --index output/national_links.json
python verify_data.py --scope national --format json
```

See `.cursor/skills/verify-data-quality/SKILL.md` for the agent workflow.

Dry-run ingest (no DB writes):

```bash
python national_ingest.py --dry-run --from-index output/national_links.json
```

## Files
- `programs.py`              — program registry (mirror of src/lib/programs.ts)
- `normalize.py`               — school-name dedupe + region inference
- `db.py`                      — Supabase upserts (idempotent), import jobs, audit log
- `scraper.py`                 — discovery + extraction + orchestration
- `collect_national_links.py`  — Phase 1: national results URL index
- `national_ingest.py`         — Phase 2: validated national upserts
- `national_gap_fill.py`       — on-demand gap discovery + ingest
- `national_reingest_placeholders.py` — overwrite placeholder rows from prc.gov.ph (LET dual)
- `ocr_llm.py`                 — DeepSeek vision OCR (school tables + stat images)
- `national_extract.py`        — regex summary extraction (shared)
- `national_validate.py`       — strict year/exam/rate validation
- `national_audit.py`          — national data quality checks (shared)
- `platform_audit.py`          — school/platform row-level checks
- `verify_data.py`             — data quality report (markdown or JSON)
- `cleanup_national.py`        — remove wrong-year rows from bad backfills
- `collect_drive_links.py`     — school PDF Drive link collector (separate)
- `prc_gov_ph.py`              — official PRC POS scraper
- `consistency.py`             — Consistency Score recompute

## Backfilling history
To populate ~10 years, loop years per program, e.g.:
```bash
for /L %y in (2015,1,2025) do python scraper.py NLE %y   :: Windows cmd
```
Re-running is safe: all writes are idempotent upserts.
