# Agent Handover — Board Analytics PH

**Last updated:** June 2026  
**Repo:** `https://github.com/storms23/BoardMetrics-PH.git` (folder on disk may still be named `PASA RATE`)  
**Latest pushed commit:** `a3f47e2` — *Fix mobile white line artifact on scrollable tables.*

---

## Priority for next session — Graph tab trend analytics (NOT PUSHED)

This is the **most recent feature work**. It exists locally but is **uncommitted and not on Vercel** as of this handover.

### What was built

On exam detail pages (`/exams/[slug]`), the **Graph** tab inside `ExamHistoryPanel` has three annotated chart blocks, each with a compact stats sidebar and rule-based insight:

1. **Pass rate trend** — Lowest (red) + Highest (green) callouts with curved arrows; no Latest on-chart callout. No 10-yr avg reference line on chart.
2. **Examinee volume** — Peak (green) + Lowest (red) callouts with curved arrows; `VolumeStatisticsPanel` + volume insight.
3. **Pass rate & volume (dual-axis)** — ring markers on pass-rate extremes; blue pass rate + red dashed examinees; dual legend below chart; `CombinedStatisticsPanel` + combined insight.

**Try it:** `/exams/cpale`, `/exams/nursing`, `/exams/medical-technology` → National results → **Graph** tab.

### Architecture

```
src/app/exams/[slug]/page.tsx  (server)
  complete cycles → computeTrendAnalytics(complete)
                  → computeVolumeAnalytics(complete)
                  → computeCombinedAnalytics(complete)
  trendData / volumeData / combinedData from examDifficulty()
        ↓ props
src/components/ExamHistoryPanel.tsx  (client, Table | Graph tabs)
  Graph tab — three blocks, each:
    Chart + side stats panel  (lg:grid-cols-[1fr_17rem])
    TrendInsight
```

| File | Role |
|------|------|
| [`src/lib/trend-analytics.ts`](src/lib/trend-analytics.ts) | Stats + insights: `computeTrendAnalytics`, `computeVolumeAnalytics`, `computeCombinedAnalytics`. |
| [`src/components/CompactStatPanel.tsx`](src/components/CompactStatPanel.tsx) | Shared compact stat row layout for all three side cards. |
| [`src/components/charts/ChartCalloutLabel.tsx`](src/components/charts/ChartCalloutLabel.tsx) | 3-line pill SVG renderer; explicit `dotX`/`dotY` + plot bounds. |
| [`src/components/charts/ChartCalloutLayer.tsx`](src/components/charts/ChartCalloutLayer.tsx) | Recharts `Customized` overlay — scale-based coords, not ReferenceDot labels. |
| [`src/components/charts/callout-placement.ts`](src/components/charts/callout-placement.ts) | `resolveCalloutPlacementsPixel`; vertical-only collision; strict top margins. |
| [`src/components/charts/chartCoords.ts`](src/components/charts/chartCoords.ts) | `resolveChartPoint` — band scale x + numeric y to pixels. |
| [`src/components/charts/ChartScroll.tsx`](src/components/charts/ChartScroll.tsx) | Mobile horizontal scroll + dynamic chart width. |
| [`src/components/charts/ChartXAxis.tsx`](src/components/charts/ChartXAxis.tsx) | Shared two-line month/year x-axis. |
| [`src/components/charts/chartData.ts`](src/components/charts/chartData.ts) | `buildChartCycleFields`, axis lookup helpers. |
| [`src/components/charts/PassRateTrendChart.tsx`](src/components/charts/PassRateTrendChart.tsx) | Lowest (red) + Highest (green) only — no Latest callout. |
| [`src/components/charts/VolumeTrend.tsx`](src/components/charts/VolumeTrend.tsx) | Peak + Lowest examinee callouts (always above plot). |
| [`src/components/charts/RateVolumeTrend.tsx`](src/components/charts/RateVolumeTrend.tsx) | Dual-axis: blue solid pass rate + red dashed examinees; ring markers; `CombinedChartLegend` below. |
| [`src/components/TrendStatisticsPanel.tsx`](src/components/TrendStatisticsPanel.tsx) | Pass-rate stats (wraps `CompactStatPanel`). |
| [`src/components/VolumeStatisticsPanel.tsx`](src/components/VolumeStatisticsPanel.tsx) | Volume stats sidebar. |
| [`src/components/CombinedStatisticsPanel.tsx`](src/components/CombinedStatisticsPanel.tsx) | Combined pass-rate + volume stats sidebar. |
| [`src/components/TrendInsight.tsx`](src/components/TrendInsight.tsx) | Lightbulb card + source disclaimer. |
| [`src/components/ExamHistoryPanel.tsx`](src/components/ExamHistoryPanel.tsx) | Wired Graph tab; props `trendAnalytics`, `volumeAnalytics`, `combinedAnalytics`, `sourceUrl`. |
| [`src/app/exams/[slug]/page.tsx`](src/app/exams/[slug]/page.tsx) | Computes all three analytics objects and passes to panel. |

**Not changed:** [`src/components/charts/LineTrend.tsx`](src/components/charts/LineTrend.tsx) — still used on school profile pages.

### Data rules (must stay aligned with table)

- Only **`isCompleteNationalRow`** cycles (`total_takers > 0 && pass_rate != null`) — same as stat cards and table highlights.  
- **10-year average** = unweighted mean of cycle pass rates (`avgPassRate()`), **not** taker-weighted.  
- **Totals** = sum of per-cycle takers/passers across the window (`sumNationalTotals()`), not unique people.  
- **Consistency** (formerly Volatility) = standard deviation of pass rates (`stdev()` in `consistency.ts`); labels Low / Medium / High at **&lt;8**, **8–15**, **&gt;15** pts.  
- **Trend direction** (stats box): maps existing `classifyTrend()` → `Increasing` / `Stable` / `Decreasing`.  
  - Underlying formula: `(lastRate - firstRate) / n` with ±1 pt/cycle thresholds — **endpoint slope**, not full-shape analysis.  
- **Trend badge** (next to chart title): still uses `difficulty.trend` from `examDifficulty()` → `Improving` / `Stable` / `Declining`.  
  - Badge label and stats “Trend direction” can disagree on recovery-shaped series (by design unless unified later).  
- **Lowest / highest cycle picks:** earliest chronological cycle on ties for lowest; latest chronological on ties for highest.  
- **Change vs prev.:** latest complete cycle minus previous chronological cycle, shown as **pts %** (pass rate) or raw delta (volume).

### Insight text (rule-based, v1)

- **Pass rate:** `generateInsight()` — recovery, monotonic rise/fall, stable band, fallback range.  
- **Volume:** `generateVolumeInsight()` — peak cycle, rise/fall vs first cycle, stable band around avg.  
- **Combined:** `generateCombinedInsight()` — e.g. volume peaked in X while pass rate was Y%.

**Accuracy:** quoted percentages match the table. Narrative is **simplified** — rule-based, not AI.

### Chart annotation notes

- `ReferenceDot` **x** must match chart `label` (`shortCycleLabel`) — same as highlight `chartLabel`.  
- Skip callout when two highlights share the same `chartLabel`.  
- **Callouts:** `ReferenceDot` renders highlight dots only; pills render in **`ChartCalloutLayer`** (`Customized`) using axis scales for true pixel positions (avoids broken ReferenceDot label `viewBox` clamp). Middle-zone pills stay in the dot column (`dx=0`); collision is **vertical `stackDy` only**. Strict clearance: pill + leader above line; extra top margin for valley points. Edge policy (`EDGE_POLICY`) for index 0 / last point only.  
- Pass rate chart: **Lowest + Highest only** (no Latest on-chart). Every highlight **must** render its callout.  
- Volume chart: Peak + Lowest callouts.  
- Combined chart: ring markers only; blue pass rate + red dashed examinees; `CombinedChartLegend` below.  
- **X-axis:** `ChartXAxis` + `CycleAxisTick` — month and full year on separate lines; no rotation (width scales with data).  
- **Mobile:** `ChartScroll` — `overflow-x: auto`, min width `max(700px, n×60px)`, swipe to explore.

### Mobile / layout

- Graph tab: `grid lg:grid-cols-[1fr_17rem]` — stats stack under chart on small screens.  
- Charts: horizontal scroll on narrow viewports via `ChartFrame` / `ChartScroll`.  
- Table scroll hint: `TableScroll` in `ui.tsx` (swipe hint bar; **no** edge fade — removed after white-line bug).

### Suggested commit (when user asks)

```
Add graph tab analytics UX: compact stats, chart callouts, volume/combined insights.

Three annotated chart blocks with shared ChartCalloutLabel and CompactStatPanel; volume and combined analytics + side panels + rule-based insights.
```

**Files to stage:**

```
src/lib/trend-analytics.ts
src/components/CompactStatPanel.tsx
src/components/charts/ChartCalloutLabel.tsx
src/components/charts/callout-placement.ts
src/components/charts/PassRateTrendChart.tsx
src/components/charts/VolumeTrend.tsx
src/components/charts/RateVolumeTrend.tsx
src/components/TrendStatisticsPanel.tsx
src/components/VolumeStatisticsPanel.tsx
src/components/CombinedStatisticsPanel.tsx
src/components/TrendInsight.tsx
src/components/ExamHistoryPanel.tsx
src/app/exams/[slug]/page.tsx
docs/AGENT_HANDOVER.md
```

---

## 1. What this product is

**Board Analytics PH** is a national-only MVP for Philippine PRC board exam pass rates. School rankings are deferred.

**Stack:** Next.js 16 · Supabase · Python scraper/ETL · Vercel · Lucide · Recharts

**Live URL (Vercel):** `https://boardanalyticsph.vercel.app`

---

## 2. Non‑negotiable conventions

Read `.cursor/rules/pasa-rate-conventions.mdc`.

| Rule | Detail |
|------|--------|
| **Program registry** | `src/lib/programs.ts` only — never hardcode exam lists elsewhere |
| **Complete national row** | `isCompleteNationalRow` in `src/lib/exam-tracker.ts` |
| **10-year window** | `TRACKER_WINDOW_YEARS = 10` |
| **Supabase writes** | `getServiceClient()` server-only |
| **Manual CSVs** | `scraper/input/` (gitignored); ingest via `py -3 ingest_manual_national.py` |
| **Scheduled scrape** | **Disabled** (cron removed from `.github/workflows/scrape.yml`); manual CSV is source of truth until scraper is trusted again |

---

## 3. Recent shipped work (already on `main`)

| Commit | Summary |
|--------|---------|
| `a3f47e2` | Fix mobile table white-line artifact (removed scroll fade overlay) |
| `b3350b2` | Mobile responsive layout, `TableScroll` swipe hint, removed “Data available” badges on `/exams` grid |
| `23f0297` | Creator feedback API/form, admin feedback inbox, handover doc, donate QR fix |
| `489eda6` | Rebrand + Support creator nav |

### Admin (`/admin`)

- Requires `ADMIN_PASSWORD` in `.env.local` / Vercel  
- Also requires `SUPABASE_SERVICE_ROLE_KEY` on Vercel for data sections  
- **Creator feedback** table wired in admin UI (via `listCreatorFeedback()` in `src/lib/admin.ts`)

### Support (`/support`)

- Donate QR + `CreatorFeedbackForm` → `POST /api/v1/feedback` → `creator_feedback`

---

## 4. Database

- `0001_init.sql` — core schema  
- `0002_creator_feedback.sql` — feedback table (applied remote)  
- Supabase project ref: `blhwagwquxeacewzgmwq`

---

## 5. Vercel env (production)

Required for full functionality:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public reads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Feedback API + admin reads |
| `ADMIN_PASSWORD` | `/admin` login |

---

## 6. Open follow-ups

1. **Commit & push** — trend analytics (uncommitted) + scheduled-scrape disable + ETL manual-data guards  
2. **Push** `.github/workflows/scrape.yml` so GitHub stops the weekly cron on remote  
3. Compress `Logo.png` (~1.4MB)  
4. Custom domain `boardanalyticsph.com` + `NEXT_PUBLIC_SITE_URL`  
5. Unify trend badge vs stats “Trend direction” logic if user wants consistency  
6. Tune insight templates / add vitest for `trend-analytics.ts`  
7. Chart label overlap on dense exams (15+ cycles)  
8. Optional: hide duplicate hero stat cards when Graph tab active  
9. Page caching (`revalidate`) if traffic grows  
10. LET-E Mar 2019 data dispute — confirm with user  
11. **CPALE May 2025** — not in `cpale_national_complete.csv`; add row if user has official figures  
12. **ECE** — no manual CSV yet; 2025 placeholders removed; may need manual ingest or scraper fix  

---

## 6b. Manual national data (source of truth)

**Scheduled scrape is disabled** — cron removed from [`.github/workflows/scrape.yml`](../.github/workflows/scrape.yml). Use `workflow_dispatch` only when automated ingest is trusted again.

**Re-ingest all curated programs:**

```bash
cd scraper
Get-ChildItem input\*_national_complete.csv | ForEach-Object {
  py -3 ingest_manual_national.py $_.FullName
}
```

**CSV files on disk** (`scraper/input/`, gitignored):

| File | Program |
|------|---------|
| `cpale_national_complete.csv` | CPALE |
| `cele_national_complete.csv` | CELE |
| `nle_national_complete.csv` | NLE (Nursing) |
| `cle_national_complete.csv` | CLE |
| `ple_national_complete.csv` | PLE (Medicine) |
| `psy_rpm_national_complete.csv` | PSY |
| `mele_national_complete.csv` | MELE |
| `agrile_national_complete.csv` | AgriLE |
| `ree_national_complete.csv` | REE |
| `mtle_national_complete.csv` | MTLE |
| `ale_national_complete.csv` | ALE |
| `phle_national_complete.csv` | PhLE |
| `let_e_national_complete.csv` | LET-E |
| `let_s_national_complete.csv` | LET-S |

**ETL guards** (Jun 2026): `db.upsert_exam_result(..., force=True)` for manual ingest; default upsert skips overwriting `manual://` rows or good stats with placeholders. `national_validate.SOURCE_PRIORITY` treats `manual://` as highest priority.

**Cleanup orphan shells** after a bad scrape run:

```bash
py -3 cleanup_national.py --delete-placeholders --start 2024 --end 2026
```

---

## 7. Verification checklist

- [ ] `/exams/cpale` — Oct 2025 complete; no orphan incomplete rows from scraper  
- [ ] `/exams/nursing` → **Graph** tab — chart annotations, stats panel, insight  
- [ ] Numbers in stats box match table (avg, high, low, totals)  
- [ ] `/exams/nursing` → **Table** tab — swipe hint on mobile, no white stripe  
- [ ] `/admin` — feedback list loads with service role key  
- [ ] `/support` — feedback submits  
- [ ] `npx tsc --noEmit` passes (passes after trend analytics work)

---

## 8. User preferences

- English in agent replies  
- **Commit/push only when explicitly asked**  
- Manual CSV / Supabase data = source of truth  
- Chose **rule-based insights** over AI for v1  

---

*End of handover.*
