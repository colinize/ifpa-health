# Schema Reference

Canonical reference for the IFPA Health Supabase database. Read this instead of opening migrations.

## Overview

- **11 tables** in the `public` schema.
- **2 migrations:** `001_initial_schema.sql` (creates everything), `002_forecast_player_columns.sql` (adds 6 player-projection columns to `forecasts`).
- **Project ref:** `ryteszuvasrfppgecnwe`
- **Region:** `us-west-1`
- **Pooler:** `aws-0-us-west-1.pooler.supabase.com:6543`
- **RLS:** enabled on all 11 tables. Policies: permissive anon `SELECT`, service-role bypass for all writes.
- **PK convention:** `bigint generated always as identity primary key`.
- **Timestamp convention:** `timestamptz` with `default now()` on `created_at` / `collected_at`. No updated_at anywhere.
- **No FKs between tables.** Linkage is by logical key only (year, snapshot_date, target_year).

## Tables by Purpose

| Group | Tables |
|---|---|
| Snapshots (4) | `annual_snapshots`, `monthly_event_counts`, `overall_stats_snapshots`, `country_snapshots` |
| Rankings (1) | `wppr_rankings` |
| Outputs (2) | `health_scores`, `forecasts` |
| Calibration (3) | `observations`, `methodology_versions`, `shadow_scores` |
| Ops (1) | `collection_runs` |

## Ownership Map

At-a-glance: which collector writes which table.

| Collector | File | Writes |
|---|---|---|
| Daily | `lib/collectors/daily-collector.ts` | `overall_stats_snapshots`, `wppr_rankings` |
| Annual | `lib/collectors/annual-collector.ts` | `annual_snapshots` |
| Monthly | `lib/collectors/monthly-collector.ts` | `monthly_event_counts` |
| Country | `lib/collectors/country-collector.ts` | `country_snapshots` |
| Health Scorer | `lib/collectors/health-scorer.ts` | `health_scores` |
| Forecaster | `lib/collectors/forecaster.ts` | `forecasts` (reads `annual_snapshots`, `monthly_event_counts`, `overall_stats_snapshots`) |
| Cron routes | `app/api/cron/{daily,weekly}/route.ts` | `collection_runs` (row per run) |
| Admin routes | `app/api/admin/{observations,calibrate}/*` | `observations`, `methodology_versions`, `shadow_scores` |

---

## Snapshots

### `annual_snapshots`

One row per IFPA calendar year — the backbone table for nearly every trend chart and the health score.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `year` | `integer` | Not null. Unique. |
| `tournaments` | `integer` | Not null |
| `player_entries` | `integer` | Not null |
| `unique_players` | `integer` | Not null |
| `returning_players` | `integer` | Nullable |
| `new_players` | `integer` | Nullable. Derived at write time as `current - previous_year_count`. |
| `countries` | `integer` | Nullable. Currently always null — not supplied by the IFPA endpoints in use. |
| `tournament_yoy_pct` | `numeric(6,1)` | YoY tournament count delta, computed at write time |
| `entry_yoy_pct` | `numeric(6,1)` | YoY player-entry delta, computed at write time |
| `avg_attendance` | `numeric(5,1)` | **Generated.** `player_entries / nullif(tournaments, 0)`. Stored. |
| `retention_rate` | `numeric(5,1)` | **Generated.** `returning_players / unique_players * 100` when `unique_players > 0`, else null. Stored. |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** `idx_annual_snapshots_year` on `(year)`.
**Unique:** `(year)`.
**Check constraints:** none beyond the generated-column clauses.
**Owner:** Annual Collector (upsert on conflict `year`).
**Row count:** small (<1K) — one row per year of IFPA history, ~20 rows.
**Quirk:** Never insert `avg_attendance` or `retention_rate` — Postgres rejects inserts into generated columns. The annual-collector comment explicitly calls this out.

### `monthly_event_counts`

One row per (year, month) — drives the monthly pulse bars and the forecaster's seasonal ratio.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `year` | `integer` | Not null |
| `month` | `integer` | Not null. `check (month between 1 and 12)`. |
| `event_count` | `integer` | Not null |
| `prior_year_event_count` | `integer` | Nullable |
| `yoy_change_pct` | `numeric(6,1)` | Nullable |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** `idx_monthly_event_counts_year_month` on `(year, month)`.
**Unique:** `(year, month)`.
**Check constraints:** `month between 1 and 12`.
**Owner:** Monthly Collector (upsert on conflict `year,month`).
**Row count:** small (<1K) — collector writes current-year + prior-year months only.
**Quirk:** Collected via per-month `searchTournaments` calls with a 100ms delay between hits.

### `overall_stats_snapshots`

One row per day — capture of the IFPA `stats/overall` endpoint, including age-cohort breakdown.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `snapshot_date` | `date` | Not null. Unique. |
| `ytd_tournaments` | `integer` | Nullable |
| `ytd_player_entries` | `integer` | Nullable |
| `ytd_unique_players` | `integer` | Nullable |
| `total_active_players` | `integer` | Nullable |
| `total_players_all_time` | `integer` | Nullable |
| `age_under_18_pct` | `numeric(4,1)` | Nullable |
| `age_18_29_pct` | `numeric(4,1)` | Nullable |
| `age_30_39_pct` | `numeric(4,1)` | Nullable |
| `age_40_49_pct` | `numeric(4,1)` | Nullable |
| `age_50_plus_pct` | `numeric(4,1)` | Nullable |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** `idx_overall_stats_snapshot_date` on `(snapshot_date)`.
**Unique:** `(snapshot_date)`.
**Owner:** Daily Collector (upsert on conflict `snapshot_date`).
**Row count:** medium (1K–50K) — one per day, accumulating over project lifetime.
**Quirk:** Age keys in the API response use `age_18_to_29` style; the collector maps these into the `age_18_29_pct` column names. See `lib/ifpa-client.ts` for the API-side field-name fix (nested under `stats.age`).

### `country_snapshots`

One row per (date, country) — used by the country-growth list in the detail drawer.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `snapshot_date` | `date` | Not null |
| `country_name` | `text` | Not null |
| `country_code` | `text` | Nullable |
| `active_players` | `integer` | Not null |
| `pct_of_total` | `numeric(5,2)` | Nullable. Computed across all countries in the batch. |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** none beyond the PK and unique constraint.
**Unique:** `(snapshot_date, country_name)`.
**Owner:** Country Collector (upsert on conflict `snapshot_date,country_name`).
**Row count:** medium (1K–50K) — ~80 countries × N snapshot dates.
**Quirk:** The API response uses key `stats` (not `country_list`) and field `player_count` (not `count`). Patched in the client.

---

## Rankings

### `wppr_rankings`

Daily snapshot of top-50 WPPR-ranked players.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `snapshot_date` | `date` | Not null |
| `player_id` | `integer` | Not null. IFPA player ID. |
| `first_name` | `text` | Not null. Parsed from the API's `name` field (split on first space). |
| `last_name` | `text` | Not null. |
| `wppr_rank` | `integer` | Not null. Maps to API `current_rank`. |
| `wppr_points` | `numeric(10,2)` | Not null |
| `ratings_value` | `numeric(10,2)` | Nullable. Maps to API `rating_value`. |
| `active_events` | `integer` | Nullable. Maps to API `event_count`. |
| `country_name` | `text` | Nullable |
| `country_code` | `text` | Nullable |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** none beyond PK and unique.
**Unique:** `(snapshot_date, player_id)`.
**Owner:** Daily Collector (upsert on conflict `snapshot_date,player_id`).
**Row count:** medium (1K–50K) — 50 rows per day.
**Quirk:** The API returns a single full `name` string. The collector splits on first space, which means compound first names land in `last_name`.

---

## Outputs

### `health_scores`

One row per day — output of the v2 three-pillar scorer.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `score_date` | `date` | Not null. Unique. |
| `composite_score` | `numeric(5,1)` | Not null. 0–100. |
| `band` | `text` | Not null. `check (band in ('thriving', 'healthy', 'stable', 'concerning', 'critical'))`. |
| `components` | `jsonb` | Not null. Per-pillar breakdown. |
| `sensitivity` | `jsonb` | Nullable. Currently not written by the scorer. |
| `methodology_version` | `integer` | Not null. `default 1`. |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** `idx_health_scores_score_date` on `(score_date)`.
**Unique:** `(score_date)`.
**Check constraints:** band enum.
**Owner:** Health Scorer (upsert on conflict `score_date`).
**Row count:** small (<1K).
**Quirk:** The `band` check constraint uses `critical` but the UI copy shows `Declining`. They are synonyms — the scorer writes `critical`, the rendering layer remaps labels.

### `forecasts`

One row per (forecast_date, target_year) — seasonal-ratio projection with 68%/95% CIs.

**Columns from `001`:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `forecast_date` | `date` | Not null |
| `target_year` | `integer` | Not null |
| `months_of_data` | `integer` | Not null |
| `projected_tournaments` | `integer` | Nullable |
| `projected_entries` | `integer` | Nullable |
| `ci_68_low_tournaments` | `integer` | Nullable |
| `ci_68_high_tournaments` | `integer` | Nullable |
| `ci_95_low_tournaments` | `integer` | Nullable |
| `ci_95_high_tournaments` | `integer` | Nullable |
| `ci_68_low_entries` | `integer` | Nullable |
| `ci_68_high_entries` | `integer` | Nullable |
| `ci_95_low_entries` | `integer` | Nullable |
| `ci_95_high_entries` | `integer` | Nullable |
| `method` | `text` | Not null. `default 'seasonal_ratio'`. |
| `trend_reference` | `jsonb` | Nullable. Holds tournaments+entries trend-line reference values. |
| `collected_at` | `timestamptz` | `default now()` |

**Columns from `002` (player projection):**

| Column | Type | Notes |
|---|---|---|
| `projected_unique_players` | `integer` | Nullable |
| `projected_returning_players` | `integer` | Nullable |
| `ci_68_low_players` | `integer` | Nullable |
| `ci_68_high_players` | `integer` | Nullable |
| `ci_68_low_returning` | `integer` | Nullable |
| `ci_68_high_returning` | `integer` | Nullable |

**Indexes:** `idx_forecasts_forecast_date` on `(forecast_date)`.
**Unique:** `(forecast_date, target_year)`.
**Owner:** Forecaster (upsert on conflict `forecast_date,target_year`).
**Row count:** small (<1K).
**Quirk:** Only 68% CIs exist for player/returning projections — 95% CIs are tournaments+entries only.

---

## Calibration

### `observations`

Ground-truth labels recorded by the operator: "what was actually happening in this window, in plain language."

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `period_start` | `date` | Not null |
| `period_end` | `date` | Not null |
| `observed_health` | `text` | Not null. `check` same 5-band enum as `health_scores.band`. |
| `observed_score` | `numeric(5,1)` | Not null. `check (between 0 and 100)`. |
| `notes` | `text` | Nullable |
| `evidence` | `text` | Nullable |
| `created_at` | `timestamptz` | `default now()` |

**Indexes:** none.
**Unique:** none. Multiple observations per period are allowed.
**Check constraints:** band enum + score 0–100.
**Owner:** `/api/admin/observations` route (operator-submitted).
**Row count:** small (<1K).

### `methodology_versions`

Versioned score methodology definitions. Seed row inserted by migration 001.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `version_number` | `integer` | Not null. Unique. |
| `description` | `text` | Nullable |
| `weights` | `jsonb` | Not null. Per-pillar weights. |
| `breakpoints` | `jsonb` | Not null. Per-pillar score breakpoints (piecewise linear). |
| `is_active` | `boolean` | Not null. `default false`. |
| `backtest_mae` | `numeric(6,2)` | Nullable |
| `created_at` | `timestamptz` | `default now()` |

**Indexes:** none beyond unique.
**Unique:** `(version_number)`.
**Owner:** `/api/admin/calibrate` route, plus the migration seed (version 1, active).
**Row count:** small (<1K). Expect <10 rows ever.
**Quirk:** Seed row in `001_initial_schema.sql` encodes the six-pillar v1 methodology. The live scorer is v2-in-code — `health_scores.methodology_version` is still `1` by default. This mismatch is known tech debt (see `CLAUDE.md`).

### `shadow_scores`

Backtest output: "if methodology version N had been active on this date, what score would it have produced?"

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `score_date` | `date` | Not null |
| `methodology_version` | `integer` | Not null |
| `composite_score` | `numeric(5,1)` | Not null |
| `component_scores` | `jsonb` | Not null |
| `collected_at` | `timestamptz` | `default now()` |

**Indexes:** `idx_shadow_scores_score_date` on `(score_date)`.
**Unique:** `(score_date, methodology_version)`.
**Owner:** `/api/admin/calibrate` route.
**Row count:** small–medium. One row per (date, version) evaluated.

---

## Ops

### `collection_runs`

One row per cron invocation — the entire observability story for this project.

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `run_type` | `text` | Not null. Examples: `daily`, `weekly`, `health_score`, `forecaster`. |
| `status` | `text` | Not null. `default 'running'`. `check (status in ('running', 'success', 'error'))`. |
| `started_at` | `timestamptz` | `default now()` |
| `completed_at` | `timestamptz` | Nullable until the run flips to `success`/`error`. |
| `records_affected` | `integer` | `default 0` |
| `error_message` | `text` | Nullable |
| `details` | `jsonb` | Nullable. Collector-specific payload (counts, year range, etc). |

**Indexes:** `idx_collection_runs_type_started` on `(run_type, started_at)`.
**Unique:** none — every invocation is a new row.
**Check constraints:** status enum.
**Owner:** Cron routes (`app/api/cron/daily/route.ts`, `app/api/cron/weekly/route.ts`) — each route inserts a `running` row, then updates to `success` or `error` with the aggregated `records_affected` and `details`.
**Row count:** medium (1K–50K) — ~2 writes/day from cron + ad-hoc manual triggers.
**UI use:** the data-freshness badge reads the latest successful row's `started_at`.

---

## Generated Columns

Two generated columns, both on `annual_snapshots`, both `STORED`:

| Column | Formula | Why |
|---|---|---|
| `avg_attendance` | `player_entries::numeric / nullif(tournaments, 0)` | Consistent definition shared by every consumer; `nullif` guards against zero-division. |
| `retention_rate` | `case when unique_players > 0 then returning_players::numeric / unique_players * 100 else null end` | Drives the Retention answer card and the health scorer's retention pillar. Storing it means the scorer never has to recompute it. |

**Do not insert these columns.** Postgres rejects any INSERT/UPSERT that names a generated column in its payload. The annual collector explicitly omits them and leaves a comment (`annual-collector.ts:87`) to stop future edits from re-adding them.

---

## Row-Level Security

Every table has RLS enabled. Two policies per table:

1. `"Allow public read"` — `FOR SELECT TO anon USING (true)`.
2. `"Allow service write"` — `FOR ALL TO service_role USING (true) WITH CHECK (true)`.

That's the entire policy surface. Anonymous users can read everything; the service-role key bypasses RLS via its role. There is no per-row filtering, no user scoping, no tenant isolation — this is a single-tenant public dashboard.

---

## What This Schema Does NOT Have

Readers coming from Kineticist or larger projects will expect several things that don't exist here:

- **No `pg_cron` jobs.** All scheduling is Vercel cron in `vercel.json`.
- **No custom RPCs or stored procedures.** All logic is in application code.
- **No `SECURITY DEFINER` functions.** None at all.
- **No triggers** beyond the implicit `DEFAULT now()` behaviour on timestamp columns. No `BEFORE INSERT`, no `AFTER UPDATE`, nothing.
- **No junction tables / many-to-many relationships.** Every table stands alone.
- **No foreign key constraints.** The schema uses logical keys only (e.g., `health_scores.methodology_version` is an integer, not a FK to `methodology_versions.version_number`). This is deliberate — it lets operators run backtests and drop/reinsert methodology rows without cascading effects.
- **No Supabase Edge Functions.** All compute is in Next.js route handlers on Vercel.
- **No auth/users/sessions tables.** There is no user model.

If a future feature needs any of the above, it is net-new — don't assume infrastructure exists.

---

## IFPA API Field-Name Fixes (Cross-Reference)

The schema was designed against the IFPA API's documented response shape. The real responses differ in several places: keys are named `stats` instead of `events_by_year`/`country_list`; fields are singular instead of plural; age brackets are nested under `stats.age`.

Rather than denormalise these into the schema, `lib/ifpa-client.ts` patches responses before they reach collectors, so the collectors and schema see the "expected" shape. The full list lives in `docs/patterns-and-conventions.md` → **IFPA API field-name fixes** — read that when writing a new collector or debugging a mapping surprise.

Common touch-points with this schema:

- `overall_stats_snapshots.age_*_pct` columns ← API `stats.age.age_under_18` / `age_18_to_29` / etc.
- `annual_snapshots.tournaments` / `player_entries` ← API `stats[].tournament_count` / `stats[].player_count` (singular).
- `annual_snapshots.unique_players` / `new_players` ← API `stats[].count` / `stats[].previous_year_count`.
- `country_snapshots.active_players` ← API `stats[].player_count` (not `count`).
- `wppr_rankings.first_name` / `last_name` ← API `name` (split on first space).
- `wppr_rankings.ratings_value` ← API `rating_value`.

---

## Migration History

| File | Summary |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Creates all 11 tables, enables RLS on each, defines 22 policies (anon read + service write per table), creates 7 indexes, and inserts the v1 methodology seed row. |
| `supabase/migrations/002_forecast_player_columns.sql` | `ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS …` — adds six player-projection columns (`projected_unique_players`, `projected_returning_players`, `ci_68_low_players`, `ci_68_high_players`, `ci_68_low_returning`, `ci_68_high_returning`). |

Migrations are cumulative, not squashed. No baseline rewrite has happened. At two files this is fine; revisit if the count passes ~20.
