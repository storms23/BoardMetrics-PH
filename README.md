# Pasa Rate PH

Turn PRC board-exam results into a searchable, analyzable database and public API.

A Next.js + Supabase platform with a Python ETL pipeline. MVP covers **16
licensure programs** and is designed to extend to more as data, not code.

- Full spec: [docs/SRS.md](docs/SRS.md)
- Deployment & backups: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Scraper: [scraper/README.md](scraper/README.md)

## Stack
- **Web + API:** Next.js 16 (App Router) + TypeScript + Tailwind v4 (Vercel)
- **Database:** Supabase (PostgreSQL) with RLS + Storage
- **ETL:** Python (regex + Playwright + Claude OCR fallback) -> Supabase
- **Charts:** Recharts · **Export:** SheetJS (CSV/Excel)

## Features
- Global search (school / exam / year / month / region)
- School profiles (summary, history, trend vs national, ranking history)
- Board-examination pages (national stats, top schools, difficulty, distribution)
- Rankings portal with advanced filters + CSV/Excel export
- School comparison tool
- Regional analytics + Top Schools leaderboard
- Consistency Score (Excellent -> Poor)
- Public REST API (`/api/v1/*`) with pagination, filtering, rate limiting, OpenAPI
- Admin console (import jobs, data verification, audit logs)

## Project layout
```
src/app            Next.js pages + /api/v1 route handlers
src/components      UI + charts (Recharts)
src/lib            programs registry, types, queries, http, supabase clients
supabase/          SQL migration + seed (16 programs, regions, provinces)
scraper/           Python ETL (programs, normalize, db, scraper, consistency)
docs/              SRS + deployment
.github/workflows  CI + scheduled scrape
.cursor/           rules, hooks, and the add-board-program skill
```

## Quick start
```bash
cp .env.example .env.local      # fill in Supabase keys
npm install
npm run dev                     # http://localhost:3000
```
Then apply the DB schema in Supabase (SQL editor):
`supabase/migrations/0001_init.sql` -> `supabase/seed/seed.sql`, and run the
scraper (see scraper/README.md) to populate data.

> Network note: if `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
> set `$env:NODE_OPTIONS="--use-system-ca"` (PowerShell) before npm/next commands.

## Adding a new board program (extensibility)
1. Add an entry to `src/lib/programs.ts` and `scraper/programs.py`.
2. Add a row to `supabase/seed/seed.sql` and run it.
3. Scrape it: `python scraper.py <CODE> <YEAR>`.
No schema or architectural changes required. (See the `add-board-program`
Cursor skill in `.cursor/skills/`.)

## Connections you control (checkpoints)
| Need | Where | When |
|------|-------|------|
| Supabase URL + anon + service-role keys | `.env.local` / Vercel env | before data loads |
| Anthropic API key (OCR fallback) | `.env` for scraper | before scraping image tables |
| GitHub repo | push + Actions secrets | for CI + scheduled scrape |
| Vercel project | import repo + env vars | to go live |
