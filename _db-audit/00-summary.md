# Database Audit — Summary (ifpa-health)

**Audit date:** 2026-04-17
**Project ref:** `ryteszuvasrfppgecnwe` (us-west-1)
**Scope:** `public` schema, 11 tables, 3,182 rows, 12 MB cluster total
**Pass files:** `_db-audit/01-schema-health.md` · `02-query-performance.md` · `03-security-rls.md` · `04-data-integrity.md` · `05-infrastructure.md`

## TL;DR

The database is healthy and quiet — 99.9 %+ cache hit ratios, zero errors in 42 days, sub-millisecond page queries. The meaningful findings are all structural / operational drift: migration 002 ran out-of-band, `anon` retains `TRUNCATE` grants (defense-in-depth gap), the annual-collector upsert has silently frozen `collected_at` for 71 days, and 47 of 48 `health_scores` point at a `methodology_version=2` row that was never inserted. None of it is user-visible today; all of it is cheap to fix.

---

## 1. Overall Database Health Score

| Dimension | Score | Justification |
|---|:-:|---|
| Schema Health | **7 / 10** | Conventions clean (identity PKs, `timestamptz`, generated columns verified), but migration 002 applied without a registry row (S-01), 6 indexes shadowed by unique constraints, and 3 CHECK gaps. |
| Query Performance | **9 / 10** | Every page query sub-0.3 ms, 99.97 % heap / 99.96 % index cache hit, no custom functions. Only nit is the `country_snapshots` over-fetch pattern which is app-side, not DB. |
| Security & RLS | **7 / 10** | RLS on all 11 tables with textbook read/write shape, zero SECURITY DEFINER, no secrets in schema — but `anon` + `authenticated` still hold the default `TRUNCATE / REFERENCES / TRIGGER` grants on every table (R-01). |
| Data Integrity | **6 / 10** | Cron pipeline green, zero orphans, zero duplicates, generated columns accurate — but F-01 (`annual_snapshots.collected_at` frozen since 2026-02-05) and R-01 (47 orphaned `methodology_version=2` refs) are both real silent-failure bugs. |
| Infrastructure | **9 / 10** | 12 MB total, 11.7 % connection utilization, zero long queries, zero locks, no pg_cron, no Edge Functions. Migration drift unresolved and PITR state unverifiable via CLI. |

**Overall: 7.6 / 10.** A tiny, read-only dashboard in very good shape with a short list of legit housekeeping items.

---

## 2. Critical Findings

No 🔴 CRITICAL findings. The 🟠 HIGH list (4 total, across passes 1/3/4/5):

| ID | Pass | Title |
|---|---|---|
| **S-01** | 1 & 5 | Migration `002_forecast_player_columns` applied to the database but never registered in `supabase_migrations.schema_migrations`. Future `supabase db push --linked` will keep reporting it as pending; a non-idempotent migration will collide here. |
| **R-01 (grants)** | 3 | `anon` and `authenticated` hold default `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` grants on all 11 public tables. RLS blocks the row-level DML, but `TRUNCATE` is table-level and bypasses RLS — a single misrouted pooler/Edge Function path would allow a one-shot data wipe. |
| **F-01** | 4 | `annual_snapshots.collected_at` has been stuck at 2026-02-05 for 71 days despite 12 successful weekly runs reporting `years_processed=10`. The upsert in `lib/collectors/annual-collector.ts` isn't touching unchanged rows, so late IFPA revisions to 2017–2025 never land. App-side fix. |
| **R-01 (methodology)** | 4 | 47 of 48 `health_scores` rows reference `methodology_version=2`, which is absent from `methodology_versions` (only `version_number=1` exists). Same class of ship-drift as S-01: the V2 scorer went live without the accompanying INSERT. |

---

## 3. Top 5 Fixes by Impact

| # | Fix | Why | Effort | Where | Risk if skipped |
|:-:|---|---|:-:|---|---|
| 1 | **Insert the missing `methodology_versions` row for v2 and flip v1 inactive** | Restores the calibration audit trail for every `health_scores` row written since Feb; `/api/admin/calibrate` join starts working; shadow_scores v2 inserts stop orphaning. | **S** | One INSERT + one UPDATE — see Pass 4 §9 / consolidated SQL below. | Audit trail remains broken; v2 weights/breakpoints live only in code (`lib/health-score.ts`). |
| 2 | **Reconcile `supabase_migrations.schema_migrations` for migration 002** | Restores parity between local migrations dir and remote registry; next `supabase db push` stops lying; protects against a future non-idempotent migration colliding. | **S** | Dashboard SQL Editor OR `supabase db query --linked` — one INSERT. Or `supabase migration repair --status applied 002`. | A latent landmine: the next non-idempotent migration will fail mid-flight. |
| 3 | **Revoke redundant DML + destructive grants on `anon` and `authenticated`** | Closes the `TRUNCATE` bypass, hardens defense-in-depth (RLS + grant gate), and is fully reversible. Eleven REVOKEs, short locks, no behavior change to the dashboard since `SELECT` is preserved. | **S** | Proposed `004_harden_grants.sql` — see Pass 3 §9. | Any future edge function / misconfigured pooler path could issue `TRUNCATE TABLE public.*` with the publicly-shipped anon key. |
| 4 | **Fix the annual-collector upsert to actually touch `collected_at`** | Weekly sync of 2017–2025 annual data resumes; 2026 placeholder row gets player fields; freshness telemetry starts telling the truth. App-change only — no SQL. | **M** | `lib/collectors/annual-collector.ts` — either explicit `collected_at = now()` in the SET list, or drop the no-op `WHERE current IS DISTINCT FROM new` guard. Same-class fix in `monthly-collector.ts` (§2a). | Late IFPA revisions silently never land; detail-drawer 2026 row stays `—`; operator trust in "weekly cron success" badge is wrong. |
| 5 | **Drop 6 shadowed indexes + 1 unused composite; add 5 CHECK constraints** | One-shot schema tidy-up: removes ~112 kB of doubly-written index state, encodes `run_type`/`method`/score range invariants the app already obeys. All live data is 0-violation so `VALIDATE` is instant. | **S** | Proposed `003_schema_cleanup.sql` + `005_data_integrity.sql` — see consolidated SQL below. | Insert tax on 6 shadow indexes (immaterial); missing CHECKs allow a future typo to silently write bad `run_type` or `method` values. |

---

## 4. Consolidated Fix SQL

> **Not applied.** Do not run these blindly. Review each pass file for context before applying.

### A. Migration-safe (package as `003_schema_cleanup.sql` + `004_harden_grants.sql` + `005_data_integrity.sql`, or bundle)

```sql
-- ============================================================
-- 003_schema_cleanup.sql — Pass 1 (§4, §5, §7)
-- ============================================================

-- §5: redundant single-column indexes shadowed by unique constraints
DROP INDEX IF EXISTS public.idx_annual_snapshots_year;
DROP INDEX IF EXISTS public.idx_monthly_event_counts_year_month;
DROP INDEX IF EXISTS public.idx_overall_stats_snapshot_date;
DROP INDEX IF EXISTS public.idx_health_scores_score_date;
DROP INDEX IF EXISTS public.idx_forecasts_forecast_date;
DROP INDEX IF EXISTS public.idx_shadow_scores_score_date;

-- §4: unused composite index on collection_runs (freshness query ignores it)
DROP INDEX IF EXISTS public.idx_collection_runs_type_started;

-- §7: CHECK on collection_runs.run_type — live values: daily, weekly, backfill
ALTER TABLE public.collection_runs
  ADD CONSTRAINT collection_runs_run_type_check
  CHECK (run_type IN ('daily', 'weekly', 'backfill')) NOT VALID;
ALTER TABLE public.collection_runs
  VALIDATE CONSTRAINT collection_runs_run_type_check;

-- §7: CHECK on forecasts.method
ALTER TABLE public.forecasts
  ADD CONSTRAINT forecasts_method_check
  CHECK (method IN ('seasonal_ratio')) NOT VALID;
ALTER TABLE public.forecasts
  VALIDATE CONSTRAINT forecasts_method_check;

-- §7: range CHECK on health_scores.composite_score (mirror observations.observed_score)
ALTER TABLE public.health_scores
  ADD CONSTRAINT health_scores_composite_score_check
  CHECK (composite_score BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE public.health_scores
  VALIDATE CONSTRAINT health_scores_composite_score_check;

-- ============================================================
-- 004_harden_grants.sql — Pass 3 §9 (R-01)
-- Eleven tables × 1 REVOKE each. SELECT remains granted to anon.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.annual_snapshots        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.collection_runs         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.country_snapshots       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.forecasts               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.health_scores           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.methodology_versions    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.monthly_event_counts    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.observations            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.overall_stats_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.shadow_scores           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.wppr_rankings           FROM anon, authenticated;

-- ============================================================
-- 005_data_integrity.sql — Pass 4 §9
-- ============================================================

-- R-01: insert missing methodology_versions row for v2 + deactivate v1
INSERT INTO public.methodology_versions (version_number, description, weights, breakpoints, is_active)
VALUES (
  2,
  'V2 scorer (Feb 2026 redesign): 3 equally-weighted pillars (players, retention, tournaments). Source of truth: lib/health-score.ts.',
  '{"players":0.3333,"retention":0.3333,"tournaments":0.3333}'::jsonb,
  '{"players":[-10,0,15],"tournaments":[-10,0,15],"retention":[25,35,50]}'::jsonb,
  true
)
ON CONFLICT (version_number) DO NOTHING;
UPDATE public.methodology_versions SET is_active = false WHERE version_number = 1;

-- Additional CHECKs (forecasts.months_of_data range, observations period order)
ALTER TABLE public.forecasts
  ADD CONSTRAINT forecasts_months_of_data_check
  CHECK (months_of_data BETWEEN 1 AND 12) NOT VALID;
ALTER TABLE public.forecasts
  VALIDATE CONSTRAINT forecasts_months_of_data_check;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_period_order_check
  CHECK (period_start <= period_end) NOT VALID;
ALTER TABLE public.observations
  VALIDATE CONSTRAINT observations_period_order_check;
```

### B. Dashboard-only / CLI-manual (NOT in a migration file)

```sql
-- S-01: Reconcile migration 002 registry. Run in Dashboard SQL Editor
-- OR: supabase db query --linked
-- OR (equivalent): supabase migration repair --status applied 002
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('002')
ON CONFLICT (version) DO NOTHING;
```

**Dashboard config (no SQL):** Database → Backups → confirm Point-in-Time Recovery is enabled (Pass 5 §10 — free on Pro, state unverifiable via CLI).

**App-side fixes (no SQL):** F-01 in `lib/collectors/annual-collector.ts`; same-class fix in `lib/collectors/monthly-collector.ts` (§2a); `country_snapshots` over-fetch in `app/page.tsx` before the ~97-day JS-client 1000-row cap window closes.

---

## 5. Ongoing Monitoring Recommendations

- **`/api/health/deep` route** returning the last 24 h of `collection_runs` as JSON — flag if latest `daily` is > 36 h old, latest `weekly` is > 10 d old, or any `running` row is > 1 h old. This would have caught F-01 if it also surfaced per-table `max(collected_at)`.
- **Weekly `country_snapshots` row-count check vs the 1000-row cap.** At current rate (~6.13 rows/day measured over 71 days) the threshold hits ~2026-06-01. Either ship the app-side narrow/paginate before then or add a monitor that pages when `count(*) > 900`.
- **Re-run Supabase advisors as part of deployment:** `supabase db advisors --linked --type performance --type security --level info` — takes seconds, has caught drift cleanly in all three passes.
- **Vercel cron dashboard** — already free, just glance at it when touching collectors. `collection_runs` is the source of truth; the Vercel UI is the "did the HTTP fire?" half.

No Sentry, pg_cron dashboards, or custom observability are warranted at this traffic level. Add only after an incident motivates it.

---

## 6. Next Audit Timing

**Every 3 months**, OR after any schema change that touches more than one table (whichever comes first).

Specific triggers that should force an earlier re-audit:
- Any migration that alters `annual_snapshots` generated columns or adds/changes RLS policies — re-audit same day.
- Any new table introduced to `public` — re-run Pass 3 §8 (the `USING (true)` copy-paste risk) and Pass 1 §5 (implicit-unique-index awareness).
- If this audit's 🟠 HIGH findings aren't resolved in 4 weeks, re-audit then to re-score.

At the current footprint (12 MB cluster, 3,182 rows, +~4 MB/year), quarterly is plenty. If `wppr_rankings` snapshot frequency changes or a new high-volume table lands, tighten to monthly for one cycle.
