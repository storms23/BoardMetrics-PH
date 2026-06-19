# Agent Handover — Board Analytics PH

**Last updated:** June 2026  
**Repo:** `https://github.com/storms23/BoardMetrics-PH.git` (folder on disk may still be named `PASA RATE`)  
**Latest pushed commit:** `489eda6` — *Rebrand to Board Analytics PH and add Support creator nav.*

---

## 1. What this product is

**Board Analytics PH** (formerly “Pasa Rate PH”) is a national-only MVP for Philippine PRC board exam pass rates. Users browse exams, view 10-year national history, compare programs, and search. **School rankings are deferred** — routes like `/rankings` and `/leaderboard` show placeholder CTAs.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres) · Python scraper/ETL · Vercel deploy · Lucide icons

---

## 2. Non‑negotiable conventions

Read `.cursor/rules/pasa-rate-conventions.mdc` before editing.

| Rule | Detail |
|------|--------|
| **Program registry** | Single source of truth: `src/lib/programs.ts`, mirror `scraper/programs.py`, seed `supabase/seed/seed.sql` |
| **Never hardcode exam lists** elsewhere — import from registry |
| **Complete national row** | `total_takers > 0 && pass_rate != null` (`isCompleteNationalRow` in `src/lib/exam-tracker.ts`) |
| **10-year window** | `TRACKER_WINDOW_YEARS = 10` |
| **Supabase reads** | `getServerClient()` (anon, RLS) in pages/API |
| **Supabase writes (ETL/admin)** | `getServiceClient()` server-only — never in client components |
| **Manual national CSVs** | Live in `scraper/input/` (**gitignored**). Ingest via `py -3 ingest_manual_national.py input/<file>.csv` from `scraper/` |

**Site branding:** `src/lib/site.ts` — `SITE_NAME = "Board Analytics PH"`, default URL `https://boardanalyticsph.com` (override with `NEXT_PUBLIC_SITE_URL`).

---

## 3. Programs in MVP (15 total)

| Code | Slug | Notes |
|------|------|--------|
| LET-E | let-elementary | |
| LET-S | let-secondary | |
| CPALE | cpale | |
| NLE | nursing | |
| CLE | criminology | |
| CELE | civil-engineering | |
| ECE | electronics-engineering | |
| REE | electrical-engineering | |
| MELE | mechanical-engineering | |
| PLE | medicine | |
| MTLE | medical-technology | |
| ALE | architecture | |
| PhLE | pharmacy | |
| PSY | psychology | RPm track |
| AgriLE | agriculture | |

**Removed:** DLE (medical technology duplicate program was removed from registry + Supabase).

Each program has `category`, `iconKey`, and `slug` in the registry. Icons map in `src/components/ProgramIcon.tsx` (Lucide).

---

## 4. National data policy (user-confirmed)

- User’s manual tables are **source of truth**
- Ingest = **upsert** on `(program_id, month, year)`
- Orphan rows in 2016–2026 window should be **deleted** when doing a full replace for a program
- CSV format: `exam_code,month,year,total_passers,total_takers,pass_rate`

National data was backfilled locally for the 15 programs via `ingest_manual_national.py`. CSVs are **not in git** — only in Supabase.

---

## 5. UI / UX state (recent session work)

### Navigation (`src/app/layout.tsx`)
- Logo: `src/app/image/Logo.png` (~1.4MB — consider compressing)
- Header: **Board Analytics PH** + Lucide/program icons elsewhere
- Nav: **Exams**, **Compare exams**, **Support creator** (button → `/support`)
- **Removed:** duplicate Search nav link, API nav link, homepage hero search bar
- **Kept:** blue header Search button → `/search?q=...`

### Homepage (`src/app/page.tsx`)
- Hero: “Browse all exams” only (no second search button)
- Snapshot labels: **“Lowest average pass rate”** (not “Hardest”)
- Browse: `ProgramBrowseGrid` — single 3-col grid + category filter pills (avoids sparse 1-card sections)

### Exam detail (`src/app/exams/[slug]/page.tsx`)
- Stat cards: **bold labels**; values **black** except Total Passers (green) / Total Failed (red)
- Hero stats: Latest Pass Rate, Highest Pass Rate, **Lowest Pass Rate** (replaced Highest Failed Rate)
- `ExamHistoryPanel` + table/graph tabs

### National results table (`src/components/ExamHistoryTable.tsx`)
- Pass/fail rate colors use **`variant="gradient"`** only here (readable green/red scale in `ui.tsx`)
- Stat cards and rest of site use **default** PassRate/FailedRate colors
- Rows highlighted: **green** = highest pass rate, **red** = lowest pass rate (complete cycles only)

### Support (`/support`)
- Donate: InstaPay QR `src/app/image/donate-qr.png` (background whitened for scanning; `unoptimized` Image)
- **Feedback form:** `CreatorFeedbackForm` → `POST /api/v1/feedback` → `creator_feedback` table

### Components worth knowing
| Component | Role |
|-----------|------|
| `ProgramBrowseGrid` / `ExamProgramGrid` | Filterable exam browse |
| `ExamBrowseCard` | Homepage/exams card with per-program Lucide icon |
| `ButtonLink` | CTAs with `no-underline-link` (fixes invisible blue-on-blue text bug) |
| `SiteLogo` | Header logo (~30% larger than original: 42px/47px) |

---

## 6. Database

**Migrations:**
- `0001_init.sql` — core schema
- `0002_creator_feedback.sql` — **`creator_feedback`** (applied to remote Supabase via MCP)

**Feedback table:** `creator_feedback (id, name, email, message, created_at)` — RLS on, no public policies; inserts via service role in API only. **No admin UI yet** — read messages in Supabase dashboard.

**Supabase project ref (from prior sessions):** `blhwagwquxeacewzgmwq`

---

## 7. Uncommitted work (as of handover)

**Not pushed** — next agent should commit/push if user wants:

```
src/app/api/v1/feedback/route.ts          (new)
src/components/CreatorFeedbackForm.tsx    (new)
supabase/migrations/0002_creator_feedback.sql (new)
src/app/support/page.tsx                  (feedback section)
src/components/DonateSection.tsx          (QR fix)
src/app/image/donate-qr.png               (whitened background)
```

Suggested commit message: *Add creator feedback form and fix donate QR for scanning.*

---

## 8. Domain & deploy

- **Desired domain:** `boardanalyticsph.com` (checked available ~$11/yr on Vercel — user must purchase + attach in Vercel Domains)
- Set `NEXT_PUBLIC_SITE_URL=https://boardanalyticsph.com` in Vercel env
- GitHub repo name still **BoardMetrics-PH**; display name is Board Analytics PH
- Dev: `npm run dev` from repo root
- ETL: `cd scraper && py -3 ingest_manual_national.py input/<file>.csv`

---

## 9. Performance notes (not yet implemented)

All main pages use `force-dynamic` — no ISR. For launch spikes, consider `revalidate = 3600` on homepage/exams/exam detail. See prior agent discussion on multi-user load.

---

## 10. Skills & rules in repo

| Path | Use when |
|------|----------|
| `.cursor/skills/add-board-program/` | Adding a new PRC program |
| `.cursor/skills/analytics-ui-ux/` | UI/UX on analytics pages |
| `.cursor/skills/plan-scrape-source/` | Scrape reconnaissance |
| `.cursor/skills/verify-data-quality/` | Auditing Supabase consistency |

---

## 11. Known follow-ups / open items

1. **Commit & push** feedback form + QR changes (see §7)
2. **Compress `Logo.png`** (~1.4MB) for faster loads
3. **Custom domain** — user action in Vercel + env var
4. **Admin UI** to read `creator_feedback` (optional)
5. **LET-E Mar 2019** — user had passers corrected to 19,659 for 27.28%; confirm if still disputed
6. **Page caching** (`revalidate`) if traffic grows
7. **Rename GitHub repo** to match Board Analytics PH (optional, user decision)
8. Docs/README still say “Pasa Rate PH” in places — update if full rebrand docs desired

---

## 12. Quick verification checklist

- [ ] `/` — browse grid, filters, snapshot icons
- [ ] `/exams/nursing` — stat cards, table row highlights, gradient rates in table only
- [ ] `/support` — QR scans, feedback submits to Supabase
- [ ] Header — Support creator button, single blue Search
- [ ] `npx tsc --noEmit` passes

---

## 13. User preferences (communication)

- User understands Tagalog feedback but prefers **English** in agent replies
- Only **commit/push when explicitly asked**
- QA contact gave UX feedback in Tagalog — implemented: single search, balanced grid, category icons, etc.

---

*End of handover.*
