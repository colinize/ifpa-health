# Pass 2 — Query Performance

## Snapshot

| Field | Value |
|---|---|
| Audit date | 2026-04-17 |
| `pg_stat_statements` | ✅ enabled (v1.11) |
| `pg_stat_statements` window | since 2026-02-05 20:26 UTC (~71 days) |
| `pg_stat_user_*` window | since 2025-12-08 11:03 UTC (~131 days) |
| Heap cache hit ratio | **99.97 %** (hits 11,556 / reads 3) |
| Index cache hit ratio | **99.96 %** (hits 243,176 / reads 90) |
| Custom functions in `public` | 0 (confirmed — no RPCs, no SECURITY DEFINER) |
| Perf advisors (Supabase) | 3 findings — 2 unused-index (unchanged from Pass 1), 1 auth infra (unchanged) |

All six page queries run **under 0.3 ms** on the live DB. The dashboard is not query-constrained.

---

## 1. Supabase performance advisors ⚪ INFO

Re-ran `supabase db advisors --linked --type performance --level info`. Output is **identical to Pass 1**:

1. `idx_shadow_scores_score_date` — unused
2. `idx_collection_runs_type_started` — unused
3. `auth_db_connections_absolute` — Auth server fixed at 10 connections (Supabase infra, not app-side)

No new advisors since Pass 1. The two unused-index findings are already in the Pass 1 fix queue (drop).

---

## 2. pg_stat_statements — app query traffic 🔵 LOW

Extension enabled. Stats reset **2026-02-05**, so we have 71 days of call data — long enough to trust patterns.

Statement distribution by role:

| Role | Distinct statements tracked |
|---|---:|
| supabase_auth_admin | 208 |
| supabase_admin | 193 |
| supabase_storage_admin | 183 |
| postgres | 129 |
| service_role | 48 |
| anon | 32 |
| authenticator | 19 |
| pgbouncer | 3 |

The top-20 by `total_exec_time` are all framework/system queries (`pg_timezone_names`, `pg_backup_stop`, PostgREST type introspection, supabase_admin storage/auth bootstrap, `SHOW transaction_read_only`). **None of those are app traffic** — they're infra heartbeat.

### Top app queries (filtered to `anon` + `service_role`)

Anon role (Server Component page reads via PostgREST):

| Table / query | calls | total ms | mean ms | max ms | notes |
|---|---:|---:|---:|---:|---|
| `country_snapshots ORDER BY snapshot_date ASC` | 61 | **141.23** | 2.32 | 10.11 | **Largest single app query.** Returns full 408 rows. See §4. |
| `monthly_event_counts ORDER BY year ASC, month ASC` | 137 | 104.39 | 0.76 | 4.46 | Superseded — current code uses DESC + LIMIT 24 (see §4.c) |
| `annual_snapshots ORDER BY year ASC` | 137 | 33.45 | 0.24 | 3.16 | Fine |
| `collection_runs ORDER BY started_at DESC LIMIT 1` | 137 | 29.73 | 0.22 | 2.73 | Seq scan — see §4.e |
| `health_scores ORDER BY score_date DESC LIMIT 1` | 137 | 26.79 | 0.20 | 3.91 | Index-served |
| `forecasts ORDER BY forecast_date DESC LIMIT 1` | 118 | 17.10 | 0.14 | 2.43 | Index-served |

Service role (cron writes — all via PostgREST `INSERT ... FROM json_to_record(...)`):

| Operation | calls | total ms | mean ms | notes |
|---|---:|---:|---:|---|
| `INSERT ... wppr_rankings` | 47 | 189.78 | 4.04 | Largest writer. 2,350 total rows inserted across 47 weekly runs ≈ 50/insert batch — actually each call is one `INSERT ... SELECT ... FROM json_to_record` of ~250 rows, so 4 ms / 250 rows is fine. |
| `INSERT ... collection_runs` | 85 | 133.35 | 1.57 | One per run start |
| `INSERT ... overall_stats_snapshots` | 48 | 58.66 | 1.22 | Daily |
| `INSERT ... health_scores` | 47 | 49.28 | 1.05 | Daily |
| `INSERT ... country_snapshots` | 10 | 42.12 | 4.21 | Weekly, ~100 rows/insert |
| `INSERT ... forecasts` | 47 | 35.26 | 0.75 | Daily |
| `INSERT ... monthly_event_counts` | 11 | 21.96 | 2.00 | Weekly |
| `SELECT annual_snapshots (for forecaster)` | 48 | 21.18 | 0.44 | Read during forecast compute |
| `UPDATE collection_runs ... SET completed_at,...` | 48 | 11.87 | 0.25 | One per run end |

**Severity: 🔵 LOW.** Mean times are all under 5 ms. Highest observed total impact for a single app query is 189 ms across 47 calls (wppr insert, weekly) — that's 4 seconds of DB CPU per year. Nothing needs optimization.

### Most-called queries (top 5 excluding framework heartbeat)

Most calls go to `SHOW transaction_read_only` (30,600), `select setting from pg_config` (10,200), and session setup (`SET client_encoding`, `BEGIN`). These are PostgREST per-request overhead and are expected.

The most-called **app** query (137 calls over 71 days) is the set of 6 page fetches — roughly matches the ISR revalidate cadence (~2/day) plus manual hits. Not a volume concern.

---

## 3. Sequential scans on `public` tables

Query: `pg_stat_user_tables`. Results sorted by `seq_tup_read` (biggest potential pain):

| Table | n_live_tup | seq_scan | seq_tup_read | idx_scan | seq % | Verdict |
|---|---:|---:|---:|---:|---:|---|
| collection_runs | 84 | 155 | 5,296 | 75 | 67.4 % | 🟡 expected (see §4.e) — freshness query does a full scan |
| country_snapshots | 408 | 10 | 617 | 584 | 1.7 % | ✅ index-served |
| observations | 10 | 21 | 90 | 1 | 95.5 % | ⚪ table has no non-PK index; 10 rows |
| monthly_event_counts | 88 | 4 | 86 | 500 | 0.8 % | ✅ index-served |
| forecasts | 48 | 4 | 48 | 187 | 2.1 % | ✅ |
| methodology_versions | 1 | 5 | 3 | 0 | 100 % | ⚪ 1 row, seq is cheapest |
| health_scores | 48 | 3 | 0 | 189 | 1.6 % | ✅ |
| overall_stats_snapshots | 47 | 3 | 0 | 59 | 4.8 % | ✅ |
| wppr_rankings | 2,350 | 2 | 0 | 2,359 | 0.1 % | ✅ |
| annual_snapshots | 10 | 3 | 0 | 255 | 1.2 % | ✅ |
| shadow_scores | 1 | 3 | 0 | 3 | 50.0 % | ⚪ 1 row |

**Only one table has n_live_tup > 1,000 (`wppr_rankings`) and its seq scan rate is 0.1 %.** Every seq-scan-heavy table has < 100 rows — Postgres will (correctly) pick seq scan over index lookup at that size. No action warranted by scale.

The `collection_runs` seq scan ratio is 67 % but Pass 1 already proposed dropping `idx_collection_runs_type_started` (unused, planner ignores it for the freshness query). §4.e below shows the full EXPLAIN.

---

## 4. Server Component query audit — live EXPLAIN ANALYZE

`app/page.tsx` fetches from 6 tables in parallel. Each query run once against the live DB with `EXPLAIN (ANALYZE, BUFFERS)`:

### a. `health_scores` — `ORDER BY score_date DESC LIMIT 1` ✅

```
Limit  (cost=0.15..0.19 rows=1) (actual time=0.019..0.019 rows=1)
  Buffers: shared hit=2
  -> Index Scan Backward using idx_health_scores_score_date on health_scores
                                     (actual time=0.018..0.018 rows=1)
Planning Time: 0.457 ms
Execution Time: 0.059 ms
```

Index-served. `idx_health_scores_score_date` is the index used **and** it's a Pass 1 drop candidate (redundant with `health_scores_score_date_key`). When dropped, the unique constraint's implicit index will serve the same query — no regression. ✅

### b. `annual_snapshots` — `ORDER BY year ASC` ✅

```
Index Scan using idx_annual_snapshots_year on annual_snapshots
                                     (actual time=0.016..0.019 rows=10)
Planning Time: 0.431 ms
Execution Time: 0.074 ms
```

Index-served. Same story: `idx_annual_snapshots_year` is redundant with `annual_snapshots_year_key`. Drop is safe. ✅

### c. `monthly_event_counts` — `ORDER BY year DESC, month DESC LIMIT 24` ✅

```
Limit  (actual time=0.014..0.027 rows=24)
  -> Index Scan Backward using idx_monthly_event_counts_year_month
                                     (actual time=0.013..0.024 rows=24)
Planning Time: 0.380 ms
Execution Time: 0.080 ms
```

Backward scan on the composite `(year, month)` index returns the 24 newest rows without a sort. `idx_monthly_event_counts_year_month` is redundant with `monthly_event_counts_year_month_key` — drop is safe, the unique index covers the same reads. ✅

Note: pg_stat_statements shows 137 calls of the ASC variant (pre-Pass-5 frontend audit fix). After the audit fix landed, future calls will be DESC+LIMIT 24, which is even cheaper than the full-table ASC scan was.

### d. `forecasts` — `ORDER BY forecast_date DESC LIMIT 1` ✅

```
Limit  (actual time=0.025..0.026 rows=1)
  -> Index Scan Backward using idx_forecasts_forecast_date on forecasts
                                     (actual time=0.024..0.024 rows=1)
Planning Time: 0.433 ms
Execution Time: 0.075 ms
```

Index-served. `idx_forecasts_forecast_date` is the leading column of `forecasts_forecast_date_target_year_key` (composite unique). After Pass 1 drops the redundant index, the composite will serve the same query with identical cost. ✅

### e. `collection_runs` — `ORDER BY started_at DESC LIMIT 1` 🟡 LOW

```
Limit
  -> Sort  (top-N heapsort, Memory: 26kB)
       -> Seq Scan on collection_runs  (actual time=0.012..0.058 rows=84)
              Buffers: shared hit=7
Planning Time: 0.394 ms
Execution Time: 0.170 ms
```

**No index on `started_at` alone.** The existing `idx_collection_runs_type_started (run_type, started_at)` starts with `run_type`, which the query doesn't filter on, so the planner picks Seq Scan + top-N heapsort. At 84 rows × 8 kB page = 7 buffer hits, 0.17 ms. Harmless today.

Two fix shapes (don't need to pick now — both are in the Pass 1 proposal):

1. **Drop the composite** (Pass 1's recommendation — it's flagged unused by both pg_stat_user_indexes and the Supabase advisor). The freshness query keeps seq-scanning at sub-millisecond cost. Simplest. Stays simplest up to ~10,000 rows.
2. **Replace with a single-column index** on `started_at DESC`. Only worth it if the table grows past a few thousand rows (~5 years of daily runs). Don't do this preemptively.

Severity 🟡 LOW — flagged in Pass 1 §4; no change. **Do not preemptively add an index** — the table grows ~7 rows/week; at 1,000 rows in 3 years it's still a seq scan the planner will finish in < 1 ms.

### f. `country_snapshots` — `ORDER BY snapshot_date ASC` 🟡 MEDIUM

```
Index Scan using country_snapshots_snapshot_date_country_name_key
                                     (actual time=0.021..0.122 rows=408)
  Buffers: shared hit=59
Planning Time: 0.384 ms
Execution Time: 0.219 ms
```

Index-served by the composite unique `(snapshot_date, country_name)`. Execution is fast (0.22 ms), but this query returns **all 408 rows** every ISR revalidate and is the highest-total-time app query (141 ms / 61 calls / 2.32 ms mean — the pg_stat_statements number exceeds the raw EXPLAIN because PostgREST also runs `count(*)` and `json_agg`).

Page-code issue, not an index issue. `app/page.tsx` does `.select('...').order('snapshot_date', asc)` with no `.limit()`. The table grows ~100 rows/week, so it'll cross the JS-client 1000-row cap in ~6 weeks (flagged in Pass 1 §10). Fix is app-side — narrow to latest + earliest snapshot dates, or `.range()` pagination. Not a DB change.

**Severity 🟡 MEDIUM on the call pattern, not the index.**

---

## 5. Cache hit ratios ✅

```
heap  hit = 11,556  read = 3   → 99.97 %
index hit = 243,176 read = 90  → 99.96 %
```

Well above the 99 % threshold. Both layers are essentially always hot — the entire DB fits in shared_buffers with room to spare (1.4 MB total; default Supabase shared_buffers is at least 128 MB). The 3 heap reads and 90 index reads are one-time cold-start faults from pod restarts.

**Severity: ✅ PASS.** Calibrated note: at this traffic level (ISR revalidate every hour = ~24 page renders/day), the DB barely stays warm enough to keep the cache populated; any meaningful activity lights it up.

---

## 6. Function / RPC performance ✅

```sql
SELECT n.nspname, p.proname, p.prokind, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';
```

**Zero rows returned.** No custom functions, no SECURITY DEFINER, no RPCs. Matches `CLAUDE.md`: the app uses PostgREST table reads/writes only. Nothing to audit.

**Severity: ✅ PASS.**

---

## Fix phase — SQL

Nothing new originates from Pass 2. The only query-performance-adjacent fixes are already proposed in Pass 1:

### Migration-safe (Pass 1 §5 + §4 — already listed there; not re-written here)

```sql
-- (repeat of Pass 1 §5/§4 — included for completeness, DO NOT duplicate in a new migration)
DROP INDEX IF EXISTS public.idx_annual_snapshots_year;         -- EXPLAIN §4.b — covered by unique
DROP INDEX IF EXISTS public.idx_monthly_event_counts_year_month; -- EXPLAIN §4.c — covered by unique
DROP INDEX IF EXISTS public.idx_overall_stats_snapshot_date;
DROP INDEX IF EXISTS public.idx_health_scores_score_date;      -- EXPLAIN §4.a — covered by unique
DROP INDEX IF EXISTS public.idx_forecasts_forecast_date;       -- EXPLAIN §4.d — covered by composite leading col
DROP INDEX IF EXISTS public.idx_shadow_scores_score_date;
DROP INDEX IF EXISTS public.idx_collection_runs_type_started;  -- EXPLAIN §4.e — unused; freshness query keeps seq-scanning
```

All migration-safe (short lock, 84-2,350 row tables, no index rewrites).

### New in Pass 2: *none*

No `CREATE INDEX CONCURRENTLY` is justified. Specifically **do not** add:

- `CREATE INDEX ON collection_runs (started_at DESC)` — 84 rows, 0.17 ms seq scan. Revisit at > 5,000 rows (24 years away at current growth).
- `CREATE INDEX ON country_snapshots (snapshot_date DESC, pct_of_total DESC)` — existing composite already serves the query in 0.22 ms. Over-fetch is an app fix.

App-side suggestion (not SQL): narrow `app/page.tsx` `country_snapshots` fetch to the snapshot dates actually rendered. Belongs to Pass 4 / frontend work.

---

## Severity Summary

| Severity | Count | Findings |
|---|---:|---|
| 🔴 CRITICAL | 0 | — |
| 🟠 HIGH | 0 | — |
| 🟡 MEDIUM | 1 | §4.f `country_snapshots` over-fetch (app-side, not DB) |
| 🔵 LOW | 2 | §2 wppr_rankings insert is largest app-query cost (190 ms / 71 days — ignorable); §3/§4.e collection_runs seq scan (Pass 1 already has drop) |
| ⚪ INFO | 3 | §1 advisors unchanged from Pass 1; §3 small-table seq scans expected; §5 cache hit ratios > 99.9 % |
| ✅ PASS | 3 | §4.a–d page queries sub-ms; §5 cache ratios; §6 zero custom functions |

**Single query that matters most:** The `country_snapshots ORDER BY snapshot_date ASC` fetch in `app/page.tsx`. It's the largest app query in pg_stat_statements (141 ms total, 2.32 ms mean over 61 calls) and the one that scales linearly with snapshot count. Today it's still index-served in 0.22 ms — the concern is **growth**, not current cost. Mitigation is app-side (a narrower select with `.limit()` or filter on the two dates the render actually uses), crossing into Pass 4 territory.

**New migration-safe SQL:** 0 statements (Pass 1's DROP set already covers every performance-adjacent index fix).
**New Dashboard-only SQL:** 0 statements.
**Pass 2 output:** `_db-audit/02-query-performance.md`

---

## Confirmation

- Read-only queries only. No DDL or DML was executed.
- No migration files created.
- No app code touched.
- No commits.
- Only file written: `_db-audit/02-query-performance.md`.
