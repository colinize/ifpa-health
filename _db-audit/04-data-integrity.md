# Pass 4 — Data Integrity

## Snapshot

| Field | Value |
|---|---|
| Audit date | 2026-04-17 |
| Runs total | 84 (71 daily + 12 weekly + 1 backfill) |
| Runs in last 7 days | 8 — 7 daily / 1 weekly — **all `success`** |
| Orphaned `running` rows (>1 h) | 0 ✅ |
| Latest `daily` success | 2026-04-17 08:00 UTC ✅ on schedule |
| Latest `weekly` success | 2026-04-13 09:00 UTC ✅ on schedule |
| Errors in last 14 days | 0 ✅ |
| Historical error burst | 28 runs between 2026-02-06 → 2026-03-06 (401 Unauthorized; resolved) |
| Duplicate rows on unique keys | 0 ✅ |
| Generated column drift | 0 ✅ |
| `methodology_versions` integrity | ❌ 47 of 48 `health_scores` reference `version_number=2`, which doesn't exist |
| `annual_snapshots` freshness | ❌ `collected_at` frozen at 2026-02-05 (backfill) — weekly cron claims success |

**Bottom line:** pipeline is green — no errors in 42 days, no orphans. But the *data* has two silent structural problems: (1) every public-dashboard `health_scores` row points to a `methodology_version` that doesn't exist; (2) `annual_snapshots` has been effectively read-only since the 2026-02-05 backfill — the weekly cron reports success but hasn't advanced a single row's `collected_at`. Dashboard currently reads correctly only because the backfilled 2017-2025 rows are complete.

---

## 1. `collection_runs` sync health 🟢

- **7-day window:** 7 daily + 1 weekly, all `success`. No `error`, no `partial`, no `running`.
- **Orphans:** zero rows with `status='running'` older than any threshold.
- **Schedule adherence:** daily 08:00 UTC hits within 1 s; weekly Mon 09:00 UTC same.
- **Durations:** daily mean 2.6 s (min 467 ms, max 4.6 s); weekly mean 13.6 s (min 497 ms, max 21.4 s); backfill 99.8 s one-shot. All well under the `vercel.json` 300 s maxDuration. Weekly `min=497ms` outlier is row 23 (2026-02-23) dying fast on a 401 before any writes.

### 1a. Historical error burst ⚪ INFO

28 of 84 runs have `status='error'`, **all** between 2026-02-06 and 2026-03-06. Error patterns (no secret leakage — redaction audit clean):

| Pattern | Count |
|---|---:|
| `IFPA API error: 401 Unauthorized for /stats/overall` | 25 daily |
| `IFPA API error: 401 Unauthorized for /stats/players_by_year` | 2 weekly |
| `IFPA API error: 401 Unauthorized for /stats/events_by_year` | 1 weekly |
| `IFPA API error: 500 Internal Server Error for /stats/overall` | 1 daily (2026-03-06) |

Root cause (inferred): `IFPA_API_KEY` was invalid/expired from 2026-02-06 until ~2026-03-07, then rotated or redeployed. Since then 47 consecutive clean runs. **No action** — historical, self-healed. Consequence: gap in daily-snapshot tables (wppr_rankings, overall_stats, health_scores, forecasts) for those 28 days. Backfillable via `scripts/backfill.ts` if wanted.

---

## 2. Per-table freshness 🟠 HIGH (F-01)

| Table | Max collected_at (or created_at) | Rows | Age | Expected | Verdict |
|---|---|---:|---|---|---|
| `collection_runs` | 2026-04-17 08:00 | 84 | 0 h | per run | ✅ |
| `health_scores` | 2026-04-17 08:00 | 48 | 0 h | daily | ✅ |
| `forecasts` | 2026-04-17 08:00 | 48 | 0 h | daily | ✅ |
| `overall_stats_snapshots` | 2026-04-17 08:00 | 47 | 0 h | daily | ✅ |
| `wppr_rankings` | 2026-04-17 08:00 | 2,350 | 0 h | daily | ✅ |
| `country_snapshots` | 2026-04-13 09:01 | 408 | 4 d | weekly | ✅ |
| `monthly_event_counts` | 2026-04-06 09:01 | 88 | **11 d** | weekly | 🟡 §2a |
| `annual_snapshots` | **2026-02-05 20:34** | 10 | **71 d** | weekly | 🟠 **F-01** |
| `observations` | 2026-02-05 | 10 | — | admin only | ⚪ expected |
| `methodology_versions` | 2026-02-05 | 1 | — | admin only | ⚪ expected |
| `shadow_scores` | 2026-02-05 | 1 | — | calibration only | ⚪ expected |

### 2a. 🟡 `monthly_event_counts`

Weekly run 81 (2026-04-13) logged `monthly.months_collected=16`, but the table's max `collected_at` is 2026-04-06. Values *did* move (Apr month=4 went 1294→1401 between 2026-03-01 and 2026-04-06), so inserts-on-change work, but the upsert's `collected_at = now()` clause isn't firing on rows with unchanged `event_count`. Same class of bug as F-01 but lower-impact since data eventually updates.

### 2b. 🟠 F-01 — `annual_snapshots.collected_at` frozen

**All 10 rows** stamp `collected_at = 2026-02-05 20:34:58` — exact backfill time. Weekly cron has run 12 times since, and its `details.annual.years_processed = 10` claims a full sweep each week, yet zero rows have advanced. `records_affected=67` per weekly run is dominated by country inserts.

The upsert in `lib/collectors/annual-collector.ts` is either (a) running `ON CONFLICT DO UPDATE SET ...` without `collected_at = now()`, or (b) hitting a `WHERE current IS DISTINCT FROM new` guard. Either way — **the 2025 row never received late IFPA revisions, and the 2026 row is a placeholder with `unique_players=0, returning_players=NULL, new_players=NULL`** (see §3).

Not DB-fixable. Fix is in `lib/collectors/annual-collector.ts` — either drop the no-op guard or explicitly set `collected_at = now()` in the SET list. Verify by checking `max(collected_at) FROM annual_snapshots` the Monday after the fix ships.

**Why it wasn't noticed:** freshness badge reads `collection_runs.completed_at`, not per-table. The `details` JSON is inaccurate. **Severity: 🟠.**

---

## 3. Current-year (2026) coverage 🟡 F-02

**`annual_snapshots` 2026 row** exists with `tournaments=818, player_entries=19629` from backfill, but:

| Field | Value |
|---|---|
| unique_players | **0** |
| returning_players | NULL |
| new_players | NULL |
| retention_rate | NULL (guard fires on `unique_players=0`) |

Dashboard's `year < currentYear` filter skips this row for YoY math — so metric cards render fine. The detail-drawer year table and any future unconditional render will show `—` for 2026.

**`monthly_event_counts` 2026:** 4 of 4 months present (Jan 1078, Feb 1101, Mar 1294, Apr 1401), monotonically increasing, April in-progress. ✅ No gaps. 2019–2025 are 12-of-12 each. 2017/2018 intentionally absent (backfill scope).

---

## 4. NULL audit 🟡 N-01

| Column | NULLs / total | Verdict |
|---|---|---|
| `annual_snapshots.countries` | **10 / 10** | 🟡 **N-01** — 100% NULL. Column declared, no collector writes it. |
| `annual_snapshots.returning_players / new_players / retention_rate` | 1 / 10 | ⚪ 2026 placeholder row (§3) |
| `forecasts.projected_unique_players / projected_returning_players` | 1 / 48 | ⚪ pre-migration-002 row, expected |
| `forecasts.months_of_data / projected_tournaments` | 0 / 48 | ✅ |
| `health_scores.composite_score / methodology_version` | 0 / 48 | ✅ |
| `country_snapshots.country_code / pct_of_total` | 0 / 408 | ✅ |
| `wppr_rankings.first_name / last_name / ratings_value / country_code / country_name` | 0 / 2350 each | ✅ |
| `observations.period_start / period_end` | 0 / 10 | ✅ |

N-01 fix: either `DROP COLUMN countries` or populate from `country_snapshots` (`count(distinct country_code)` per year). Pick on grooming, not urgent.

---

## 5. CHECK constraint gaps 🟡

Live values vs proposed enums. All 0 rows violate, so `ADD CONSTRAINT NOT VALID` + `VALIDATE` is instant.

| Table.column | Live values | Proposed CHECK |
|---|---|---|
| `collection_runs.run_type` | daily(71), weekly(12), backfill(1) | `('daily','weekly','backfill')` |
| `collection_runs.status` | success(56), error(28) | `('running','success','error','partial')` |
| `forecasts.method` | seasonal_ratio(48) | `('seasonal_ratio')` |
| `health_scores.composite_score` | range 66.5–83.5 | `BETWEEN 0 AND 100` |
| `forecasts.months_of_data` | range 1–12 | `BETWEEN 1 AND 12` |
| `observations.period_start ≤ period_end` | 0 violations | `period_start <= period_end` |

`health_scores.band` already constrained. Live: `thriving`(47), `healthy`(1) — both in existing enum.

---

## 6. Orphaned `methodology_version` references 🟠 R-01

```
methodology_versions:  version_number=1 (only row, is_active=true)
health_scores:         version=1 → 1 row
                       version=2 → 47 rows  ← NO MATCHING PARENT
```

**47 of 48 `health_scores` rows reference `methodology_version=2`, which does not exist in `methodology_versions`.** The V2 scorer (per `CLAUDE.md` Feb 2026 redesign) ships version 2 in every daily write; the accompanying `INSERT INTO methodology_versions` was never done. Same class of ship-drift as Pass 1's S-01 (migration 002 applied out-of-band).

Consequences: audit trail broken (weights/breakpoints for v2 are only in code, not DB); `/api/admin/calibrate` joins to this table; future `shadow_scores` for v2 will orphan on insert. Fix is a single `INSERT` (see §9). Not destructive — additive.

**Other consistency checks ✅:**

- `shadow_scores → methodology_versions` orphans: 0 (lone row is version=1)
- `observations.period_start > period_end`: 0
- `forecasts.months_of_data` outside 1–12: 0
- `wppr_rankings` rank continuity: every snapshot_date has exactly 50 rows with rank 1–50, no dupes, no gaps (note: it's top-**50** per day, not top-250 as Pass 1 estimated)

---

## 7. Duplicate detection ✅

`count(*)` = `count(DISTINCT <unique key>)` on every table:

| Table | Key | Rows = Distinct |
|---|---|---:|
| annual_snapshots | (year) | 10 |
| monthly_event_counts | (year,month) | 88 |
| country_snapshots | (snapshot_date,country_name) | 408 |
| overall_stats_snapshots | (snapshot_date) | 47 |
| health_scores | (score_date) | 48 |
| forecasts | (forecast_date,target_year) | 48 |
| wppr_rankings | (snapshot_date,player_id) | 2,350 |

All unique constraints intact.

---

## 8. Generated columns + country_snapshots growth

**Generated columns (Pass 1 §8 re-verified on 3-row sample):** `avg_attendance` and `retention_rate` match hand-computed values for 2024, 2025, 2026 (NULL guard works on 2026's `unique_players=0`). No drift.

**`country_snapshots` growth ⚪:** 408 rows / 8 distinct snapshot_dates / ~51 rows each. ~204 rows/month. Crosses the JS-client 1000-row `.select()` cap in ~6 weeks. Pass 2 §4.f already flagged — fix is app-side (`.range()` pagination or narrow filter on `app/page.tsx`'s `country_snapshots` fetch). Not DB.

---

## 9. Fix phase SQL (do not apply)

### Migration-safe (proposed `005_data_integrity.sql` — do not create the file)

```sql
-- 005_data_integrity.sql
-- Pass 4 fixes. Combine with Pass 1's 003_schema_cleanup.sql if bundling.

-- R-01: insert missing methodology_versions row for v2
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

-- CHECK constraints. Use DO-blocks to make safe-to-re-run even if 003 already landed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_runs_run_type_check') THEN
    ALTER TABLE public.collection_runs
      ADD CONSTRAINT collection_runs_run_type_check
      CHECK (run_type IN ('daily','weekly','backfill')) NOT VALID;
    ALTER TABLE public.collection_runs VALIDATE CONSTRAINT collection_runs_run_type_check;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forecasts_method_check') THEN
    ALTER TABLE public.forecasts
      ADD CONSTRAINT forecasts_method_check
      CHECK (method IN ('seasonal_ratio')) NOT VALID;
    ALTER TABLE public.forecasts VALIDATE CONSTRAINT forecasts_method_check;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_scores_composite_score_check') THEN
    ALTER TABLE public.health_scores
      ADD CONSTRAINT health_scores_composite_score_check
      CHECK (composite_score BETWEEN 0 AND 100) NOT VALID;
    ALTER TABLE public.health_scores VALIDATE CONSTRAINT health_scores_composite_score_check;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forecasts_months_of_data_check') THEN
    ALTER TABLE public.forecasts
      ADD CONSTRAINT forecasts_months_of_data_check
      CHECK (months_of_data BETWEEN 1 AND 12) NOT VALID;
    ALTER TABLE public.forecasts VALIDATE CONSTRAINT forecasts_months_of_data_check;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observations_period_order_check') THEN
    ALTER TABLE public.observations
      ADD CONSTRAINT observations_period_order_check
      CHECK (period_start <= period_end) NOT VALID;
    ALTER TABLE public.observations VALIDATE CONSTRAINT observations_period_order_check;
  END IF;
END $$;
```

### Not SQL — app-side fixes

- **F-01 (annual-collector):** fix the upsert in `lib/collectors/annual-collector.ts` to actually touch rows (explicit `collected_at = now()` in SET list, or drop the no-op guard).
- **§2a (monthly-collector):** same class of fix in `lib/collectors/monthly-collector.ts`.
- **§8 (country_snapshots fetch):** narrow or paginate the `app/page.tsx` select before ~2026-05-30 (1,000-row cap).

### N-01 — no SQL

Decide between `DROP COLUMN countries` vs populate-from-`country_snapshots`. Hygiene call; not urgent.

### Orphan cleanup — no DELETE

R-01's "orphan" rows are live dashboard data. Fix is insert-parent, not delete-children.

---

## 10. Severity summary

| Severity | Count | Findings |
|---|---:|---|
| 🔴 CRITICAL | 0 | — |
| 🟠 HIGH | 2 | **F-01** `annual_snapshots.collected_at` frozen since 2026-02-05 (silent weekly sync failure); **R-01** 47 of 48 `health_scores` reference non-existent `methodology_version=2` |
| 🟡 MEDIUM | 4 | §2a `monthly_event_counts` same class of freshness bug; §3 F-02 2026 `annual_snapshots` row is a placeholder (NULL player fields); §4 N-01 `annual_snapshots.countries` 100% NULL dead column; §5 missing CHECK constraints (5 candidates, all 0-violation) |
| 🔵 LOW | 0 | — |
| ⚪ INFO | 3 | §1a historical error burst (28 rows, self-healed 42 days ago); §8 `country_snapshots` JS-client cap ~6 weeks away (Pass 2 knows); §6 `wppr_rankings` is top-50 per day (not top-250 as Pass 1 guessed) |
| ✅ PASS | 4 | §1 orphans; §7 dupes; §8 generated columns; §6 consistency (period order / months range / rank continuity) |

**Is the pipeline healthy right now?** Cron-wise yes; data-wise partially. Daily tables refresh correctly; `annual_snapshots` silently hasn't updated in 71 days. No errors in 42 days, 0 orphaned `running` rows.

**Dashboard impact today:** metric cards and gauge render correctly (current-year filter saves us); detail-drawer year table shows `—` for 2026; any IFPA back-revisions to 2017–2025 annual data since Feb 5 are missing.

**Top 3 fixes by impact:**
1. Fix annual-collector upsert (F-01, app change, highest leverage).
2. Insert missing `methodology_versions` row for v2 (R-01, one SQL statement).
3. Add 5 CHECK constraints (§5) — defensive, cheap, safe.

**Migration-safe SQL written (not applied):** 1 INSERT + 1 UPDATE + 5 CHECK constraint blocks. Pass 1's 003 proposals unchanged.
**Dashboard-only SQL:** 0.
**App-side fixes:** F-01, §2a, §8.

---

## Output

- File: `/Users/calsheimer/projects/ifpa-health/_db-audit/04-data-integrity.md`

## Confirmation

- Read-only diagnostic queries only. No `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`ALTER`/`DROP`/`CREATE`/`GRANT`/`REVOKE` executed.
- No migration files created. No app code, `docs/`, `CLAUDE.md`, `NOTES.md`, `PLAN.md` touched. No commits.
- `error_message` values inspected; all contain only HTTP status + endpoint path. No `api_key`, bearer token, or `IFPA_API_KEY` value leaked into logs. Safe to quote verbatim.
- Only file written: `_db-audit/04-data-integrity.md`.
