# Pass 1 — Schema & Structure Health

## Database Context Summary

| Field | Value |
|---|---|
| Project ref | `ryteszuvasrfppgecnwe` |
| Region | `us-west-1` |
| Pooler | `aws-0-us-west-1.pooler.supabase.com:6543` |
| Audit date | 2026-04-17 |
| Schema scope | `public` (11 tables) |
| Local migration files | 2 (`001_initial_schema.sql`, `002_forecast_player_columns.sql`) |
| Applied migrations recorded | 1 (`001`) — see Finding S-01 |
| Total DB rows (public) | 3,182 across 11 tables |
| Total public storage | ~1.4 MB (tables + indexes) |
| Stats reset | 2025-12-08 11:03 UTC (~131 days of accumulation) |
| Prior audit | None (`_db-audit/` is empty before this pass) |
| Security advisors (info) | No issues found |
| Performance advisors (info) | 3 findings (2 unused indexes, 1 infra/auth — incorporated below) |

---

## 1. Table sizes & row counts ⚪ INFO

Total footprint is ~1.4 MB. Nothing surprising — `wppr_rankings` is the largest table because we keep weekly snapshots of the top 250 players (2,350 rows = ~9 weekly snapshots × 250).

| Table | Rows | Table | Indexes | Total | Idx/Table ratio |
|---|---:|---:|---:|---:|---:|
| wppr_rankings | 2,350 | 264 kB | 184 kB | 448 kB | 0.70 |
| country_snapshots | 408 | 32 kB | 104 kB | 136 kB | 3.25 ⚠ |
| collection_runs | 84 | 56 kB | 64 kB | 120 kB | 1.14 |
| health_scores | 48 | 32 kB | 80 kB | 112 kB | 2.50 ⚠ |
| forecasts | 48 | 24 kB | 80 kB | 104 kB | 3.33 ⚠ |
| monthly_event_counts | 88 | 8 kB | 64 kB | 72 kB | 8.00 ⚠ |
| shadow_scores | 1 | 8 kB | 56 kB | 64 kB | 7.00 ⚠ |
| annual_snapshots | 10 | 8 kB | 48 kB | 56 kB | 6.00 ⚠ |
| overall_stats_snapshots | 47 | 8 kB | 48 kB | 56 kB | 6.00 ⚠ |
| methodology_versions | 1 | 8 kB | 40 kB | 48 kB | 5.00 ⚠ |
| observations | 10 | 8 kB | 24 kB | 32 kB | 3.00 ⚠ |

**Severity: ⚪ INFO.** "Index size > 2× table size" technically trips on most rows, but Postgres allocates an 8-kB page minimum per index regardless of actual data — every index here is essentially empty. The redundant indexes flagged in §5 cost ~96 kB total; not material.

---

## 2. Dead tuple ratios 🟡 MEDIUM (one)

| Table | Live | Dead | Dead % | Last autovacuum | Last autoanalyze |
|---|---:|---:|---:|---|---|
| observations | 10 | 10 | 100.0 | never | never |
| shadow_scores | 1 | 1 | 100.0 | never | never |
| monthly_event_counts | 88 | 16 | 18.2 | 2026-02-05 | 2026-04-06 |
| collection_runs | 84 | 9 | 10.7 | never | 2026-04-13 |
| overall_stats_snapshots | 47 | 1 | 2.1 | never | never |
| (others) | — | 0 | 0.0 | mixed | mixed |

- 🟡 `monthly_event_counts` 18.2 % dead is the only meaningful flag. Cause is the upsert pattern in the monthly collector overwriting the same year/month rows; autovacuum will catch it as the autovacuum threshold is hit. Not user-visible at this scale. Counts the row count is so small (88 rows / 8 kB) that bloat is irrelevant.
- 🔵 `observations` and `shadow_scores` show 100% dead because each table has had test inserts later updated/deleted and autovacuum's threshold (`50 + 0.2 × n_live`) is never met when `n_live` is single-digit. Cosmetic — no impact.
- ⚪ `collection_runs` 10.7 % is right at the spec's flag line; comes from `status='running' → 'success'` updates. Will self-clean.

**No action required.** A one-time `VACUUM ANALYZE` could be run from the Dashboard but the storage saved is < 16 kB total.

---

## 3. Missing FK indexes ✅ PASS

Query returned **zero rows.** Schema declares no foreign keys (consistent with `CLAUDE.md`: collectors write reference IDs as plain `integer`/`text` columns and `health_scores.methodology_version` is a soft reference). Nothing to index.

**Severity: ✅ PASS** — but if future schema work adds FKs, the supabase-postgres-best-practices reference applies (`schema-foreign-key-indexes.md`).

---

## 4. Unused indexes 🔵 LOW

Stats accumulation window: **131 days** (since 2025-12-08). Long enough to trust `idx_scan = 0`.

| Index | Table | Size | idx_scan |
|---|---|---:|---:|
| `methodology_versions_version_number_key` | methodology_versions | 16 kB | 0 |
| `idx_shadow_scores_score_date` | shadow_scores | 16 kB | 0 |
| `idx_collection_runs_type_started` | collection_runs | 16 kB | 0 |

- The two `idx_*` entries match the Supabase performance advisors output exactly.
- `methodology_versions_version_number_key` is the implicit unique-constraint index on `version_number`. It's used as a uniqueness guard on insert (correctness, not lookup). Don't drop — it enforces a constraint.
- `idx_shadow_scores_score_date` is fully shadowed by `shadow_scores_score_date_methodology_version_key` (composite unique starting with `score_date`). Drop candidate.
- `idx_collection_runs_type_started` was meant to serve "latest run by type" lookups but the freshness query filters by `started_at` only and orders by `started_at DESC LIMIT 1` (see `app/page.tsx`); the planner picks a seq-scan on 84 rows instead. Either drop, or rewrite the freshness query to filter by `run_type`. Drop is simpler and the table is tiny.

**Severity: 🔵 LOW.** ~32 kB of waste; no perf cost.

---

## 5. Duplicate / redundant indexes 🟡 MEDIUM

The pairwise overlap query found **6 redundant `public.*` indexes** (the auth/storage pairs are Supabase-managed — leave alone). Every "hand-rolled single-column index" duplicates the implicit unique-constraint index of the same column.

| Redundant index | Shadowed by | Wasted |
|---|---|---:|
| `idx_annual_snapshots_year` | `annual_snapshots_year_key` | 16 kB |
| `idx_monthly_event_counts_year_month` | `monthly_event_counts_year_month_key` | 16 kB |
| `idx_overall_stats_snapshot_date` | `overall_stats_snapshots_snapshot_date_key` | 16 kB |
| `idx_health_scores_score_date` | `health_scores_score_date_key` | 16 kB |
| `idx_forecasts_forecast_date` | `forecasts_forecast_date_target_year_key` (composite, leading column) | 16 kB |
| `idx_shadow_scores_score_date` | `shadow_scores_score_date_methodology_version_key` (composite, leading) | 16 kB |

Total waste: ~96 kB. Functionally harmless, but each insert pays double-write tax and the `init` migration is misleading. The spec called this out as a known LOW; severity bumped to 🟡 because **5 of 7 hand-rolled indexes are pure duplicates** — the schema author wasn't aware of the implicit unique index, which is a pattern worth correcting.

**Action:** Drop all 6 in a follow-up migration. See Fix block below.

---

## 6. Schema convention compliance ✅ PASS

| Convention | Result |
|---|---|
| `bigint generated always as identity` PKs | ✅ All 11 tables (verified via `is_identity = YES`) |
| `timestamptz` for all temporal columns | ✅ All 12 timestamp/created/collected/started/completed columns are `timestamp with time zone` — zero bare `timestamp` |
| `created_at` or `collected_at` on every table | ✅ — except `collection_runs` (uses `started_at` / `completed_at`, semantically appropriate) |
| FK column naming | n/a — no FKs declared |
| `snake_case` columns | ✅ |

**Severity: ✅ PASS.**

---

## 7. CHECK constraint coverage 🟡 MEDIUM

Existing CHECKs:

| Table | Constraint | Definition |
|---|---|---|
| collection_runs | `..._status_check` | `status IN ('running','success','error')` |
| health_scores | `..._band_check` | `band IN ('thriving','healthy','stable','concerning','critical')` |
| monthly_event_counts | `..._month_check` | `month BETWEEN 1 AND 12` |
| observations | `..._observed_health_check` | enum match (5 bands) |
| observations | `..._observed_score_check` | `0 ≤ observed_score ≤ 100` |

**Gaps** (called out in spec, verified live):

- 🟡 `collection_runs.run_type` — **unconstrained**. Live distinct values: `daily` (71), `weekly` (12), `backfill` (1). Spec expected `('daily','weekly')` only — but `backfill` is a real, intentional value (`scripts/backfill.ts` writes it). Real enum is **`('daily', 'weekly', 'backfill')`**. Fix proposal below uses that.
- 🔵 `forecasts.method` — **unconstrained**, defaults to `'seasonal_ratio'`. Live distinct values: `seasonal_ratio` only. Add `CHECK (method IN ('seasonal_ratio'))` or, more flexibly, a `text NOT NULL` with a CHECK list that we expand when alternate methods land.
- 🔵 `health_scores.composite_score` and `forecasts.projected_*` lack range checks. Score should be `0–100`; `observations.observed_score` already enforces this. Symmetry says add the same to `health_scores`.

The `health_scores.band` enum is correctly constrained (verified in spec).

---

## 8. Generated columns ✅ PASS

`annual_snapshots.avg_attendance` and `retention_rate` were verified against hand-computed expected values for 10 rows (2017–2026). Every row matched to the displayed precision. Migration formula:

```sql
avg_attendance numeric(5,1) generated always as (player_entries::numeric / nullif(tournaments, 0)) stored
retention_rate numeric(5,1) generated always as (
  case when unique_players > 0 then (returning_players::numeric / unique_players * 100) else null end
) stored
```

Matches the formulas documented in `CLAUDE.md`. The 2026 row has `unique_players = 0` (current partial year not yet aggregated), and `retention_rate` correctly returns `NULL` — the `case` guard works.

**Severity: ✅ PASS.**

---

## 9. Full index inventory

27 total indexes across 11 tables. Per-table counts: each table has its PK; each table with a `UNIQUE(...)` declaration has one constraint index; 7 hand-rolled `idx_*` from migration 001 (6 of which are redundant, see §5). `observations` has PK only.

| Table | Indexes | Notable |
|---|---|---|
| annual_snapshots | pkey, `_year_key` (unique), `idx_annual_snapshots_year` | **redundant (§5)** |
| collection_runs | pkey, `idx_collection_runs_type_started` | **unused (§4)** |
| country_snapshots | pkey, `_snapshot_date_country_name_key` (composite unique) | clean |
| forecasts | pkey, `_forecast_date_target_year_key` (composite unique), `idx_forecasts_forecast_date` | **redundant — leading col of composite (§5)** |
| health_scores | pkey, `_score_date_key` (unique), `idx_health_scores_score_date` | **redundant (§5)** |
| methodology_versions | pkey, `_version_number_key` (unique) | unique-enforcement only — keep |
| monthly_event_counts | pkey, `_year_month_key` (composite unique), `idx_monthly_event_counts_year_month` | **redundant (§5)** |
| observations | pkey | minimal — appropriate at 10 rows |
| overall_stats_snapshots | pkey, `_snapshot_date_key` (unique), `idx_overall_stats_snapshot_date` | **redundant (§5)** |
| shadow_scores | pkey, `_score_date_methodology_version_key` (composite unique), `idx_shadow_scores_score_date` | **redundant (§5) + unused (§4)** |
| wppr_rankings | pkey, `_snapshot_date_player_id_key` (composite unique) | clean — composite covers common reads by leading col |

---

## 10. Top tables for capacity planning

| Rank | Table | Rows today | Growth/cycle | 12-month projection |
|---:|---|---:|---|---|
| 1 | wppr_rankings | 2,350 | ~250 rows / week (top 250 players, weekly cron) | ~13,000 rows, ~2.5 MB total |
| 2 | country_snapshots | 408 | ~100 rows / week (active countries, weekly cron) | ~5,600 rows, ~1.5 MB |
| 3 | monthly_event_counts | 88 | 12 rows / year (one per month, dedupe via unique) | ~100 rows steady-state |
| 4 | collection_runs | 84 | ~7 rows / week (1 daily + 1 weekly) | ~450 rows, < 100 kB |
| 5 | health_scores / forecasts | 48 each | 1 row / day | ~410 rows each |
| 6 | overall_stats_snapshots | 47 | 1 row / day | ~410 rows |
| 7 | annual_snapshots | 10 | 1 row / year + current-year overwrite | ~12 rows |
| 8 | observations | 10 | manual entries | linear-with-effort |
| 9 | shadow_scores | 1 | populated only when calibration runs | sparse |
| 10 | methodology_versions | 1 | 1 per scorer revision | 2-5 |

**12-month database total projection:** ~5–6 MB. Well below any plan tier limit. JS-client 1000-row cap (`country_snapshots` page reads) is the only structural risk and is already on the radar in the audit spec for Pass 4.

---

## Migration drift 🟠 HIGH (S-01)

`supabase_migrations.schema_migrations` shows **only `001` applied**. Local has `001` and `002`. But `forecasts` has all 6 columns from migration 002 (`projected_unique_players`, `projected_returning_players`, `ci_68_low_players`, `ci_68_high_players`, `ci_68_low_returning`, `ci_68_high_returning`) — verified live.

This means migration 002 was **applied out-of-band** (likely via Dashboard SQL Editor or `psql`) without going through `supabase db push --linked`, so the migrations registry doesn't know about it. Consequences:

- Future `supabase db push --linked --dry-run` will think 002 is pending and try to re-apply. Each `ADD COLUMN IF NOT EXISTS` is idempotent so the actual statements would no-op — but the tracking row gets inserted and the warning goes away. Low actual risk because of the `IF NOT EXISTS` guard, but high *process* risk: any future migration that *isn't* idempotent will break.
- Severity 🟠 because this is the kind of latent landmine that bites only when something else is on fire. Fix is one statement.

**Fix (Dashboard or `supabase db query --linked` only — must NOT be in a normal migration file):**

```sql
-- Manually mark migration 002 as applied, since its DDL was already run out-of-band.
-- Run via supabase db query --linked OR Dashboard SQL Editor.
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '002',
  ARRAY[]::text[],
  'forecast_player_columns'
);
```

(Verify with `SELECT * FROM supabase_migrations.schema_migrations` afterward — the exact column set on this table varies by CLI version; some versions only have `version`. If the insert errors on missing columns, just `INSERT (version) VALUES ('002')`.)

---

## Fix Phase — Consolidated SQL

### Migration-safe (proposed `supabase/migrations/003_schema_cleanup.sql` — DO NOT CREATE THE FILE; copy when ready)

```sql
-- 003_schema_cleanup.sql
-- Pass 1 cleanup: drop indexes shadowed by unique constraints, add missing CHECKs.
-- Reversible: every DROP can be re-created from migration 001 if needed.

-- ---------- §5: redundant single-column indexes (shadowed by unique constraints) ----------
-- All harmless to drop; the unique-constraint index covers the same lookups.
DROP INDEX IF EXISTS public.idx_annual_snapshots_year;
DROP INDEX IF EXISTS public.idx_monthly_event_counts_year_month;
DROP INDEX IF EXISTS public.idx_overall_stats_snapshot_date;
DROP INDEX IF EXISTS public.idx_health_scores_score_date;
DROP INDEX IF EXISTS public.idx_forecasts_forecast_date;
DROP INDEX IF EXISTS public.idx_shadow_scores_score_date;

-- ---------- §4: unused composite index (no live query plan benefits from it) ----------
-- Freshness query in app/page.tsx orders by started_at DESC LIMIT 1 without filtering
-- by run_type, so the planner ignores this index. 84 rows = seq scan is free.
DROP INDEX IF EXISTS public.idx_collection_runs_type_started;

-- ---------- §7: CHECK on collection_runs.run_type ----------
-- Live distinct values: 'daily' (71), 'weekly' (12), 'backfill' (1). NOT VALID first
-- avoids long lock; existing rows are clean so VALIDATE is instant.
ALTER TABLE public.collection_runs
  ADD CONSTRAINT collection_runs_run_type_check
  CHECK (run_type IN ('daily', 'weekly', 'backfill')) NOT VALID;
ALTER TABLE public.collection_runs
  VALIDATE CONSTRAINT collection_runs_run_type_check;

-- ---------- §7: CHECK on forecasts.method ----------
-- Live distinct values: 'seasonal_ratio' only. Defensive — protects against typo
-- introductions when alternate methods are added.
ALTER TABLE public.forecasts
  ADD CONSTRAINT forecasts_method_check
  CHECK (method IN ('seasonal_ratio')) NOT VALID;
ALTER TABLE public.forecasts
  VALIDATE CONSTRAINT forecasts_method_check;

-- ---------- §7: range CHECK on health_scores.composite_score ----------
-- Mirror the constraint that observations.observed_score already has.
ALTER TABLE public.health_scores
  ADD CONSTRAINT health_scores_composite_score_check
  CHECK (composite_score BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE public.health_scores
  VALIDATE CONSTRAINT health_scores_composite_score_check;
```

### Dashboard / CLI manual (NOT a migration file)

```sql
-- S-01: Reconcile migration registry — migration 002 ran but isn't recorded.
-- Run via `supabase db query --linked` or Dashboard SQL Editor. NOT in a migration file.
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('002')
ON CONFLICT (version) DO NOTHING;
```

No `CREATE INDEX CONCURRENTLY` needed in this pass — none of the proposed indexes are new (we're only dropping). All `DROP INDEX` and `ALTER TABLE … ADD CONSTRAINT … NOT VALID` are short-lock operations safe to put in a normal migration file at this scale.

---

## Severity Summary

| Severity | Count | Findings |
|---|---:|---|
| 🔴 CRITICAL | 0 | — |
| 🟠 HIGH | 1 | S-01 migration drift (002 applied out-of-band) |
| 🟡 MEDIUM | 2 | §5 6× redundant indexes; §7 missing CHECKs (`run_type`, `method`, score range) |
| 🔵 LOW | 2 | §4 unused indexes; §2 dead-tuple bloat (cosmetic) |
| ⚪ INFO | 3 | §1 sizes (page-floor inflation); §6 conventions all green; §10 capacity all green |
| ✅ PASS | 4 | §3 FK indexes; §6 conventions; §8 generated columns; §10 capacity |

**Single most important finding:** S-01 — migration 002 ran out-of-band and isn't recorded in `supabase_migrations.schema_migrations`. Idempotent today thanks to `IF NOT EXISTS`, but the next non-idempotent migration will fail. Reconcile in one statement (Dashboard or `supabase db query`).

**Migration-safe SQL snippets:** 11 statements (6 DROP INDEX + 3 ADD CONSTRAINT + 2 VALIDATE)
**Dashboard-only SQL snippets:** 1 (registry reconcile)

---

## Confirmation

- Read-only diagnostic queries only. **No `DROP`, `ALTER`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` was executed against the database.**
- No migration files were created or modified.
- No application code was touched.
- No commits.
- `_db-audit/01-schema-health.md` is the only file written.
