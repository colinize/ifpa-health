# Patterns & Conventions

This is a reference for the patterns and conventions in use across `ifpa-health`. Every pattern names a **canonical file** where the best example lives. If you're adding new code, match what's already here.

---

## 1. Server Components by default

The dashboard is a single Server Component. All data fetching happens server-side during render. `"use client"` is reserved for interactive leaves — a theme toggle, a gauge count-up animation, a drawer that persists open/closed state. No page or library code fetches data in the browser.

- **Canonical RSC:** `app/page.tsx` — async function, calls `createPublicClient()` at the top, runs 6 parallel `supabase.from(...)` selects, computes derivations inline, returns JSX.
- **Canonical client leaf:** `components/theme-toggle.tsx` — marked `"use client"` because it touches `localStorage` and `document.documentElement`. Nothing else in the theme-toggle file is shared upward.

Other client leaves: `components/detail-drawer.tsx` (native `<details>` + localStorage), `components/health-score-gauge.tsx` (count-up animation).

**Rule:** if a component needs `useState`, `useEffect`, event handlers, or the DOM, mark it `"use client"` and keep the file narrow. Everything else stays server-rendered.

---

## 2. Page-local derivations live in `app/page.tsx`

This project is small enough that splitting every computed array into a `lib/queries/*` module would be premature. Derivations live next to where they're consumed — inside `app/page.tsx`, directly after the `Promise.all` fetch block. If a derivation ever gets reused, or earns a test, it graduates to `lib/`.

- **Canonical:** `app/page.tsx:44-55` — the player-lifecycle waterfall is computed inline from `latestYear` / `priorYear`:

```ts
const lifecycleData = latestYear && priorYear && latestYear.returning_players > 0
  ? {
      priorYear: priorYear.year,
      currentYear: latestYear.year,
      priorTotal: priorYear.unique_players,
      returning: latestYear.returning_players,
      churned: priorYear.unique_players - latestYear.returning_players,
      newPlayers: latestYear.unique_players - latestYear.returning_players,
      currentTotal: latestYear.unique_players,
    }
  : null
```

Same pattern for `countryGrowthData` (`app/page.tsx:123-154`), the three sparkline arrays (`app/page.tsx:110-112`), and the YoY/trend helpers (`getTrend`, `getRetentionTrend`).

**Rule:** one-call-site derivations stay in the page. Anything reused or tested goes to `lib/`. Pure math with fixtures → `lib/` with a Vitest file.

---

## 3. Collector return shape

Every collector returns the exact same shape: `{ records_affected: number, details: Record<string, unknown> }`. Cron routes aggregate these into the `collection_runs` row. Errors must surface — a caught error that only logs is a silent bug. If a collector can't do its job, throw; the cron wrapper will flip the `collection_runs` row to `status='error'` with a message.

- **Canonical:** `lib/collectors/daily-collector.ts` — reads IFPA, upserts into two tables, returns `{ records_affected, details: { overall, rankings } }`.
- Same shape in all 6: `daily-collector.ts`, `annual-collector.ts`, `monthly-collector.ts`, `country-collector.ts`, `health-scorer.ts`, `forecaster.ts`.

Two nuances the current code already illustrates:

- **Per-table errors** (e.g. a single upsert failing) are logged via `console.error` and the collector continues — `records_affected` reflects only what succeeded. See `daily-collector.ts:43-47`.
- **Hard failures** (e.g. no source data to score) are thrown. See `health-scorer.ts:29-35`:

```ts
if (annualError) throw new Error(`Failed to fetch annual_snapshots: ${annualError.message}`)
if (!annualRows || annualRows.length === 0) {
  throw new Error('No annual_snapshots data found for completed years')
}
```

**Rule:** never swallow an error that changes whether the collector did its job. Throw, or document in `details`.

---

## 4. IFPA API field-name fixes

The real IFPA v2 response shape differs from the published docs. All deltas are patched inside `lib/ifpa-client.ts` TypeScript interfaces and applied in collectors before any DB insert. See `NOTES.md` session 2 for the discovery trail.

Known deltas (reflecting actual code in `lib/ifpa-client.ts`):

| Endpoint | Expected (docs) | Actual (code) |
|---|---|---|
| `GET /stats/events_by_year` | response key `events_by_year` | response key `stats`; entry fields `tournament_count` / `player_count` (singular) |
| `GET /stats/players_by_year` | fields `unique_players`, `returning_players` | response key `stats`; entry fields `count` (current), `previous_year_count`, `previous_2_year_count` |
| `GET /stats/country_players` | response key `country_list`, field `count` | response key `stats`, field `player_count` |
| `GET /stats/overall` | flat age fields | age nested under `stats.age` with keys like `age_18_to_29`, `age_50_to_99` |
| `GET /rankings/wppr` | `first_name`/`last_name`, `wppr_rank`, `ratings_value` | `name` (full), `current_rank`, `rating_value`; collectors split `name` on whitespace |

> **Discrepancy flag for `CLAUDE.md` / `NOTES.md`:** both session notes and `CLAUDE.md` list `players_by_year` fields as `current_year_count` / `previous_year_count`. The actual interface in `lib/ifpa-client.ts:32-38` and the usage in `lib/collectors/annual-collector.ts:30-32` both use **`count`** (not `current_year_count`). `CLAUDE.md` should be corrected on next swarm run.

- **Canonical:** `lib/ifpa-client.ts` (types + fetch wrappers). All coercion from the string-typed IFPA response to numeric DB columns happens inside the collector (`parseInt`, `parseFloat`).

---

## 5. Complete-year filtering

The current calendar year is always partial, and a YoY against a partial year looks like a 90%+ collapse. Every path that computes a YoY or picks "the latest year" must filter `year < currentYear` first. The forecast path is the only place that surfaces the partial year — and it does so as a projection, with CIs.

- **Canonical:** `app/page.tsx:36-42`:

```ts
const currentYear = new Date().getFullYear()
const completeYears = annualSnapshots?.filter(s => s.year < currentYear) ?? []
const latestYear = completeYears[completeYears.length - 1]
const priorYear = completeYears[completeYears.length - 2]

// Current (incomplete) year actuals for the YoY table projected row
const currentYearRow = annualSnapshots?.find(s => s.year === currentYear)
```

Same filter appears in `lib/collectors/health-scorer.ts:26` — the scorer uses `.lt('year', currentYear)` when querying `annual_snapshots`.

**Rule:** anywhere you pick a "latest" year to display or compute against, apply the filter. The only legitimate use of `currentYearRow` is in the forecast card to show YTD actuals against a projection.

---

## 6. Breakpoint-based scoring

The v2 health score replaced 6 weighted arbitrary components with 3 equally-weighted pillars (players, retention, tournaments). Each pillar maps a raw value to a 0–100 score via piecewise-linear interpolation between breakpoints. Weight is `1/3` for every pillar.

- **Canonical:** `lib/health-score.ts:30-34`:

```ts
const BREAKPOINTS: Record<string, Breakpoints> = {
  players:     [[-10, 0], [0, 50], [15, 100]],
  retention:   [[25, 0], [35, 50], [50, 100]],
  tournaments: [[-10, 0], [0, 50], [15, 100]],
}
const WEIGHT = 1 / 3
```

- **Interpolation helper:** `interpolate(value, breakpoints)` — clamps below the first breakpoint, clamps above the last, linearly interpolates between adjacent pairs. `lib/health-score.ts:38-52`.
- **Band thresholds:** `getBand()` — `thriving ≥ 80`, `healthy ≥ 65`, `stable ≥ 50`, `concerning ≥ 35`, below that `critical`.

**Rule:** to change scoring behavior, edit breakpoints here and update fixtures in `lib/__tests__/health-score.test.ts`. Run `npx tsx scripts/recompute-v2-score.ts` to rewrite the latest stored score without waiting for cron.

---

## 7. Template-based narrative

The sentence under the gauge is a deterministic template generator — no LLM, no API cost, no latency, no drift. Pillars are ranked by deviation from 50 (how far off "neutral" they are); the most extreme drives primary evidence, second-most provides secondary evidence. When all three pillars agree, a single "all indicators trending X" summary is emitted instead.

- **Canonical:** `lib/narrative.ts`.
- **Spread threshold:** `spread < 8` (`lib/narrative.ts:39`). This is tuned lower than the original spec's `< 15` for better behavior on real data where pillar scores cluster tightly. Do not revert without re-reading session 5 in `NOTES.md`.
- **Band → trend phrase:** `TREND_PHRASES` at `lib/narrative.ts:7-13` (`thriving → "thriving"`, `critical → "in decline"`, etc.).
- **Phrasing rules:** `|rawValue| < 2` → "roughly flat" (avoid "up 0.3%"). Retention has tiered language (`≥ 45` strong, `≥ 35` solid, below → "dipped"/"just").

**Rule:** update `lib/narrative.ts` + its test in one commit. No recompute needed since narrative is generated per render, not stored.

---

## 8. Dark-first CSS

The dashboard's default theme is dark. `.light` is an opt-in class toggled on `<html>` by the theme script in `app/layout.tsx`. All colors come from CSS custom properties declared on `:root` (dark values) and overridden under `.light`. Tailwind v4 maps these via `@theme inline` in `app/globals.css`.

- **Canonical:** `app/globals.css:1-77`.
- **Functional tokens** (do not use hard-coded hex for these):
  - `--up`, `--down`, `--flat` — trend colors, used by sparklines, YoY indicators
  - `--band-thriving`, `--band-healthy`, `--band-stable`, `--band-concerning`, `--band-critical` — gauge band colors
- **Color space:** `oklch(...)`. Matches shadcn/ui v2 convention.
- **Custom variant:** `@custom-variant light (&:is(.light *))` — use `light:` prefix in className for light-only rules.

**Rule:** new colors land as tokens. New trend states would get new `--xxx` tokens, not `#hex` in a component.

---

## 9. ISR with 1-hour revalidate

The root page uses Incremental Static Regeneration with a 1-hour window. No on-demand invalidation is wired — cron data can be up to 1 hour stale on the public dashboard.

- **Canonical:** `app/page.tsx:14`: `export const revalidate = 3600`.

Consequence: a successful cron run at 08:00 UTC won't be visible in production until the ISR window rolls over. For operator checks, trigger the cron URL manually and then hit the page with a cache-busting query string, or wait.

**Rule:** don't bypass ISR in components. If you need fresh-every-request for a specific route, make it a separate route with `revalidate = 0`.

---

## 10. Database conventions

All schema choices in `supabase/migrations/001_initial_schema.sql`. Opinions:

- **Columns:** `snake_case` throughout.
- **PKs:** `bigint generated always as identity primary key` — not UUID. Every table.
- **Timestamps:** `timestamptz` with `default now()`. Never `timestamp` without zone.
- **Every table has one of:** `created_at` (for event-style tables like `observations`, `methodology_versions`, `collection_runs`) or `collected_at` (for snapshot-style tables). Many snapshot tables also have a domain date like `snapshot_date` / `score_date` / `forecast_date` with a unique constraint.
- **Generated columns** (do not insert these from collectors):
  - `annual_snapshots.avg_attendance = player_entries / nullif(tournaments, 0)` — `numeric(5,1)`, stored.
  - `annual_snapshots.retention_rate = case when unique_players > 0 then returning_players / unique_players * 100 else null end` — `numeric(5,1)`, stored.
- **Constraints:** `check` constraints inline, not separate statements. See `health_scores.band` and `collection_runs.status`.
- **Uniqueness:** natural-key uniqueness via `unique(...)` at the end of `CREATE TABLE` (e.g. `unique(year)`, `unique(snapshot_date, country_name)`).
- **RLS:** enabled on all 11 tables. Two policies per table — `anon` can `SELECT`, `service_role` can do everything (`FOR ALL`).

**Rule:** new tables match this shape exactly. New columns: prefer generated over computed-at-insert when the formula is stable.

---

## 11. Testing pattern

Tests are Vitest, in `lib/__tests__/`, and target **pure functions only**. No DB mocks. No network mocks. No component tests. If a unit is hard to test this way, that's a signal to refactor the logic into a pure helper.

- **Four test files** in `lib/__tests__/`:
  - `health-score.test.ts` — breakpoints, pillar weights, band thresholds, interpolation edge cases.
  - `projected-score.test.ts` — health score applied to forecast output.
  - `forecast.test.ts` — seasonal-ratio projection math, CI computation.
  - `narrative.test.ts` — template sentence output for each band and spread regime.
- **Canonical:** `lib/__tests__/health-score.test.ts` — imports `computeHealthScore`, `interpolate`, `getBand` and asserts against raw inputs.
- **Runner:** `npx vitest run` (single) / `npx vitest` (watch). No `test` script in `package.json`.

**Rule:** every `lib/*.ts` with non-trivial math gets a co-located test file. Collectors (which talk to IFPA + Supabase) are intentionally untested — they're glue; the math they rely on is tested in isolation.

---

## 12. Type coercion: `parseFloat(String(...))`

Supabase's `numeric` columns come back from the JS client as **strings**, not numbers, regardless of how they're declared in Postgres. The page handles this inline with `parseFloat(String(value ?? 0))`. This is a smell — a generated typed client or a thin DTO layer could replace it — but it's consistent across the codebase and called out here so nobody adds a fourth variant.

- **Canonical location:** `app/page.tsx:73-88` (forecast fields), `app/page.tsx:102-107` (retention, tournament YoY), `app/page.tsx:111, 237` (sparkline + year table).
- Also appears in `lib/collectors/health-scorer.ts:54-58`.

```ts
retentionRate = latestYear?.retention_rate ? parseFloat(String(latestYear.retention_rate)) : null
projected_tournaments: Math.round(parseFloat(String(forecast.projected_tournaments ?? 0))),
```

**Rule:** when reading a `numeric` column, run it through `parseFloat(String(x ?? 0))` (or `?? null`). Do not trust the TS type — it lies. If this grows beyond a dozen sites, extract a `numericToNumber(value)` helper.

---

## 13. File naming

- **Components:** kebab-case `.tsx` — `answer-card.tsx`, `detail-drawer.tsx`, `health-score-gauge.tsx`, `projected-gauge.tsx`, `monthly-pulse.tsx`, `country-growth.tsx`, `player-lifecycle.tsx`, `year-table.tsx`, `narrative-display.tsx`, `data-freshness.tsx`, `sparkline.tsx`, `theme-toggle.tsx`. shadcn primitives under `components/ui/`.
- **Lib modules:** kebab-case `.ts` — `health-score.ts`, `projected-score.ts`, `ifpa-client.ts`, `narrative.ts`, `forecast.ts`, `supabase.ts`, `utils.ts`.
- **Collectors:** `lib/collectors/*-collector.ts` (except `health-scorer.ts` and `forecaster.ts` — named after what they compute, not the collector suffix).
- **Tests:** `lib/__tests__/<module>.test.ts`. Mirrors the tested module name one-to-one.
- **Scripts:** `scripts/*.ts`, run via `npx tsx scripts/<name>.ts`. Each script is self-describing in its top comment; no README.
- **Migrations:** `supabase/migrations/NNN_<snake_case_description>.sql`, zero-padded 3-digit sequence.

**Rule:** no PascalCase filenames. No `.jsx`. No `index.ts` barrels in `lib/` — import directly from the module.

---

## Quick reference: canonical file for each pattern

| # | Pattern | Canonical file |
|---|---|---|
| 1 | Server Components by default | `app/page.tsx`, `components/theme-toggle.tsx` |
| 2 | Page-local derivations | `app/page.tsx:44-55` |
| 3 | Collector return shape | `lib/collectors/daily-collector.ts` |
| 4 | IFPA field-name fixes | `lib/ifpa-client.ts` |
| 5 | Complete-year filter | `app/page.tsx:36-38` |
| 6 | Breakpoint-based scoring | `lib/health-score.ts` |
| 7 | Template narrative | `lib/narrative.ts` |
| 8 | Dark-first CSS tokens | `app/globals.css` |
| 9 | ISR revalidate | `app/page.tsx:14` |
| 10 | DB conventions | `supabase/migrations/001_initial_schema.sql` |
| 11 | Testing pattern | `lib/__tests__/health-score.test.ts` |
| 12 | `parseFloat(String(...))` coercion | `app/page.tsx:73-107` |
| 13 | File naming | (project-wide) |
