# Pass 2 — Data Binding Audit

## Changes Since Last Audit

First data-binding pass. Pass 1 left 2 deferred `react-hooks/set-state-in-effect` errors for Pass 3 — untouched here. No other inline fixes predated this pass.

## Summary

- **Fixes applied:** Tightened all 6 `select('*')` queries in `app/page.tsx` to explicit column lists.
- **Band-string enum** is consistent end-to-end: `thriving / healthy / stable / concerning / critical` across `lib/health-score.ts:5`, the DB `check` constraint (`001_initial_schema.sql:101`), CSS tokens (`app/globals.css:30-34, 72-76, 106-110`), and both gauges (`components/health-score-gauge.tsx:11-16`, `components/projected-gauge.tsx:10-15`). **No `declining` drift anywhere.** The older "declining" label mentioned in the audit spec / CLAUDE.md is not present — either it was historical or already cleaned up.
- **Partial-year handling is clean.** All three `.getFullYear()` usages in `app/page.tsx` are the documented complete-year filter pattern. Sparklines, metric cards, and `lifecycleData` all read from `completeYears`, never from `currentYear`.
- **Severity counts:** 🔴 0 · 🟠 3 · 🟡 3 · 🔵 1 · ⚪ 2.

## Binding Table

| UI element | File:line | Value source | Supabase column | Collector | IFPA endpoint |
|---|---|---|---|---|---|
| Wordmark "IFPA Health" | `app/page.tsx:169` | static | — | — | — |
| Freshness badge text | `components/data-freshness.tsx:13` | `formatDistanceToNow(lastRun.completed_at)` | `collection_runs.completed_at` | cron route | — |
| Freshness badge variant | `components/data-freshness.tsx:14,17` | `isStale = now − completed_at > 48h` | `collection_runs.completed_at` | cron route | — |
| Theme toggle icon | `components/theme-toggle.tsx` | `<html>.classList.contains('light')` | — (localStorage) | — | — |
| Gauge score number | `app/page.tsx:180` → `components/health-score-gauge.tsx:106` | `healthScore.composite_score ?? 0` | `health_scores.composite_score` | `health-scorer.ts` | derived (no endpoint) |
| Gauge arc color | `components/health-score-gauge.tsx:23,90` | `bandColors[band]` → `var(--band-*)` | `health_scores.band` | `health-scorer.ts` | — |
| Gauge band label | `components/health-score-gauge.tsx:114` | `band.charAt(0).toUpperCase() + band.slice(1).toLowerCase()` | `health_scores.band` | `health-scorer.ts` | — |
| Projected gauge score | `components/projected-gauge.tsx:88` | `projectedScoreResult.projected_score` | derived from `forecasts.*` + `annual_snapshots.*` | `forecaster.ts` | `events_by_year` (monthly) |
| Projected gauge CI range | `components/projected-gauge.tsx:97` | `projectedScoreResult.ci_low_score` / `ci_high_score` | derived from `forecasts.ci_68_*` | `forecaster.ts` | — |
| Projected gauge year | `components/projected-gauge.tsx:93` | `forecast!.target_year` | `forecasts.target_year` | `forecaster.ts` | — |
| Narrative sentence | `app/page.tsx:190` → `components/narrative-display.tsx:7` | `generateNarrative(healthScore)` | `health_scores.components` + `band` | template `lib/narrative.ts` | — |
| "{year} full-year totals" | `app/page.tsx:197` | `latestYear.year` | `annual_snapshots.year` | `annual-collector.ts` | — |
| Players card value | `app/page.tsx:202` | `latestYear.unique_players.toLocaleString()` | `annual_snapshots.unique_players` | `annual-collector.ts` | `players_by_year.count` |
| Players card trend | `app/page.tsx:203,97-99` | `((latest − prior) / prior) × 100` | `annual_snapshots.unique_players` (×2) | `annual-collector.ts` | `players_by_year` |
| Players sparkline | `app/page.tsx:110,204` | `completeYears.map(unique_players)` | `annual_snapshots.unique_players` | `annual-collector.ts` | `players_by_year` |
| Retention card value | `app/page.tsx:208,102` | `parseFloat(latestYear.retention_rate)` | `annual_snapshots.retention_rate` ★ generated | — (DB) | `players_by_year` (derived) |
| Retention card trend | `app/page.tsx:104,209` | `latest − prior` (pp delta) | `annual_snapshots.retention_rate` (×2) | — | — |
| Retention sparkline | `app/page.tsx:111,210` | `completeYears.map(parseFloat(retention_rate))` | `annual_snapshots.retention_rate` ★ generated | — | — |
| Tournaments card value | `app/page.tsx:214` | `latestYear.tournaments.toLocaleString()` | `annual_snapshots.tournaments` | `annual-collector.ts` | `events_by_year.tournament_count` |
| Tournaments card trend | `app/page.tsx:107,215` | `parseFloat(latestYear.tournament_yoy_pct)` | `annual_snapshots.tournament_yoy_pct` | `annual-collector.ts` | — |
| Tournaments sparkline | `app/page.tsx:112,216` | `completeYears.map(tournaments)` | `annual_snapshots.tournaments` | `annual-collector.ts` | `events_by_year` |
| Player lifecycle rows | `components/player-lifecycle.tsx:35-57` | `lifecycleData.{priorTotal, churned, newPlayers, currentTotal}` | `annual_snapshots.{unique_players, returning_players}` (latest + prior) | `annual-collector.ts` | `players_by_year` |
| Forecast panel projection | `components/detail-drawer.tsx:121` | `forecast.projected_tournaments` | `forecasts.projected_tournaments` | `forecaster.ts` | `events_by_year` (monthly) |
| Forecast panel CI range | `components/detail-drawer.tsx:124-125` | `forecast.ci_68_low_tournaments` / `_high_` | `forecasts.ci_68_*_tournaments` | `forecaster.ts` | — |
| Forecast panel YoY projection | `components/detail-drawer.tsx:86-87,132-133` | `(projected − priorYearTournaments) / priorYearTournaments` | `forecasts.projected_tournaments`, `annual_snapshots.tournaments` | `forecaster.ts` | — |
| Forecast months-of-data | `components/detail-drawer.tsx:138` | `forecast.months_of_data` | `forecasts.months_of_data` | `forecaster.ts` | — |
| Monthly pulse cells | `components/monthly-pulse.tsx:44-63` | `monthlyData` (last 12 rows) | `monthly_event_counts.{year, month, event_count, prior_year_event_count, yoy_change_pct}` | `monthly-collector.ts` | `events_by_year` (monthly drill-down) |
| Country growth rows | `components/country-growth.tsx:45-71` | `countryGrowthData` (top 15 by active_players) | `country_snapshots.{country_name, country_code, active_players}` | `country-collector.ts` | `country_players.player_count` |
| Country "since" footnote | `components/country-growth.tsx:77` | `top[0].first_snapshot` | `country_snapshots.snapshot_date` (earliest per country) | `country-collector.ts` | — |
| Year table rows | `components/year-table.tsx:41-60` | `annualData` (sorted asc) | `annual_snapshots.{year, tournaments, player_entries, unique_players, retention_rate}` | `annual-collector.ts` | — |
| Year table projected row | `components/year-table.tsx:63-86` | `forecast.projected_*` + `currentYearRow.{tournaments, player_entries}` | `forecasts` + `annual_snapshots` (current year) | `forecaster.ts` | — |
| Footer attribution | `app/page.tsx:258` | static link | — | — | — |

★ = database generated column.

## Findings by Category

### 🔴 Partial-year leakage

**None.** Every `.getFullYear()` / `currentYear` hit is either (a) the intended complete-year filter or (b) lifecycle/drawer plumbing that correctly receives the already-filtered `latestYear`.

- `app/page.tsx:36-37` — defines `currentYear` and produces `completeYears` by filtering `year < currentYear`. Correct.
- `app/page.tsx:42` — `currentYearRow = annualSnapshots.find(s => s.year === currentYear)` — intentionally the partial current year, consumed only by the forecast's projected-year row in `YearTable` where it's correctly labelled "est." and paired with the forecast values. Correct.
- `app/page.tsx:48,117,119,159,160` — labels use `priorYear.year` / `latestYear.year` (i.e. complete years), not the partial current year.
- `lib/collectors/*` and `components/player-lifecycle.tsx` hits are server-side collector logic (out of page-render scope) and a prop name, respectively. Not leakage.

⚪ **INFO** — partial-year discipline is strong and consistent.

### 🟠 Null-handling gaps

1. 🟠 **HIGH** — `app/page.tsx:187` — `year={forecast!.target_year}` uses a non-null assertion. Today it's guarded by the `projectedScoreResult && ...` conditional on L181, and `projectedScoreResult` is only truthy when `forecast` is truthy (L69). The assertion is factually safe but brittle — if the guard logic is ever refactored this becomes a crash. Recommend reading `projectedScoreResult.projected_score`'s companion `target_year` from the forecast result object or threading it into `computeProjectedScore`. Report-only — not inline-fixed because the safety is currently load-bearing on a conditional a few lines away.
2. 🟠 **HIGH** — `components/detail-drawer.tsx:85-87` — `projectedChangePct` math uses `priorYearTournaments!` implicitly via the `priorYearTournaments > 0` check and then `forecast.projected_tournaments` (which is non-null inside `showForecast`). Safe in practice. No action.
3. 🟠 **HIGH** — `app/page.tsx:102-103` — `retention_rate ? parseFloat(...) : null` short-circuits on zero as well as null. In practice PostgREST returns numeric(5,1) as a string, so `"0.0"` is truthy and zero is preserved. Still, the pattern is a latent foot-gun if the column type ever becomes a real number. Prefer `retention_rate != null`.
4. ⚪ **INFO** — When `healthScore` is null: gauge renders score `0` + band `stable` (L180). When `latestYear`/`priorYear` is null: all three answer cards render `—` and "No data" trend via `getTrend(null)`. When `forecast` is null: projected gauge hidden, drawer forecast block hidden (via `showForecast`). When `latestRun` is null: badge falls back to "No data collected yet". Handled consistently.

### 🟠 Fetched-but-unrendered (addressed inline)

Before this pass, all 6 queries used `select('*')`. Columns that were fetched but never read in any JSX or derivation:

| Table | Unused columns (pre-fix) |
|---|---|
| `health_scores` | `id, score_date, sensitivity, methodology_version, collected_at` |
| `annual_snapshots` | `id, new_players, countries, entry_yoy_pct, avg_attendance ★, collected_at` |
| `monthly_event_counts` | `id, collected_at` |
| `forecasts` | `id, forecast_date, method, trend_reference, collected_at` |
| `collection_runs` | `id, run_type, started_at, records_affected, error_message, details` |
| `country_snapshots` | `id, pct_of_total, collected_at` |

★ `avg_attendance` is a generated column. It's fetched but never rendered — the detail drawer does not surface an attendance metric today.

**Inline fix applied** (`app/page.tsx:19-58`): All 6 selects narrowed to the explicit column lists below. Network payload is smaller and the type shape matches what the code actually uses.

- `health_scores` → `composite_score, band, components`
- `annual_snapshots` → `year, tournaments, player_entries, unique_players, returning_players, tournament_yoy_pct, retention_rate`
- `monthly_event_counts` → `year, month, event_count, prior_year_event_count, yoy_change_pct`
- `forecasts` → 18-column explicit list (all `projected_*` + all `ci_68_*`/`ci_95_*` + `target_year, months_of_data`)
- `collection_runs` → `completed_at, status` (kept `status` — it's in the `DataFreshness` props interface even though never read; see next finding)
- `country_snapshots` → `snapshot_date, country_name, country_code, active_players`

🟡 **MEDIUM** — `components/data-freshness.tsx:5` declares `status: string` in the `lastRun` prop type but never reads it. Harmless but the prop is typed-but-dead. Leave alone this pass (no inline prop-shape changes without a call-site update); worth a follow-up to either use `status` (e.g. surface `error`/`partial` runs in the badge) or drop it from the interface.

### 🟠 Rendered-but-unsourced

**None.** All numeric/date surfaces are data-driven. The only static JSX strings are the intentional editorial copy (headline, three card questions, footer attribution, summary "More detail", section headings, methodology footnote) — per the audit spec these are expected static copy, not flags.

### 🟡 Derivation placement

Per CLAUDE.md, page-local derivations are OK unless reused or tested. Current placements:

- `completeYears`, `latestYear`, `priorYear`, `currentYearRow` (`app/page.tsx:37-42`) — page-local, not reused. Correct.
- `lifecycleData` (L45-55) — page-local, consumed only by `DetailDrawer`. Correct.
- `projectedScoreResult` (L69-94) — wraps `computeProjectedScore` from `lib/projected-score.ts` (which is tested). The page-local part is just the null/fallback plumbing. Correct.
- `getTrend` / `getRetentionTrend` helpers (L115-120, L157-162) — page-local, not tested, used only for the 3 answer cards on the same page. Correct.
- `countryGrowthData` (L123-154) — page-local derivation (16 LOC including `Map` building and sorting). Not tested. Consumed only by `DetailDrawer → CountryGrowth`. Borderline — if a future `CountryGrowth.test.tsx` lands, this earns a move to `lib/`. No action today.
- Sparkline arrays (L110-112) — one-liners. Correct to inline.

🟡 **MEDIUM** — **Dead-code drift risk on `countryGrowthData`.** The shape of the derived object must match `CountryGrowth`'s prop type exactly. Today they're hand-synced. If the derivation grows, move to `lib/country-growth.ts` with a test. Report only.

### 🟡 Generated columns

`annual_snapshots.retention_rate` and `annual_snapshots.avg_attendance` are both `generated always as (...) stored` (`001_initial_schema.sql:19-22`).

- `retention_rate` is read via `parseFloat(String(...))` in page and detail drawer. **No client-side recomputation anywhere.** Grepped for `returning_players / unique_players`, `returning / unique`, `/ unique_players * 100` — zero hits outside the DDL. ✓
- `avg_attendance` is not rendered today (see "Fetched-but-unrendered"). Safe.

⚪ **INFO** — generated-column contract is respected.

### 🟡 String-number round-trips

`parseFloat(String(...))` appears **19 times** in `app/page.tsx` (all on forecast and `annual_snapshots` numeric columns). Root cause: PostgREST serializes Postgres `numeric` / `numeric(p,s)` to JSON **strings** to preserve precision. The columns affected are all declared `numeric(...)`: `retention_rate`, `tournament_yoy_pct`, `yoy_change_pct`, `projected_tournaments`, `projected_entries`, all `ci_68_*` / `ci_95_*` tournament+entries CIs.

The pattern is necessary and correct. Two notes:

1. 🔵 **LOW** — The outer `String(...)` coerces a type-system unknown (Supabase types these as `number`, but at runtime they're strings). The inner `??` fallback to `0` before `String` is a reasonable belt-and-suspenders. Recommend a one-line helper `numeric(v: unknown): number` in `lib/utils.ts` to centralize the idiom. Report only — not a bug, just a readability win.
2. 🟡 **MEDIUM** — `forecasts.projected_unique_players / _returning_players / ci_68_low_players / _high_players / _low_returning / _high_returning` are all `integer` columns in the DDL (`002_forecast_player_columns.sql:5-10`), so they're returned as real numbers — `parseFloat(String(...))` is **not** applied to them (correctly) in page.tsx. The integer-vs-numeric split is not documented in code; a comment in `supabase.ts` or a generated type file would prevent drift. Report only.

## Narrative Audit

`lib/narrative.ts` branches and test coverage:

| Branch | Trigger | Covered? |
|---|---|---|
| `TREND_PHRASES.thriving` (band === thriving) | composite ≥ 80 | ❌ untested |
| `TREND_PHRASES.healthy` | 65 ≤ composite < 80 | ✅ `narrative.test.ts:25` |
| `TREND_PHRASES.stable` | 50 ≤ composite < 65 | ✅ `narrative.test.ts:60` (all-similar test) |
| `TREND_PHRASES.concerning` | 35 ≤ composite < 50 | ✅ `narrative.test.ts:30` |
| `TREND_PHRASES.critical` | composite < 35 | ❌ untested |
| `spread < 8` → direction `up` | top pillar ≥ 55 | ✅ `narrative.test.ts:59` (scores 55/50/55 → primary 55, direction 'up') |
| `spread < 8` → direction `down` | top pillar ≤ 45 | ❌ untested |
| `spread < 8` → direction `flat` | 45 < top < 55 | ❌ untested |
| `spread ≥ 8` → `formatEvidence` + `formatSecondary` | scores differ by ≥ 8 | ✅ primary path exercised |
| `formatEvidence` — tournaments +, >2% | `key === 'tournaments'`, `raw > 2` | ✅ (implicitly via "strongest signal pillar" test) |
| `formatEvidence` — tournaments flat, abs(raw) < 2 | `key === 'tournaments'`, `|raw| < 2` | ❌ untested as primary |
| `formatEvidence` — tournaments down | `key === 'tournaments'`, `raw < -2` | ❌ untested as primary |
| `formatEvidence` — players +, -, flat (all 3) | `key === 'players'` | ❌ untested as primary (players never has highest deviation in any fixture) |
| `formatEvidence` — retention ≥ 45 | `key === 'retention'`, `raw ≥ 45` | ❌ untested as primary |
| `formatEvidence` — retention 35-44 | `key === 'retention'`, `35 ≤ raw < 45` | ❌ untested as primary |
| `formatEvidence` — retention < 35 | `key === 'retention'`, `raw < 35` | ❌ untested as primary |
| `formatSecondary` — tournaments + / flat / − | secondary pillar | ✅ "−" branch covered via concerning test; + and flat untested |
| `formatSecondary` — players + / flat / − | secondary pillar | ❌ untested |
| `formatSecondary` — retention ≥45 / 35-44 / <35 | secondary pillar | ❌ untested |
| `formatEvidence` / `formatSecondary` — `default` | any `key` not in {tournaments, players, retention} | ⚠️ **unreachable** — `HealthScoreResult.components` is hard-keyed to those three in `lib/health-score.ts:70-88` |

🟡 **MEDIUM** — Narrative coverage is thin for a user-facing string. ~12 reachable template branches are untested. The `default` case in both `formatEvidence` (L72-74) and `formatSecondary` (L99-101) is **unreachable** given the current `HealthScoreInput` shape — candidate for deletion or a comment explaining it's a defensive fallback. Report-only; test additions and dead-branch removal are out of scope for Pass 2.

## Band Audit

Confirmed end-to-end. Enum is `thriving / healthy / stable / concerning / critical` in every surface:

| Surface | File:line | Value |
|---|---|---|
| TS union | `lib/health-score.ts:5` | `'thriving' \| 'healthy' \| 'stable' \| 'concerning' \| 'critical'` |
| `getBand()` | `lib/health-score.ts:54-59` | returns the 5 strings |
| DB check constraint | `supabase/migrations/001_initial_schema.sql:101` | `check (band in ('thriving', 'healthy', 'stable', 'concerning', 'critical'))` |
| CSS tokens | `app/globals.css:30-34,72-76,106-110` | `--band-thriving` / `-healthy` / `-stable` / `-concerning` / `-critical` |
| Gauge map | `components/health-score-gauge.tsx:10-16` | 5 keys match |
| Projected gauge map | `components/projected-gauge.tsx:9-15` | 5 keys match |
| Narrative trend phrases | `lib/narrative.ts:7-13` | 5 keys match |
| Admin observations validator | `app/api/admin/observations/route.ts:37` | 5 strings match |
| Test assertions | `lib/__tests__/projected-score.test.ts:47`, `health-score.test.ts:22-26` | 5 strings match |

⚪ **INFO** — `'declining'` appears **nowhere** in source. The audit-spec warning about a scorer-output-vs-CSS-token mismatch (`declining` vs `critical`) does not apply to the current codebase. Clean.

## Inline Fixes Applied

1. `app/page.tsx:19-58` — narrowed 6 `select('*')` calls to explicit column lists. Removes ~20 unused columns per render from the wire payload. No observable behaviour change.

No other fixes were eligible (`getFullYear()` misuse = none; null-crash paths = none; dead local `const` = none).

## Verification

- `npm run lint` — unchanged from baseline (5 errors in `scripts/migrate-002.cjs`, 2 deferred `set-state-in-effect` errors in theme-toggle + detail-drawer). No new errors.
- `npx vitest run` — 29/29 passing.
