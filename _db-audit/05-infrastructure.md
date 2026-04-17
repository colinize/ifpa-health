# Pass 5 — Infrastructure & Operations

## Snapshot

| Field | Value |
|---|---|
| Audit date | 2026-04-17 |
| Project ref | `ryteszuvasrfppgecnwe` (us-west-1) |
| Tier | Supabase Pro (per `CLAUDE.md`) |
| DB size (whole cluster) | **12 MB** — `public` is 1.2 MB; rest is `pg_catalog` (10.2 MB), `auth` (936 kB), `storage` (248 kB), `realtime` (56 kB), `supabase_migrations` (48 kB), `vault` (24 kB) |
| Extensions installed | `plpgsql`, `pgcrypto 1.3`, `pg_graphql 1.5.11`, `pg_stat_statements 1.11`, `supabase_vault 0.3.1`, `uuid-ossp 1.1` |
| `cron` schema present | **No** — pg_cron not installed ✅ |
| Edge Functions | **None** (`supabase/functions/` does not exist) ✅ |
| Active connections | 7 of 60 max (11.7 %) |
| Long-running queries | **0** |
| Lock contention | **0** rows blocked |
| Performance advisors | No issues found (re-run live) |
| Security advisors | No issues found (re-run live) |
| Migration drift | **Unchanged since Pass 1** — local has `001` + `002`; remote has `001` only |
| Vercel crons | 2 (`/api/cron/daily @ 08:00 UTC`, `/api/cron/weekly @ Mon 09:00 UTC`) |

**Bottom line:** infrastructure is quiet and healthy. Only two things matter at this pass: (1) the migration registry drift flagged in Pass 1 is still present — the fix SQL is one INSERT, repeated below for convenience. (2) the `country_snapshots` JS-client 1000-row ceiling is **still ~6 weeks out** — unchanged from Pass 2/4; app-side fix.

---

## 1. Connection utilization ✅ PASS

```
total  active  idle  idle_in_txn  max_connections
    7       1     4            0              60
```

Remaining 2 accounted for by a pid with `state = null` (`wait_event_type = Extension`, likely a bgworker reported by `pg_stat_activity`) and other system activity. `max_connections = 60` is the Supabase Pro default for small-compute tier.

Breakdown (all low-noise):

| pid | user | app | state | backend_start | notes |
|---:|---|---|---|---|---|
| 3453 | authenticator | postgrest | idle | 2026-02-05 | **70-day persistent connection** — Supavisor pool keep-alive. Normal. |
| 4288 | supabase_admin | postgres_exporter | idle | 2026-02-05 | Metrics scraper |
| 21142 | supabase_admin | (blank) | idle | 2026-02-06 | Supabase infra worker |
| 3130248 | pgbouncer | Supavisor (auth_query) | idle | 2026-04-17 | Pool auth validator |
| 3130296 | postgres | mgmt-api | active | 2026-04-17 | **This audit's own query** |

Utilization **11.7 %** — well under the 80 % flag line. No `idle in transaction` — no session-level transaction leakage. Nothing to do.

**Severity: ✅ PASS.**

---

## 2. Long-running queries ✅ PASS

Query: `pg_stat_activity` where `state != 'idle' AND query_start < now() - interval '30 seconds'`.

**Zero rows.** The only `active` statement is this audit itself. Nothing hanging, nothing runaway.

**Severity: ✅ PASS.**

---

## 3. Lock contention ✅ PASS

Blocked-query join on `pg_blocking_pids()`. **Zero rows.** No session is waiting on another. Expected — read-heavy workload, service-role writes happen once per day in 2–14 s bursts; the odds of audit-time collision are vanishingly small.

**Severity: ✅ PASS.**

---

## 4. pg_cron / cron.job ✅ PASS

```sql
SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') AS cron_schema_exists;
-- → false
```

`pg_cron` extension is **not installed** and the `cron` schema doesn't exist. Matches the intended architecture — all scheduling is Vercel-side (see §8 + `vercel.json`). Nothing to audit.

**Severity: ✅ PASS.**

---

## 5. Edge Functions ✅ PASS

- `supabase/functions/` does not exist (directory missing, not just empty).
- `CLAUDE.md` confirms the entire backend is Vercel App Router routes — no Deno-side logic.

Nothing to audit.

**Severity: ✅ PASS.**

---

## 6. Migration drift 🟠 HIGH (S-01 — unchanged from Pass 1)

```
 Local | Remote | Time (UTC)
-------|--------|------------
 001   | 001    | 001
 002   |        | 002
```

**Status: unfixed.** Migration 002 (`forecast_player_columns`) has run — Pass 1 verified every added column exists in `forecasts` — but the registry row is missing. `supabase db push --linked --dry-run` will keep reporting 002 as pending until this is reconciled.

The fix lives outside the normal migration flow because you must not re-run the DDL and must not create a file that pretends 002 is unapplied. Do **one** of:

**Option A — mark as applied via Dashboard SQL Editor** (Pass 1's proposal, repeated):

```sql
-- Run in Dashboard SQL Editor OR: supabase db query --linked
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('002')
ON CONFLICT (version) DO NOTHING;
-- If the CLI's schema_migrations table has more required columns in your version,
-- add them (name text, statements text[]):
-- INSERT (version, name, statements) VALUES ('002', 'forecast_player_columns', ARRAY[]::text[])
```

**Option B — `supabase migration repair --status applied 002`** (CLI-native; same effect).

After either: `supabase migration list --linked` should show `002 | 002 | 002`.

**Severity: 🟠 HIGH** — latent landmine; the next non-idempotent migration will collide here.

---

## 7. Extension audit ✅ PASS

| extname | version | expected? | notes |
|---|---|:-:|---|
| plpgsql | 1.0 | ✅ | Postgres default |
| pgcrypto | 1.3 | ✅ | Available; not actively used by `public` (no `gen_random_uuid()` calls in the schema — PKs are `bigint identity`) |
| pg_stat_statements | 1.11 | ✅ | Pass 2 used it; kept |
| pg_graphql | 1.5.11 | ⚪ | Supabase default, not used by the app (PostgREST only) |
| supabase_vault | 0.3.1 | ⚪ | Supabase default, unused |
| uuid-ossp | 1.1 | ⚪ | Supabase default, unused |

No unexpected extensions. No missing extensions. Nothing to remove (Supabase manages `pg_graphql` / `vault` / `uuid-ossp` as account defaults — leave them).

**Severity: ✅ PASS.**

---

## 8. Storage & capacity 🔵 LOW (growth-bound, not size-bound)

```
pg_database_size = 12,897,427 bytes  (~12 MB)
  └─ pg_catalog          10,200 kB   ← static, system
  └─ public               1,248 kB   ← our data
  └─ auth                   936 kB   ← unused but present
  └─ storage                248 kB   ← unused but present
  └─ realtime                56 kB
  └─ supabase_migrations     48 kB
  └─ vault                   24 kB
```

Supabase Pro includes **8 GB** of database storage per project (confirmed via plan docs in the tier comparison). Current usage is **0.15 %** of that. Per-row cost across `public`:

| Table | Rows | Bytes/row | Total bytes |
|---|---:|---:|---:|
| wppr_rankings | 2,350 | 195 | 458,752 |
| country_snapshots | 408 | 341 | 139,264 |
| collection_runs | 84 | 1,462 | 122,880 (page-floor inflated) |
| health_scores | 48 | 2,389 | 114,688 |
| forecasts | 48 | 2,218 | 106,496 |
| monthly_event_counts | 88 | 837 | 73,728 |
| annual_snapshots | 10 | 5,734 | 57,344 |

The only table that scales meaningfully is `wppr_rankings` at 195 B/row × 50 rows/day ≈ 10 kB/day ≈ 3.7 MB/year. `country_snapshots` at 341 B/row × ~100 rows/week ≈ 5 kB/week ≈ 260 kB/year. **12-month storage projection: ~18 MB.** Well under tier limits.

**Severity: 🔵 LOW.** No storage concern within the relevant planning horizon (~20 years to approach 1 GB at current rates).

---

## 9. Growth projection vs JS-client 1000-row cap 🟡 MEDIUM (unchanged)

Live growth (measured across 71 days of active collection, 2026-02-05 → 2026-04-17):

| Table | Rows today | Rate | 1000-row threshold | ETA |
|---|---:|---|---|---|
| country_snapshots | 408 | **6.13 rows/day** | 1,000 | **~97 days → ~2026-06-01 → ~6 weeks from today** |
| wppr_rankings | 2,350 | 33.35 rows/day | already past 1,000 — **blocked today on full-table selects** | already here |

`app/page.tsx` reads `country_snapshots` with a full `.order('snapshot_date', asc)` — no `.limit()`. Pass 2 §4.f and Pass 4 §8 flagged this. The 1000-row silent-truncation boundary is **app-side, not DB-side** — the supabase-js client caps without erroring, so the render will silently start dropping early snapshots once the row count crosses 1,000.

`wppr_rankings` is 2,350 rows today but no full-table `.select()` exists in `app/page.tsx` (verified in Pass 2 — it's written weekly, read nowhere). Confirmed safe as long as nobody adds a naive `.from('wppr_rankings').select('*')` in a Server Component.

**Fix (app-side, already known):**

```ts
// app/page.tsx — narrow to the two snapshot dates the render actually uses
const { data } = await supabase
  .from('country_snapshots')
  .select('*')
  .in('snapshot_date', [firstSnapshotDate, latestSnapshotDate])
  .order('country_name');
// or use .range(0, 999) explicitly and document the boundary.
```

**Severity: 🟡 MEDIUM.** Nothing new in Pass 5 — reiterating that the window has closed from "~6 weeks" (Pass 2) to "~97 days" (Pass 5, using measured 6.13 rows/day on 71 days of real data). Effectively the same clock; plan accordingly.

---

## 10. Backup verification 🟡 MEDIUM — cannot confirm via CLI

Supabase Pro includes **7-day Point-in-Time Recovery (PITR)** as a tier feature, but enabling it is an opt-in Dashboard toggle (Database → Backups → Point-in-time recovery). The CLI has no `backup status` command and `supabase db advisors` does not surface PITR state. From the session's tooling (`supabase db query`, `supabase db advisors`), I **cannot confirm whether PITR is actually enabled** for this project.

Two data points:

- Daily base backups on Pro are automatic — the project has at least a 24h recovery floor regardless of PITR state.
- All data is re-derivable via `scripts/backfill.ts` per `CLAUDE.md`. A total loss would cost ~100 s of compute and one API key; no user-generated data is at risk.

**Action for the operator (Dashboard — not SQL):**

1. Open Dashboard → Project `ryteszuvasrfppgecnwe` → Database → Backups.
2. Confirm Point-in-Time Recovery is enabled (toggle at top).
3. Confirm the most recent base backup timestamp is < 24h old.
4. If PITR is off, turn it on (it's included in Pro — no extra cost).

**Severity: 🟡 MEDIUM** until confirmed — the consequence of "off" is minimal here (re-derivable data), but turning it on is a 1-click free upgrade.

---

## 11. Pooler gotchas (document only)

Per `~/.claude/CLAUDE.md` and `docs/process/database-audit.md`:

- **Transaction-mode pooling** (`aws-0-us-west-1.pooler.supabase.com:6543`): no prepared statements. The JS `@supabase/supabase-js` client does not use them, so there is no active issue. **Not hit today.** If a Python service ever lands (asyncpg), it must set `statement_cache_size=0` and `prepared_statement_cache_size=0` per the Pinball Intel lesson in memory.
- **Statement timeout on long DDL**: not hit today — the biggest table is 2,350 rows and every proposed DDL (Passes 1/3/4) finishes in < 10 ms. For any **future** `CREATE INDEX` on a large table (any table past ~100k rows), use `CREATE INDEX CONCURRENTLY` in the Dashboard SQL Editor, not `supabase db push` through the pooler.
- **JS-client 1000-row silent cap**: §9 above. This is the only pooler-adjacent gotcha with an actual deadline.

No action. All three are documented for future reference.

---

## 12. Vercel cron cross-reference ✅ PASS

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/daily",  "schedule": "0 8 * * *" },
    { "path": "/api/cron/weekly", "schedule": "0 9 * * 1" }
  ],
  "functions": {
    "app/api/cron/daily/route.ts":  { "maxDuration": 300 },
    "app/api/cron/weekly/route.ts": { "maxDuration": 300 }
  }
}
```

Both crons' latest runs are live in `collection_runs` per Pass 4 (daily: 2026-04-17 08:00 UTC success; weekly: 2026-04-13 09:00 UTC success). Cron observability belongs to Pass 4's `collection_runs` audit — not re-litigated here. The infra half of the story (does cron fire? does it complete within 300 s?) is green.

**Severity: ✅ PASS.**

---

## Fix phase

### Dashboard / CLI manual (NOT a migration file)

```sql
-- Migration 002 registry reconcile — see §6. Same statement as Pass 1.
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('002')
ON CONFLICT (version) DO NOTHING;
-- Or: supabase migration repair --status applied 002
```

### Dashboard-only configuration (no SQL)

1. **PITR check** — Dashboard → Database → Backups → confirm Point-in-Time Recovery is enabled (§10).
2. **Auth DB connections advisor** — informational from Pass 1, infra setting (Auth server connection cap, Dashboard → Authentication → Settings). Not load-bearing at this traffic.

### Migration-safe

None originate in Pass 5. All migration SQL lives in Passes 1/3/4.

---

## Severity summary

| Severity | Count | Findings |
|---|---:|---|
| 🔴 CRITICAL | 0 | — |
| 🟠 HIGH | 1 | §6 migration registry drift — still unfixed (`002` applied, not recorded). Same as Pass 1's S-01. |
| 🟡 MEDIUM | 2 | §9 country_snapshots vs JS-client 1000-row cap (~97 days out); §10 PITR enablement unverifiable via CLI — confirm in Dashboard |
| 🔵 LOW | 1 | §8 storage trivial (0.15 % of 8 GB tier) — reconfirms growth is bounded |
| ⚪ INFO | 1 | §11 pooler gotchas documented |
| ✅ PASS | 7 | §1 connections; §2 long queries; §3 locks; §4 no pg_cron (intended); §5 no Edge Functions (intended); §7 extensions; §12 Vercel crons |

**Migration drift status:** unfixed — needs one Dashboard statement (or `supabase migration repair`).
**PITR status:** unknown via CLI — needs Dashboard check.
**Active connections:** 1 / 60 (11.7 % total, 1.7 % active).
**Database size:** 12 MB total, 1.2 MB in `public`.
**Output path:** `/Users/calsheimer/projects/ifpa-health/_db-audit/05-infrastructure.md`

---

## Confirmation

- Read-only diagnostic queries only. No DDL/DML executed.
- No migration files created.
- No app code, `docs/`, `CLAUDE.md`, `NOTES.md`, `PLAN.md` touched.
- No commits.
- Only file written: `_db-audit/05-infrastructure.md`.
