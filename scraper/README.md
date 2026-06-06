# Pasa Rate PH — Scraper / ETL

Python pipeline that ingests PRC board-exam results into Supabase.

## What it collects
- National summary stats per exam cycle (regex)
- Per-school performance (HTML table -> Claude OCR fallback)
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
- `ANTHROPIC_API_KEY`          (optional; only for OCR fallback)

Before the first run, apply the DB schema + seed (see project root README):
`supabase/migrations/0001_init.sql` then `supabase/seed/seed.sql`.

## Run
```bash
python scraper.py                 # default target list
python scraper.py NLE 2025        # one program + year
python scraper.py --all 2025      # all 16 programs for a year
python consistency.py             # recompute Consistency Scores after scraping
```

## Files
- `programs.py`     — program registry (mirror of src/lib/programs.ts)
- `normalize.py`    — school-name dedupe + region inference
- `db.py`           — Supabase upserts (idempotent), import jobs, audit log
- `scraper.py`      — discovery + extraction + orchestration
- `consistency.py`  — Consistency Score recompute

## Backfilling history
To populate ~10 years, loop years per program, e.g.:
```bash
for /L %y in (2015,1,2025) do python scraper.py NLE %y   :: Windows cmd
```
Re-running is safe: all writes are idempotent upserts.
