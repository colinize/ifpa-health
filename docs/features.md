# Features

A user-perspective catalog of what the IFPA Health dashboard actually does. Organized by surface area: the public dashboard, the admin endpoints, and the background cron pipeline. Every entry is traceable to a real file; nothing below is aspirational.

The dashboard is a single page (`/`) rendered as a React Server Component with `revalidate = 3600`. `"use client"` is only used on interactive leaves (count-up animation, drawer state, theme toggle).

---

## 1. Dashboard View (`/`)

Everything below renders from `app/page.tsx`. The layout flows top-to-bottom: header → health gauge → projected gauge (conditional) → narrative → three answer cards → detail drawer → footer.

### Health gauge (0–100)

- **What the user sees:** A large semi-circle SVG gauge filling from left to right, with the composite score rendered inside. A band label sits beneath it (Thriving / Healthy / Stable / Concerning / Critical). On first render the number counts up from 0 to the final value over 800ms with an `easeOutCubic` curve.
- **File path(s):** `components/health-score-gauge.tsx`, `lib/health-score.ts` (score math), `app/page.tsx:180` (wiring).
- **Current status:** Shipped.
- **Notes:** Band is driven by `getBand()` breakpoints (80/65/50/35). The 5th band in code is `critical`, not "Declining" — the spec label in `documentation-swarm.md` is out of sync with the implementation. Colors come from `--band-*` CSS variables. If band is unknown, falls back to `var(--flat)`.

### Projected gauge

- **What the user sees:** A smaller secondary gauge to the right/below the main gauge, labeled "{year} Projected," showing the score applied to forecast data plus a text CI range (e.g. "62–74"). A translucent wider band behind the arc visualizes the CI span.
- **File path(s):** `components/projected-gauge.tsx`, `lib/projected-score.ts`, `app/page.tsx:181-189`.
- **Current status:** Shipped, conditional.
- **Notes:** Only rendered when `projectedScoreResult` is non-null, which requires a `forecasts` row to exist. If the IFPA API has not yet returned player projections for the target year, the page.tsx fallback holds players/returning at the latest complete year's actuals so the gauge still computes (CI then only reflects tournament uncertainty). No count-up animation on this one.

### Narrative sentence

- **What the user sees:** A single sentence under the gauges, e.g. "Competitive pinball is growing steadily — unique players grew 8.4% year over year, with tournament count up 5.1%."
- **File path(s):** `lib/narrative.ts`, `components/narrative-display.tsx`, `app/page.tsx:57-60`.
- **Current status:** Shipped.
- **Notes:** Template-based, deterministic, no AI calls. Picks the pillar with highest deviation from 50 as primary evidence, second-highest as secondary. If spread < 8 across all three pillars, collapses to "all three indicators are trending up/down/flat." Retention phrasing shifts at 45% ("strong") / 35% ("solid") / below ("dipped").

### Three answer cards

- **What the user sees:** A 3-column grid (stacks on mobile) of cards. Each has a question, a big number, a trend line with colored arrow icon, and a small SVG sparkline showing the multi-year history. A caption above reads "{year} full-year totals."
  - **Are more people playing?** — YoY % change in unique players.
  - **Are they coming back?** — Current-year retention rate (%) with pp delta vs prior year.
  - **Is there more to compete in?** — YoY % change in tournament count.
- **File path(s):** `components/answer-card.tsx`, `components/sparkline.tsx`, `app/page.tsx:193-218`.
- **Current status:** Shipped.
- **Notes:** All three cards use the **last complete year** (filter `year < currentYear`) to avoid a partial-year YoY that would look like a 90%+ crash. Trend direction uses ±2% thresholds for YoY cards and ±1pp for retention. Sparkline renders only when ≥ 2 data points exist. When no data, shows an em-dash.

### Detail drawer

- **What the user sees:** A "More detail" chevron link at the bottom of the viewport. Clicking expands a native `<details>`/`<summary>` drawer containing five subsections. State persists in `localStorage` under key `detail-drawer-open`.
- **File path(s):** `components/detail-drawer.tsx`, `app/page.tsx:223-254`.
- **Current status:** Shipped.
- **Notes:** Uses the browser's native `<details>` element with an `onToggle` handler so open/closed state survives reloads. Chevron rotates 180° when open.

Subsections inside the drawer:

#### Player Flow (lifecycle waterfall)

- **What the user sees:** Four horizontal bars — "Started with ({priorYear})", "Didn't return" (negative, red), "New players" (positive, green), "Ended with ({currentYear})" — plus a net summary row showing absolute and percent change, and a churn-rate annotation.
- **File path(s):** `components/player-lifecycle.tsx`.
- **Current status:** Shipped, conditional.
- **Notes:** Only rendered when both years exist AND `latestYear.returning_players > 0`. Computed in `page.tsx:44-55`.

#### Forecast card

- **What the user sees:** Headline projected tournament count for the target year, the 68% CI range, the prior-year comparison with color-coded change percent, and a footnote noting how many months of data the projection is based on.
- **File path(s):** `components/detail-drawer.tsx:114-141`.
- **Current status:** Shipped, conditional.
- **Notes:** Only renders when `forecast.months_of_data >= 2`. If prior-year tournaments is unknown, the comparison line is omitted.

#### Monthly Pulse

- **What the user sees:** A responsive grid of up to 12 recent months. Each tile shows month abbrev + 2-digit year, the event count, and a YoY delta percent. Left border color and delta color are green/red/flat based on ±2% thresholds.
- **File path(s):** `components/monthly-pulse.tsx`.
- **Current status:** Shipped.
- **Notes:** Sorted chronologically, sliced to last 12.

#### Players by Country

- **What the user sees:** A top-15 ranked list. Each row has the country name, active-player count (right-aligned, mono), and — if multi-snapshot data exists — an absolute+percent change annotation. Each row has a horizontal bar whose width is relative to the top country's count. A footnote reads "Change since {earliest snapshot date}."
- **File path(s):** `components/country-growth.tsx`, `app/page.tsx:123-154` (derivation).
- **Current status:** Shipped, with caveat.
- **Notes:** Comparison is **first snapshot vs latest snapshot per country**, not a true rolling window. Known tech debt from `CLAUDE.md` — if the first snapshot was last week, "growth" means "last week," not "growth over a meaningful period."

#### Year-over-Year table

- **What the user sees:** A sortable-looking (not actually sortable) table of year, tournaments, entries, unique players, retention rate, ascending by year. If a projection exists, a trailing "est." row is appended with `~` prefixes on projected values and an explanatory footnote. Retention column shows em-dashes for the projected row.
- **File path(s):** `components/year-table.tsx`.
- **Current status:** Shipped.
- **Notes:** Projected row only appears when `forecast.months_of_data >= 2` AND `currentYearActuals` is present. Footnote explicitly says "Player data not yet available from IFPA" — referring to the gap where current-year player counts aren't published until year-end.

#### Methodology footnote

- **What the user sees:** A single italic-toned line at the bottom of the drawer: "Health score = equal-weighted average of player growth, retention, and tournament growth."
- **File path(s):** `components/detail-drawer.tsx:181-184`.
- **Current status:** Shipped.

### Data freshness badge

- **What the user sees:** A small outline badge in the header next to "IFPA Health" reading "Last updated {relative time}". If the most recent `collection_runs.completed_at` is more than 48 hours old, the badge switches to a destructive (red) variant. If no run has ever completed, it reads "No data collected yet."
- **File path(s):** `components/data-freshness.tsx`, `app/page.tsx:170`.
- **Current status:** Shipped.
- **Notes:** Driven by the single latest row of `collection_runs` regardless of status; a failed run with a `completed_at` still updates the timestamp. Uses `date-fns formatDistanceToNow`.

### Theme toggle

- **What the user sees:** A sun/moon button in the top-right of the header. Clicking it toggles the `.light` class on `<html>` and persists the choice in `localStorage` under key `theme`.
- **File path(s):** `components/theme-toggle.tsx`, `app/globals.css` (tokens).
- **Current status:** Shipped.
- **Notes:** Dark is the default (root selector is dark; `.light` is opt-in). Initial theme is applied inline via `app/layout.tsx` to prevent FOUC — the toggle just reads whatever class is already present.

### Footer

- **What the user sees:** "Data from IFPA API. Not affiliated." with the link to ifpapinball.com.
- **File path(s):** `app/page.tsx:257-259`.
- **Current status:** Shipped.

---

## 2. Admin Endpoints

Both routes live under `app/api/admin/` and share `CRON_SECRET` bearer-token auth. There is no UI — these are curl-only. Tech-debt note from `CLAUDE.md`: these should move to a separate `ADMIN_SECRET` and use `crypto.timingSafeEqual` before the admin URLs are published.

### `GET /api/admin/observations`

- **What it does:** Returns all rows from the `observations` table, ordered by `period_start` ascending.
- **File path(s):** `app/api/admin/observations/route.ts`.
- **Current status:** Shipped.
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` (plain `!==` compare).

### `POST /api/admin/observations`

- **What it does:** Inserts a ground-truth observation (human-assessed health for a date range). Validates `period_start`, `period_end`, `observed_health` (must be one of the 5 bands), and `observed_score` (0–100). Optional `notes` and `evidence` fields.
- **File path(s):** `app/api/admin/observations/route.ts`.
- **Current status:** Shipped.
- **Notes:** These observations feed the calibration endpoint below. Enum list in code is `thriving / healthy / stable / concerning / critical`.

### `POST /api/admin/calibrate`

- **What it does:** Runs methodology calibration. Reads all observations, methodology versions, and shadow scores. For each version, computes Mean Absolute Error (MAE) between shadow scores (within observation date ranges) and observed scores. Writes `backtest_mae` back to `methodology_versions` and returns a ranked list with a recommendation string ("Version N has lowest MAE (X.X)").
- **File path(s):** `app/api/admin/calibrate/route.ts`.
- **Current status:** Shipped, requires seed data.
- **Notes:** Returns 400 if fewer than 3 observations exist. Match logic is date-range overlap: any shadow score with `score_date` inside the observation's `[period_start, period_end]` is averaged into that observation's predicted score. No p-value or confidence interval — just sorted MAE.

---

## 3. Cron Pipeline

Two Vercel cron jobs — declared in `vercel.json` — write to the database on a schedule. The user never interacts with these directly; their effect is visible only through (a) fresh numbers on the dashboard and (b) the freshness badge updating. Each run writes a `collection_runs` row with a `status` field that transitions `running` → `success` or `error`.

### Daily cron — `/api/cron/daily` at 08:00 UTC

- **What it refreshes:** Overall IFPA stats snapshot, WPPR top-N rankings, health score computation, forecast computation.
- **File path(s):** `app/api/cron/daily/route.ts`, collectors in `lib/collectors/` (`daily-collector.ts`, `health-scorer.ts`, `forecaster.ts`), `vercel.json`.
- **Current status:** Shipped.
- **Notes:** `maxDuration: 300` seconds. Auth via `Authorization: Bearer ${CRON_SECRET}`. Aggregates each collector's `{ records_affected, details }` return into the `collection_runs.details` JSON blob.

### Weekly cron — `/api/cron/weekly` at 09:00 UTC Mondays

- **What it refreshes:** Annual snapshots (per-year totals), monthly event counts (12-month rolling), country player snapshots.
- **File path(s):** `app/api/cron/weekly/route.ts`, collectors in `lib/collectors/` (`annual-collector.ts`, `monthly-collector.ts`, `country-collector.ts`), `vercel.json`.
- **Current status:** Shipped.
- **Notes:** Same `maxDuration: 300` and bearer auth pattern as daily. These tables change less often, so weekly is sufficient; the daily cron will still compute a fresh health score on top of whatever annual data exists.

### Manual cron trigger

- **What the user sees:** Nothing — this is an operator action.
- **Command:** `curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/daily` (or `/weekly`).
- **Current status:** Shipped.
- **Notes:** Useful after a schema migration or backfill to force a recompute without waiting for the schedule.

---

## What the dashboard does NOT have

For the avoidance of ambiguity — these features are referenced in adjacent projects' docs but do not exist here:

- No user accounts, signup, login, or sessions.
- No comments, ratings, or any user-generated content.
- No search. The page is a single viewport.
- No additional routes beyond `/`, `/api/cron/*`, and `/api/admin/*`.
- No email, webhooks outbound, or push notifications.
- No error tracking (Sentry etc.) — if a cron fails, the only signal is `collection_runs.status = 'error'` and the freshness badge going stale after 48 hours.
