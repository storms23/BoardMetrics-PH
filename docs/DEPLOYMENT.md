# Pasa Rate PH — Deployment, Backups & Recovery

## 1. Supabase (database)
1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed/seed.sql`.
3. Project Settings -> API: copy the Project URL, the `anon` public key, and the
   `service_role` secret key.

### Backups & recovery (NFR-5)
- Supabase performs automated daily backups on paid tiers; enable Point-in-Time
  Recovery (PITR) for finer-grained restore.
- For the free tier or extra safety, schedule a logical dump:
  `pg_dump "$DATABASE_URL" -Fc -f backup_$(date +%F).dump`
- Restore: `pg_restore --clean --no-owner -d "$DATABASE_URL" backup_YYYY-MM-DD.dump`
- Because all ETL writes are idempotent upserts, re-running the scraper after a
  restore safely reconciles any gap.

## 2. Website + API (Vercel)
1. Push this repo to GitHub.
2. Import the repo at https://vercel.com (framework auto-detected: Next.js).
3. Add Environment Variables (from `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `ADMIN_PASSWORD`, `ADMIN_API_KEYS` (optional)
4. Deploy. Vercel serves HTTPS automatically.

## 3. Scheduled ingestion (GitHub Actions)
- `.github/workflows/scrape.yml` runs the ETL weekly and on manual dispatch.
- Add repository secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`.
- `.github/workflows/ci.yml` typechecks + builds on every push/PR.

## 4. Performance notes (NFR-1/2)
- DB indexes (incl. a trigram index on `schools.name`) are created by the
  migration for fast search and ranking queries.
- Public pages are server-rendered; hot endpoints can be wrapped with Next.js
  caching/ISR once data cadence is known.
- The in-memory API rate limiter is per-instance; for multi-region scale, swap
  `rateLimit()` in `src/lib/http.ts` for Upstash Redis (same call site).

## 5. Local development
```bash
cp .env.example .env.local   # fill in Supabase keys
npm install
npm run dev                  # http://localhost:3000
```

> If `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (SSL inspection
> on your network), prefix commands with `NODE_OPTIONS=--use-system-ca` (Windows
> PowerShell: `$env:NODE_OPTIONS="--use-system-ca"`).
