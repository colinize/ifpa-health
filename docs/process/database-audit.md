# Database Audit & Health Check — Multi-Pass Supabase PostgreSQL Review (ifpa-health)

> **What this is:** A structured prompt system for Claude Code that audits the ifpa-health Supabase database for schema issues, query performance, security gaps, data integrity, and infrastructure health. Calibrated to this project's scope: 11 tables, 2 migrations, single environment, no RPCs/pg_cron/Edge Functions.
>
> **How to use:** Tell Claude Code: "Run all 5 passes of the database audit." Or run individual passes ("Pass 3 of the database audit").
>
> **When to run:** After schema changes, after noticing slow page loads, after the security scan, or roughly quarterly.
>
> **Caveat:** Read-only system-catalog queries. Fix-phase changes are written as SQL, not applied. Since there's no staging, every change ships straight to prod — review fix SQL carefully.

---

## MASTER INSTRUCTION

You are performing a comprehensive database audit of the ifpa-health Supabase PostgreSQL database. Execute 5 sequential passes. Each pass has TWO phases: **audit** (find problems) and **fix** (write SQL, don't apply). After each pass, write findings to `_db-audit/{NN}-*.md` at the project root.

**Pre-flight reconnaissance:**

- Read `CLAUDE.md` to refresh context.
- Read both migrations:
  - `supabase/migrations/001_initial_schema.sql`
  - `supabase/migrations/002_forecast_player_columns.sql`
- Confirm Supabase project ref: **`ryteszuvasrfppgecnwe`** (us-west-1, pooler at `aws-0-us-west-1.pooler.supabase.com:6543`).
- Check if Supabase MCP is authenticated:
  ```
  mcp__supabase__get_advisors(project_id: "ryteszuvasrfppgecnwe", type: "performance")
  ```
  If it works, use MCP for Passes 2 and 3. Otherwise fall back to Dashboard SQL Editor.
- Check for prior runs: does `_db-audit/` exist? If so, reference the last summary — don't duplicate unresolved findings.
- Count applied vs local migrations; flag drift.
- Write a brief "Database Context Summary" at the top of `_db-audit/01-schema-health.md` (project ref, region, table count, migration count, date, prior audit reference).

**Rules:**

- Diagnostic queries run via MCP `execute_sql` or Dashboard SQL Editor. Note Dashboard-only queries when they need superuser.
- Write migration SQL for fixes, don't apply directly. No staging = every change is live.
- Be practical: this is a small read-only dashboard. Over-engineering is a bigger risk than performance collapse.
- Use `CREATE INDEX CONCURRENTLY` for any new indexes. Flag when DDL needs Dashboard (pooler timeouts) — unlikely at this scale but the pattern matters.
- Reference `~/.claude/skills/supabase-postgres-best-practices/` for patterns and correct SQL.

**Severity scale:**

- :red_circle: **CRITICAL** — Data loss, security hole, broken pipeline
- :orange_circle: **HIGH** — User-facing incorrectness or will break at 2-5x growth
- :yellow_circle: **MEDIUM** — Real but manageable; fix in next grooming pass
- :blue_circle: **LOW** — Best practice violation, defense-in-depth
- :white_circle: **INFO** — Awareness only

**Supabase constraints (even at this scale):**

- **Pooler statement timeout:** Long DDL gets killed. Not an issue today. Write "migration-safe" vs "Dashboard-only" labels on fix SQL regardless.
- **Transaction-mode pooling:** No prepared statements. JS client avoids them. If a Python service is ever added (asyncpg), set `statement_cache_size=0`.
- **JS client 1000-row cap:** `.select()` silently caps at 1000 rows. `country_snapshots` has the highest growth rate and is the future risk.
- **RLS + service role:** Service role bypasses RLS. Service usage in collectors, cron, admin, scripts is expected. Cross-reference security-scan, don't duplicate.

---

## PASS 1: Schema & Structure Health

**Output file:** `_db-audit/01-schema-health.md`

**Audit phase — Check:**

1. **Table sizes and row counts**
   ```sql
   SELECT
     relname AS table_name,
     pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
     pg_size_pretty(pg_relation_size(relid)) AS table_size,
     pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
     n_live_tup AS row_count
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(relid) DESC;
   ```
   - Expect tiny totals (low MB). Flag anything surprising.
   - Flag tables where `index_size > 2x table_size` (over-indexing).

2. **Dead tuple ratio**
   ```sql
   SELECT relname, n_live_tup, n_dead_tup,
     CASE WHEN n_live_tup > 0 THEN round(100.0 * n_dead_tup / n_live_tup, 1) ELSE 0 END AS dead_pct,
     last_autovacuum, last_autoanalyze
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
   ORDER BY dead_pct DESC;
   ```
   - Flag `dead_pct > 10%`. Tables never vacuumed are usually fine at this scale.

3. **Missing foreign key indexes**
   ```sql
   SELECT c.conrelid::regclass AS table_name, a.attname AS fk_column, c.confrelid::regclass AS references_table
   FROM pg_constraint c
   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey));
   ```
   - ifpa-health declares **no FKs**. Expected: zero results. Any hit = future FK added without an index.
   - Reference: `~/.claude/skills/supabase-postgres-best-practices/references/schema-foreign-key-indexes.md`

4. **Unused indexes**
   ```sql
   SELECT relname AS table_name, indexrelname AS index_name,
     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size, idx_scan
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public' AND idx_scan = 0 AND indexrelname NOT LIKE '%_pkey'
   ORDER BY pg_relation_size(indexrelid) DESC;
   ```
   - Cross-reference with `app/page.tsx` fetch patterns. An index may look unused but fire once per hour on ISR revalidate.
   - Check stats reset time: `SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();`

5. **Duplicate / redundant indexes**
   ```sql
   SELECT a.indexrelid::regclass AS redundant, b.indexrelid::regclass AS covering,
     pg_size_pretty(pg_relation_size(a.indexrelid)) AS wasted
   FROM pg_index a JOIN pg_index b ON a.indrelid = b.indrelid AND a.indexrelid != b.indexrelid
     AND a.indkey::text = ANY(SELECT string_agg(x::text, ' ') FROM unnest(b.indkey) WITH ORDINALITY AS t(x, ord)
       WHERE ord <= array_length(a.indkey, 1));
   ```
   - Unique constraints create implicit indexes. `idx_annual_snapshots_year` is redundant with `unique(year)`. Flag `LOW` — harmless at this write volume but duplicative.

6. **NOT NULL and CHECK coverage**
   Verify schema invariants from `001_initial_schema.sql`:
   - `annual_snapshots.tournaments / player_entries / unique_players` — NOT NULL
   - `monthly_event_counts.month` — CHECK 1-12
   - `health_scores.band` — CHECK in enum list
   - `observations.observed_health / observed_score` — CHECK
   - `collection_runs.status` — CHECK in `('running', 'success', 'error')`
   - **Gaps to flag:** `collection_runs.run_type` (unconstrained — likely should be `('daily', 'weekly')`). `forecasts.method` defaults to `seasonal_ratio` but has no CHECK.

7. **timestamp vs timestamptz consistency**
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
   ORDER BY table_name, column_name;
   ```
   - Convention: `timestamptz` everywhere. Flag bare `timestamp`.

8. **Generated column sanity check**
   `annual_snapshots` has two stored generated columns:
   - `avg_attendance = player_entries / nullif(tournaments, 0)`
   - `retention_rate = returning_players / unique_players * 100` when `unique_players > 0`

   Verify live:
   ```sql
   SELECT year, tournaments, player_entries, unique_players, returning_players,
     avg_attendance, retention_rate,
     round(player_entries::numeric / nullif(tournaments, 0), 1) AS expected_avg_attendance,
     CASE WHEN unique_players > 0
       THEN round(returning_players::numeric / unique_players * 100, 1) ELSE NULL END AS expected_retention_rate
   FROM annual_snapshots
   ORDER BY year DESC LIMIT 10;
   ```
   - Mismatches = formula drift. Flag `HIGH`.

**Fix phase — Write:**

```sql
-- Migration-safe fixes (e.g., 003_schema_cleanup.sql)

-- Drop redundant index (shadowed by unique constraint)
-- DROP INDEX IF EXISTS idx_annual_snapshots_year;

-- Constrain collection_runs.run_type (verify existing rows first)
-- ALTER TABLE collection_runs
--   ADD CONSTRAINT collection_runs_run_type_check
--   CHECK (run_type IN ('daily', 'weekly')) NOT VALID;
-- -- Then: ALTER TABLE collection_runs VALIDATE CONSTRAINT collection_runs_run_type_check;
```

- Mark each fix with severity, reversibility, and rationale.
- For `NOT NULL` tightening, include the "verify zero nulls" SELECT first.

---

## PASS 2: Query Performance

**Output file:** `_db-audit/02-query-performance.md`

**Audit phase — Check:**

1. **Supabase Performance Advisors** (if MCP authenticated)
   ```
   mcp__supabase__get_advisors(project_id: "ryteszuvasrfppgecnwe", type: "performance")
   ```
   Document findings with remediation URLs.

2. **pg_stat_statements availability**
   ```sql
   SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_stat_statements';
   ```
   Supabase Pro enables it by default. If missing, flag for Dashboard install and skip slow-query checks.

3. **Slowest queries by total time**
   ```sql
   SELECT calls,
     round(total_exec_time::numeric, 2) AS total_ms,
     round(mean_exec_time::numeric, 2) AS mean_ms,
     round(max_exec_time::numeric, 2) AS max_ms,
     rows, query
   FROM pg_stat_statements
   WHERE userid IN (SELECT usesysid FROM pg_user WHERE usename NOT LIKE 'pg_%')
   ORDER BY total_exec_time DESC LIMIT 20;
   ```
   - Reference: `~/.claude/skills/supabase-postgres-best-practices/references/monitor-pg-stat-statements.md`
   - Most traffic should be the 6 parallel `.select()` calls from `app/page.tsx`.

4. **Sequential scans**
   ```sql
   SELECT relname, seq_scan, seq_tup_read, idx_scan, n_live_tup,
     CASE WHEN (seq_scan + idx_scan) > 0 THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 1) ELSE 0 END AS seq_pct
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
   ORDER BY seq_tup_read DESC;
   ```
   - Under ~10k rows, seq scans are cheap. Only flag if `annual_snapshots`, `monthly_event_counts`, or `country_snapshots` show high seq counts AND large row counts.
   - `country_snapshots` grows daily × N countries and the page fetches `ORDER BY pct_of_total DESC`. Confirm the `(snapshot_date, country_name)` unique index serves latest-snapshot lookups.

5. **Page-level query audit** (the entire read path is `app/page.tsx`)

   The Server Component fetches from 6 tables in parallel:
   - `health_scores` — latest row
   - `annual_snapshots` — all years
   - `monthly_event_counts` — last 24 months
   - `country_snapshots` — latest `snapshot_date`
   - `forecasts` — latest row
   - `collection_runs` — latest row (freshness badge)

   For each:
   - Is there an index serving `ORDER BY ... LIMIT 1`?
   - Is a composite index needed (e.g., `country_snapshots (snapshot_date DESC, pct_of_total DESC)`)?
   - Does the select fetch more columns than render? Trim it.

6. **Cache hit ratio** (should be >99%)
   ```sql
   SELECT sum(heap_blks_hit) AS heap_hit, sum(heap_blks_read) AS heap_read,
     CASE WHEN sum(heap_blks_hit + heap_blks_read) > 0
       THEN round(100.0 * sum(heap_blks_hit) / sum(heap_blks_hit + heap_blks_read), 2) ELSE 0 END AS hit_pct
   FROM pg_statio_user_tables;
   ```

7. **Index hit ratio**
   ```sql
   SELECT sum(idx_blks_hit) AS idx_hit, sum(idx_blks_read) AS idx_read,
     CASE WHEN sum(idx_blks_hit + idx_blks_read) > 0
       THEN round(100.0 * sum(idx_blks_hit) / sum(idx_blks_hit + idx_blks_read), 2) ELSE 0 END AS hit_pct
   FROM pg_statio_user_indexes;
   ```

8. **Over-indexing check**
   7 hand-rolled indexes plus unique-constraint indexes across 11 tables is about right. If any single table has >3 indexes, challenge each.

**Fix phase — Write:**

- For page-query seq scans on a large table: `CREATE INDEX CONCURRENTLY` SQL.
- For duplicate indexes: drop SQL from Pass 1.
- For top 3 slowest queries: annotate each with suggested fix (index, rewrite, cache layer).
- Label "migration-safe" vs "Dashboard-only." Nothing here should need Dashboard at current scale.

---

## PASS 3: Security & RLS Audit

**Output file:** `_db-audit/03-security-rls.md`

> **Cross-reference:** This overlaps with `docs/process/security-scan.md`. If a security scan has been run recently, reference `_security/` — don't re-audit end-to-end. This pass focuses on DB-side enforcement.

**Audit phase — Check:**

1. **Supabase Security Advisors** (if MCP authenticated)
   ```
   mcp__supabase__get_advisors(project_id: "ryteszuvasrfppgecnwe", type: "security")
   ```

2. **RLS coverage** (all 11 tables should have RLS enabled)
   ```sql
   SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
   FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname;
   ```
   - All must have `rls_enabled = true`. FORCE RLS is optional here (no sensitive data).

3. **Policy inventory**
   ```sql
   SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```
   - Expected per table:
     - `Allow public read` for `anon`, cmd `SELECT`, `USING (true)`
     - `Allow service write` for `service_role`, cmd `ALL`, `USING (true) WITH CHECK (true)`
   - Flag any deviation. In particular, any `anon` policy that isn't SELECT-only.

4. **Grants audit — anon should not write**
   ```sql
   SELECT grantee, table_schema, table_name, privilege_type
   FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
   ORDER BY grantee, table_name, privilege_type;
   ```
   - Supabase grants `anon` table-level INSERT/UPDATE/DELETE by default; RLS is what actually restricts. Flag any surprising direct grants and any `TRUNCATE` to `anon`.

5. **Service role usage in application code**

   Expected call sites:
   - `app/api/cron/daily/route.ts`
   - `app/api/cron/weekly/route.ts`
   - `app/api/admin/observations/*`
   - `app/api/admin/calibrate/*`
   - `scripts/backfill.ts`, `scripts/recompute-v2-score.ts`, `scripts/recompute-forecast.ts`

   Grep `createServiceClient` across `app/`, `scripts/`, `lib/`. Flag any usage in a Server Component or an unauthed route not in the list above.

6. **Admin route authentication**

   Per `CLAUDE.md` Known Issues: `/api/admin/observations` and `/api/admin/calibrate` are **unauthed** and use the service client.
   - :red_circle: CRITICAL for security-scan scope. This pass documents the DB-side implication: anyone who finds those URLs can write to `observations` and `methodology_versions`, bypassing RLS.
   - Fix is app-side (header check or Vercel protection). Note here, don't block on SQL.

7. **CRON_SECRET handling**
   - Strong value (32+ bytes)?
   - Verified before any DB write in both cron routes?
   - Not logged anywhere (grep to confirm)?

8. **Overly permissive policies**
   - `USING (true)` is acceptable here because data is public. But note for the record — if a future table lands with sensitive data, the default copy-paste would be a disaster.

**Fix phase — Write:**

- If any table lacks RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + the two standard policies.
- If any `anon` write grant exists: `REVOKE INSERT, UPDATE, DELETE ON ... FROM anon;`
- For admin route exposure: note the app-layer fix (not SQL).
- For each policy deviation: write the corrected policy.

---

## PASS 4: Data Integrity

**Output file:** `_db-audit/04-data-integrity.md`

**Audit phase — Check:**

1. **Sync health — is cron running?**
   ```sql
   SELECT run_type, status, started_at, completed_at, records_affected, error_message,
     completed_at - started_at AS duration
   FROM collection_runs
   ORDER BY started_at DESC LIMIT 20;
   ```
   - Flag if latest `daily` run > 36 hours old.
   - Flag if latest `weekly` run > 10 days old.
   - Flag any `error` in last 7 days.
   - Flag orphaned `running` rows (crashed mid-execution).

2. **Freshness of snapshot tables**
   ```sql
   SELECT 'annual_snapshots' AS t, max(collected_at) FROM annual_snapshots
   UNION ALL SELECT 'monthly_event_counts', max(collected_at) FROM monthly_event_counts
   UNION ALL SELECT 'overall_stats_snapshots', max(collected_at) FROM overall_stats_snapshots
   UNION ALL SELECT 'country_snapshots', max(collected_at) FROM country_snapshots
   UNION ALL SELECT 'wppr_rankings', max(collected_at) FROM wppr_rankings
   UNION ALL SELECT 'health_scores', max(collected_at) FROM health_scores
   UNION ALL SELECT 'forecasts', max(collected_at) FROM forecasts
   ORDER BY 2 ASC;
   ```
   - Expected cadence: `health_scores`, `forecasts`, `overall_stats_snapshots` — daily. `annual_snapshots`, `monthly_event_counts`, `country_snapshots`, `wppr_rankings` — weekly.
   - Flag anything stale by >2× its expected interval.

3. **Current-year coverage**
   ```sql
   SELECT year, collected_at, tournaments, unique_players
   FROM annual_snapshots
   WHERE year = EXTRACT(year FROM now())::int;
   ```
   Missing row = weekly cron hasn't run yet this year OR IFPA API shape changed.

4. **Monthly coverage**
   ```sql
   SELECT year, month, event_count, collected_at
   FROM monthly_event_counts
   WHERE year = EXTRACT(year FROM now())::int
   ORDER BY month;
   ```
   Gap months = collector failure or IFPA gap.

5. **NULL audit for tightening candidates**
   ```sql
   SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND is_nullable = 'YES'
     AND column_name NOT IN ('completed_at', 'error_message', 'details')
   ORDER BY table_name, column_name;
   ```
   - Tightening candidates (if always populated):
     - `annual_snapshots.returning_players` (needed by `retention_rate`)
     - `annual_snapshots.new_players`, `countries`
     - `country_snapshots.country_code`
   - For each: `SELECT count(*) FROM {table} WHERE {column} IS NULL;` — tighten only if zero.

6. **CHECK coverage**
   ```sql
   SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
   FROM pg_constraint
   WHERE contype = 'c' AND connamespace = 'public'::regnamespace
   ORDER BY conrelid::regclass::text, conname;
   ```
   - Gaps: `collection_runs.run_type`, `forecasts.method`.

7. **Duplicate detection** (uniques should catch these, spot-check):
   ```sql
   SELECT year, count(*) FROM annual_snapshots GROUP BY year HAVING count(*) > 1;
   SELECT year, month, count(*) FROM monthly_event_counts GROUP BY year, month HAVING count(*) > 1;
   SELECT snapshot_date, country_name, count(*) FROM country_snapshots
     GROUP BY snapshot_date, country_name HAVING count(*) > 1;
   SELECT snapshot_date, player_id, count(*) FROM wppr_rankings
     GROUP BY snapshot_date, player_id HAVING count(*) > 1;
   ```
   Any row returned = unique constraint broken. `CRITICAL`.

8. **Generated column integrity** — re-run Pass 1 step 8. Drift = `HIGH`.

9. **Logical consistency (no FKs declared)**
   ```sql
   -- health_scores.methodology_version should resolve
   SELECT hs.id, hs.score_date, hs.methodology_version
   FROM health_scores hs
   LEFT JOIN methodology_versions mv ON mv.version_number = hs.methodology_version
   WHERE mv.id IS NULL;
   -- Same for shadow_scores.methodology_version
   ```

10. **Country-snapshots growth (JS client 1000-row cap)**
    ```sql
    SELECT snapshot_date, count(*) AS country_rows
    FROM country_snapshots
    GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 5;
    ```
    Latest snapshot likely has ~100 countries — fine. Flag `INFO` that if `app/page.tsx` ever fetches across multiple snapshots without `.range()`, results will silently truncate.

**Fix phase — Write:**

- Stale tables: note suspected cause + point at collector file.
- NULL-able columns ready to tighten: `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` with verifying SELECT.
- Missing CHECKs: `ADD CONSTRAINT ... NOT VALID` then `VALIDATE`.
- Orphaned `running` rows: one-time cleanup UPDATE.
- Duplicates: flag for manual review, don't auto-delete.

---

## PASS 5: Infrastructure & Operations

**Output file:** `_db-audit/05-infrastructure.md`

**Audit phase — Check:**

1. **Connection utilization**
   ```sql
   SELECT count(*) AS total,
     count(*) FILTER (WHERE state = 'active') AS active,
     count(*) FILTER (WHERE state = 'idle') AS idle,
     count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
     (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
   FROM pg_stat_activity
   WHERE datname = current_database();
   ```
   - Flag active > 30 or any lingering `idle in transaction`.
   - Reference: `~/.claude/skills/supabase-postgres-best-practices/references/conn-pooling.md`

2. **Long-running queries**
   ```sql
   SELECT pid, now() - query_start AS duration, state, query
   FROM pg_stat_activity
   WHERE state != 'idle'
     AND query_start < now() - interval '30 seconds'
     AND datname = current_database()
   ORDER BY duration DESC;
   ```
   Anything > 30s on this DB is abnormal.

3. **Migration drift**
   ```bash
   supabase db push --linked --dry-run
   ```
   Local: `001_initial_schema.sql`, `002_forecast_player_columns.sql` (confirm 2). If MCP:
   ```
   mcp__supabase__list_migrations(project_id: "ryteszuvasrfppgecnwe")
   ```
   Both should be applied. Any pending statements = drift.

4. **Extension audit**
   ```sql
   SELECT extname, extversion FROM pg_extension ORDER BY extname;
   ```
   - Expected: `plpgsql`, `pgcrypto`, `uuid-ossp` (optional), `pg_stat_statements` (needed for Pass 2 — install via Dashboard if missing).
   - Flag anything unexpected.

5. **Storage usage**
   ```sql
   SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
   ```
   Should be well under 100 MB. Flag if nearing plan soft limit.

6. **Table growth projection**
   ```sql
   SELECT 'country_snapshots' AS t, count(*) AS total_rows,
     (max(collected_at) - min(collected_at))::text AS date_span,
     round(count(*)::numeric / GREATEST(EXTRACT(epoch FROM (max(collected_at) - min(collected_at))) / 86400, 1), 1) AS rows_per_day
   FROM country_snapshots
   UNION ALL
   SELECT 'wppr_rankings', count(*),
     (max(collected_at) - min(collected_at))::text,
     round(count(*)::numeric / GREATEST(EXTRACT(epoch FROM (max(collected_at) - min(collected_at))) / 86400, 1), 1)
   FROM wppr_rankings;
   ```
   Project 12-month size. If unreasonable, plan a retention policy (keep monthly samples after 90 days).

7. **Backup verification**
   - Supabase Pro includes 7-day Point-in-Time Recovery (PITR) by default. Confirm in Dashboard → Database → Backups that PITR is on and the most recent backup is < 24h old.
   - For this project, PITR is overkill (all data is re-derivable from the IFPA API via `scripts/backfill.ts`), but the default is free. Just confirm it's on. Document the re-derive-from-scratch fallback.

8. **Pooler gotchas** (document even if not hit today)
   - Statement timeout: Dashboard SQL Editor bypasses it. Move long-running DDL there if it ever hangs.
   - Transaction-mode prepared statements: JS client avoids. Python/asyncpg would need `statement_cache_size=0`.
   - JS client 1000-row cap: already flagged in Pass 4.

9. **Vercel cron health** (not SQL, do it anyway)
   - Vercel Dashboard → project `ifpa-health` → Cron tab → confirm `/api/cron/daily` and `/api/cron/weekly` ran in their last window.
   - Cross-reference `collection_runs` from Pass 4.

**Fix phase — Write:**

- Missing extension: note Dashboard path (extensions UI, not SQL here).
- Migration drift: remediation SQL or `supabase db push --linked`.
- Unbounded growth: propose retention migration, e.g.:
  ```sql
  -- Keep one country_snapshots row per country per month after 90 days
  -- DELETE FROM country_snapshots
  --   WHERE snapshot_date < now() - interval '90 days'
  --     AND EXTRACT(day FROM snapshot_date) != 1;
  ```
- PITR off: `MEDIUM`, link to Dashboard.
- Flag any pooler/JS-client gotcha that will matter within 12 months.

---

## AFTER ALL PASSES: Summary Report

**Output file:** `_db-audit/00-summary.md`

Write a summary containing:

1. **Overall Database Health Score** — /10 per dimension with one-sentence justification:
   - Schema Health:
   - Query Performance:
   - Security & RLS:
   - Data Integrity:
   - Infrastructure:

2. **Critical Findings** — anything :red_circle:. Most likely candidates here:
   - Unauthed admin routes (cross-reference security scan)
   - Stale `collection_runs` (cron silently broken)
   - Duplicate unique-violation rows (should never happen — verify)

3. **Top 5 Fixes by Impact** — ordered by effort-to-impact. At this scale "top 5" may really be "top 2 plus 3 nice-to-haves." Be ruthless.

4. **Consolidated Migration SQL** — every fix from every pass that belongs in a new migration (e.g., `003_schema_cleanup.sql`), separated from any Dashboard-only SQL.

5. **Ongoing Monitoring Recommendations** — lightweight:
   - `/api/health/deep` route returning last 24h of `collection_runs` as JSON
   - Vercel cron health (already in Dashboard)
   - No Sentry / pg_cron dashboards needed unless an incident motivates them

6. **Next Audit** —
   - All green: 6 months, or after next structural schema change.
   - Yellow/red findings: re-audit 4 weeks after fixes land.
   - Always re-audit after migrations that touch `annual_snapshots` generated columns or RLS policies.
