# Pass 1 — Route & Component Inventory

## Pre-Flight Summary

- **Prior audit:** none (first run of `_audit/`).
- **Baseline tests:** `npx vitest run` — 29 passed across 4 files (health-score 14, narrative 7, projected-score 5, forecast 3).
- **Baseline lint:** 5 errors in `scripts/migrate-002.cjs` (out of scope — ops), and 2 `react-hooks/set-state-in-effect` errors: `components/theme-toggle.tsx:11` and `components/detail-drawer.tsx:69`. Both are deferred to Pass 3.
- **Tokens loaded** from `app/globals.css`: `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--up`, `--down`, `--flat`, `--band-thriving`, `--band-healthy`, `--band-stable`, `--band-concerning`, `--band-critical`. Dark-first; `.light` is opt-in via `@custom-variant light (&:is(.light *))`.
- **Code changes this pass:** none. All fix-eligible items came up clean.

## Route Tree

```
app/
├─ page.tsx                       # / — Server Component, revalidate = 3600
├─ layout.tsx                     # Root + inline theme-restore script
├─ globals.css
├─ favicon.ico
└─ api/
   ├─ cron/daily/route.ts         # 70 lines
   ├─ cron/weekly/route.ts        # 65 lines
   ├─ admin/observations/route.ts # 70 lines
   └─ admin/calibrate/route.ts    # 102 lines
```

⚪ **INFO** — matches the expected layout exactly. No orphan routes, no test pages, no scaffolding. Admin routes are known-unauthed tech debt (per CLAUDE.md).

## `/` Route

**File:** `app/page.tsx` · **Rendering:** Server Component, `revalidate = 3600` (line 14) · **Client fetching:** none.

**Supabase queries** (`Promise.all`, `app/page.tsx:19–33`):

1. `health_scores` — latest by `score_date` (single).
2. `annual_snapshots` — all rows, asc by `year`.
3. `monthly_event_counts` — all rows, asc by `year,month`.
4. `forecasts` — latest by `forecast_date` (single).
5. `collection_runs` — latest by `started_at` (single).
6. `country_snapshots` — all rows, asc by `snapshot_date`.

**Page-local derivations** (`app/page.tsx:35–162`):

- `currentYear = new Date().getFullYear()` → `completeYears` filter (excludes partial current year) (L36–37).
- `latestYear`, `priorYear`, `currentYearRow` (L38–42).
- `lifecycleData` waterfall (L45–55).
- `narrative` via `generateNarrative()` (L58–60).
- `projectedScoreResult` via `computeProjectedScore()`, with fallback when `projected_unique_players === 0` (L65–94).
- `playerYoyPct`, `retentionDelta`, `tournamentYoyPct` (L97–107).
- Sparkline arrays for all 3 answer cards (L110–112).
- `getTrend()` / `getRetentionTrend()` helpers (L115–120, L157–162).
- `countryGrowthData` — compare earliest vs latest snapshot per country, sort by `active_players` desc (L123–154).

**Render order** (L164–261):

1. `<header>` → `<h1>IFPA Health</h1>` + `DataFreshness` + `ThemeToggle`
2. `<main>` → `HealthScoreGauge` → (conditional) `ProjectedGauge` → `NarrativeDisplay` → 3× `AnswerCard`
3. `DetailDrawer` (outside `<main>`)
4. `<footer>` → IFPA attribution link (`rel="noopener noreferrer"` present, L258 ✓)

## Component Inventory

### Project components (`components/`)

| # | File | Mode | Props | Renders | Used by |
|---|---|---|---|---|---|
| 1 | `health-score-gauge.tsx` | `"use client"` | `{ score, band }` | 200×120 SVG semi-circle gauge with cubic ease-out count-up (`useEffect` + `requestAnimationFrame`), band-colored arc, band label. | `app/page.tsx` |
| 2 | `projected-gauge.tsx` | **Server** | `{ score, band, ciLow, ciHigh, year }` | 120×72 SVG gauge with translucent CI range band, solid progress arc, year label, range text. No animation. | `app/page.tsx` |
| 3 | `narrative-display.tsx` | Server | `{ text }` | Single centered `<p>` in `text-muted-foreground`. | `app/page.tsx` |
| 4 | `answer-card.tsx` | Server | `{ question, value, trend: { direction, label }, sparklineData }` | Card with question, value, trend icon + label (`text-up/down/flat`), sparkline at bottom. | `app/page.tsx` (×3) |
| 5 | `detail-drawer.tsx` | `"use client"` | `{ forecast, annualData, monthlyData, countryGrowthData, priorYearTournaments, currentYearActuals, lifecycleData }` | Native `<details>`/`<summary>` toggle with localStorage persistence. Contains Player Flow, Forecast block, Monthly Pulse, Country Growth, Year-over-Year. | `app/page.tsx` |
| 6 | `data-freshness.tsx` | Server | `{ lastRun: { completed_at, status } \| null }` | `Badge` showing relative time (`date-fns/formatDistanceToNow`); `destructive` variant past 48h. | `app/page.tsx` |
| 7 | `theme-toggle.tsx` | `"use client"` | none | Icon button (Sun/Moon) that toggles `.light` on `<html>` and mirrors to `localStorage('theme')`. | `app/page.tsx` |
| 8 | `monthly-pulse.tsx` | Server | `{ data: MonthRow[] }` | 12-month grid (last 12); each cell shows month, count, YoY % with left accent border from `--up/down/flat`. | `DetailDrawer` |
| 9 | `year-table.tsx` | Server | `{ data: YearRow[], projected?: ProjectedRow \| null }` | HTML `<table>` year-by-year; optional projected row with CI footnote. | `DetailDrawer` |
| 10 | `country-growth.tsx` | Server | `{ data: CountryGrowthEntry[] }` | Top-15 countries with proportional background bar, change delta when multiple snapshots exist. Returns `null` on empty. | `DetailDrawer` |
| 11 | `player-lifecycle.tsx` | Server | `PlayerLifecycleProps` (priorYear/currentYear/priorTotal/returning/churned/newPlayers/currentTotal) | 4-row waterfall + net/churn summary. | `DetailDrawer` |
| 12 | `sparkline.tsx` | Server | `{ data: number[], color?, width?, height? }` | `<svg>` polyline + end-point circle. Returns `null` if `data.length < 2`. | `AnswerCard` |

### shadcn primitives (`components/ui/`)

| File | Exports | Used? |
|---|---|---|
| `badge.tsx` | `Badge`, `badgeVariants` | ✅ `DataFreshness` imports `Badge`. `badgeVariants` export is unused (shadcn convention; leave). |
| `card.tsx` | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent` | ❌ No importers — answer/detail cards use raw `<div className="bg-card …">`. |
| `separator.tsx` | `Separator` | ❌ No importers. |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | ❌ No importers. Year-table uses native `title=` attrs instead. |

## Component Dependency Tree

```
app/page.tsx  (Server Component)
├─ DataFreshness          (server)
├─ ThemeToggle            (client — localStorage + DOM class toggle)
├─ HealthScoreGauge       (client — RAF count-up)
├─ ProjectedGauge         (server — no animation)
├─ NarrativeDisplay       (server)
├─ AnswerCard × 3         (server)
│  └─ Sparkline           (server)
└─ DetailDrawer           (client — localStorage, <details> toggle)
   ├─ PlayerLifecycle     (server)
   ├─ MonthlyPulse        (server)
   ├─ CountryGrowth       (server)
   └─ YearTable           (server)
```

Client leaves are exactly the 3 expected: `ThemeToggle`, `HealthScoreGauge`, `DetailDrawer`. `ProjectedGauge` is server (no animation, no interactivity) — matches CLAUDE.md.

## Findings

- 🔵 **LOW** — `components/ui/card.tsx`, `components/ui/separator.tsx`, `components/ui/tooltip.tsx` are unused shadcn primitives. 117 lines across 3 files of dead scaffolding. Safe to delete; leaving as-is this pass since "delete route files" was the only deletion mandate and shadcn re-add via `npx shadcn add` is one command if ever needed. Recommend deletion in a follow-up cleanup commit.
- 🔵 **LOW** — `components/ui/badge.tsx` exports `badgeVariants` which is never imported externally. Keep (shadcn convention).
- ⚪ **INFO** — `components/player-lifecycle.tsx` receives `returning` in its props interface but never destructures or reads it (L22). Prop is load-bearing in `app/page.tsx:50` derivation, not here. Harmless; flag for Pass 2 or removal if the prop contract is later tightened.
- ⚪ **INFO** — Only one external `<a target="_blank">` exists (`app/page.tsx:258` to ifpapinball.com); `rel="noopener noreferrer"` is already set. No regressions.
- ⚪ **INFO** — No orphan routes, no broken internal links, no dead component imports in `app/page.tsx` or the 12 components.
- ⚪ **INFO** — 2 lint `react-hooks/set-state-in-effect` errors exist (theme-toggle L11, detail-drawer L69). Both are behavioural/interaction concerns deferred to Pass 3 per audit spec.

## Inline Fixes Applied

None. Every fix-eligible category (unused imports/exports in-scope files, empty routes, broken internal links, missing `rel="noopener noreferrer"`) came up clean on inspection.

## Verification

- `npm run lint` — unchanged from baseline (5 errors in `scripts/migrate-002.cjs` out of scope; 2 set-state-in-effect errors deferred to Pass 3).
- `npx vitest run` — 29/29 passing.
