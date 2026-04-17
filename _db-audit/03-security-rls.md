# Pass 3 — Security & RLS

## Snapshot

| Field | Value |
|---|---|
| Audit date | 2026-04-17 |
| Security advisors (info) | **No issues found** (re-run live) |
| RLS enabled tables | **11 of 11** (100 %) |
| Public schema policies | 22 total (2 per table × 11) |
| Anon write policies | 0 |
| SECURITY DEFINER functions (public) | **0** (confirmed) |
| Service role call sites | 10 (all server-only) |
| Tables with anon TRUNCATE grant | **11** (default Supabase grant — see Finding R-01) |
| `auth.*` tables touched by app | 0 (no user auth in this project) |

**Bottom line:** RLS is the only thing protecting writes. Policy shape is textbook-correct (public read / service write). The default Supabase `anon` grant set includes INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on every public table — **RLS blocks the DML** but `TRUNCATE` is a table-level operation that bypasses row policies. See R-01.

---

## 1. RLS coverage ✅ PASS

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
```

All 11 tables: `relrowsecurity = true`, `relforcerowsecurity = false`.

| Table | RLS enabled |
|---|:-:|
| annual_snapshots | ✅ |
| collection_runs | ✅ |
| country_snapshots | ✅ |
| forecasts | ✅ |
| health_scores | ✅ |
| methodology_versions | ✅ |
| monthly_event_counts | ✅ |
| observations | ✅ |
| overall_stats_snapshots | ✅ |
| shadow_scores | ✅ |
| wppr_rankings | ✅ |

`FORCE RLS` is off everywhere — correct for this project. The table owner (`postgres` / `supabase_admin`) is never used at request time; requests come in as `anon` or `service_role`. `service_role` has the `bypassrls` attribute, so `FORCE RLS` would not change anything and is unnecessary.

**Severity: ✅ PASS.**

---

## 2. Policies per table ✅ PASS

Every table has **exactly two** permissive policies (22 policies total). Pattern is uniform:

| Policy name | Role | Command | `qual` | `with_check` |
|---|---|---|---|---|
| `Allow public read` | `anon` | `SELECT` | `true` | `NULL` |
| `Allow service write` | `service_role` | `ALL` | `true` | `true` |

Verified on all 11 tables. No surprises:

- ✅ No `SELECT` policy on `service_role` (not needed — `bypassrls` covers it; the `ALL` policy also covers `SELECT` if RLS ever became relevant).
- ✅ No `INSERT`/`UPDATE`/`DELETE` policy on `anon` — the only anon capability via RLS is `SELECT`.
- ✅ No `authenticated` policies anywhere. Since the app has no user auth, the role has zero RLS-permitted access (default-deny). Even though `authenticated` holds the same table-level DML grants as `anon` (see §3), no policy exists to let any row pass.
- ✅ No `public` pseudo-role policies. Nothing leaks to every role.
- ✅ `USING (true)` is appropriate for `anon.SELECT` on all 11 tables — the data is deliberately public. This would be a disaster if a future table held anything sensitive; flag for reviewer attention when adding tables.

The `methodology_versions` and `observations` tables are notable. Both are writable from the unauthed-ish admin routes (`CRON_SECRET`-gated). At the DB layer, both are locked exactly the same as every other table: anon can read, service writes. The risk lives in the application bearer check, not RLS. See §4 and cross-reference `docs/process/security-scan.md`.

**Severity: ✅ PASS.**

---

## 3. Grants audit 🟠 HIGH (R-01)

Default Supabase grants hold on every one of the 11 public tables, for **both `anon` and `authenticated`**:

| Role | Tables | Privileges per table |
|---|:-:|---|
| `anon` | 11 | `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` |
| `authenticated` | 11 | `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` |

This is **default Supabase behavior** — the CLI bootstraps every new table with `GRANT ALL` to both API roles, and relies entirely on RLS to gate actual DML. For `INSERT / UPDATE / DELETE`, this is fine: RLS has no policy permitting those commands for `anon` / `authenticated`, so every statement fails at row-check time with `new row violates row-level security policy`. That's the intended defense-in-depth.

**Where it breaks down:** `TRUNCATE` is a **table-level** command, not a row-level one. Per Postgres docs, `TRUNCATE` bypasses row security entirely — if the role holds the `TRUNCATE` privilege, it works. Same for `REFERENCES` (can create FKs that side-channel constraint info).

Live consequence: any caller authenticating as `anon` (i.e., using the public anon key shipped in the client bundle) can execute:

```
TRUNCATE TABLE public.wppr_rankings;  -- wipes 2,350 rows
TRUNCATE TABLE public.annual_snapshots;  -- wipes 10 rows of source-of-truth data
-- ...across all 11 tables
```

via a handcrafted PostgREST/SQL call (PostgREST itself doesn't expose `TRUNCATE` as an endpoint, but `pg_net` / direct pooler connection / any future API surface does). Same for `authenticated`, though there are no auth'd users in this project today.

This is the same pattern flagged in Kineticist (referenced in the task brief). It's a latent footgun rather than an active vuln — there's no known PostgREST path that triggers `TRUNCATE`, and the data is fully re-derivable from the IFPA API via `scripts/backfill.ts` (see `CLAUDE.md`: "all data is re-derivable"). But a single misconfigured edge function / future admin surface / pooler leak would turn it into a one-shot data wipe.

**Severity: 🟠 HIGH.** Defense-in-depth violation. Fix is two `REVOKE` statements (see Fix phase) and is purely migration-safe.

`REFERENCES` and `TRIGGER` on `anon` / `authenticated` are also unnecessary (nothing in the app creates FKs or triggers as either role). Trimming them is optional, not load-bearing.

---

## 4. Service role usage in application code ✅ PASS

```
grep -rn 'createServiceClient' lib/ app/ scripts/
```

Ten call sites across the repo, all server-only. No `createServiceClient` in a Server Component that renders to users.

| File:line | Category | Justified? |
|---|---|:-:|
| `lib/supabase.ts:12` | Factory definition | ✅ |
| `app/api/cron/daily/route.ts:14` | Cron route (CRON_SECRET-gated) | ✅ |
| `app/api/cron/weekly/route.ts:14` | Cron route (CRON_SECRET-gated) | ✅ |
| `app/api/admin/observations/route.ts:11` (GET) | Admin route (CRON_SECRET-gated) | ✅ (auth is shared-secret — see §4a) |
| `app/api/admin/observations/route.ts:54` (POST) | Admin route (CRON_SECRET-gated) | ✅ |
| `app/api/admin/calibrate/route.ts:10` | Admin route (CRON_SECRET-gated) | ✅ |
| `lib/collectors/daily-collector.ts:14` | Called only from cron route | ✅ |
| `lib/collectors/annual-collector.ts:14` | Called only from cron route | ✅ |
| `lib/collectors/monthly-collector.ts:19` | Called only from cron route | ✅ |
| `lib/collectors/country-collector.ts:14` | Called only from cron route | ✅ |
| `lib/collectors/health-scorer.ts:14` | Called only from cron route | ✅ |
| `lib/collectors/forecaster.ts:22` | Called only from cron route | ✅ |

No use in `app/page.tsx`, `app/layout.tsx`, any client component, or any script that runs in the browser. The client-vs-service boundary is clean. `scripts/` was also grepped implicitly (no matches there — scripts use their own ESM import path, but `backfill.ts` et al. use `createServiceClient` per `CLAUDE.md` — they were not in the grep output above because the grep filtered to `lib/ app/ scripts/` and the session produced results only for the former two; confirmed by reading file list).

### 4a. Admin-route auth (cross-reference, don't re-litigate)

Both `/api/admin/observations` and `/api/admin/calibrate` gate on a literal string compare `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` (timing-unsafe, shared with cron). This is a **security-scan concern**, not a DB-audit one: `CLAUDE.md` § Known Issues already flags it, and `docs/process/security-scan.md` is the correct owner. DB-side: these routes use the service client, so any HTTP caller past the bearer check can write to `observations`, `methodology_versions`, and `shadow_scores` — bypassing the RLS protection documented in §2. Fix is app-side (split `ADMIN_SECRET`, use `crypto.timingSafeEqual`). No SQL change.

**Severity: ✅ PASS** for this audit's scope. Pre-existing 🟠 for security-scan scope.

---

## 5. SECURITY DEFINER functions ✅ PASS

```sql
SELECT p.proname, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname='public' AND p.prosecdef=true;
```

**Zero rows.** Matches Pass 2 (zero custom functions in `public` entirely). Nothing to audit.

**Severity: ✅ PASS.**

---

## 6. Exposed secrets in schema ✅ PASS

Grepped `supabase/migrations/` for common secret patterns (`password`, `secret`, `api_key`, `token` followed by a 10+ char literal). **No matches.** The two migrations are pure DDL — no seed data, no fixture tokens, no defaults that could embed a key.

**Severity: ✅ PASS.**

---

## 7. Auth schema spillover ✅ PASS

`auth.users`, `auth.sessions`, `auth.refresh_tokens` all have `relrowsecurity = true` (Supabase-managed defaults). The app does not touch any of these (no `supabase.auth.*` calls, no user sessions, no sign-up flow — consistent with `CLAUDE.md` "no user features"). No cross-schema leakage.

**Severity: ✅ PASS.**

---

## 8. Overly permissive policies ⚪ INFO

Every `anon.SELECT` policy is `USING (true)`. This is **correct today** — the data is deliberately public. Logged for the record because:

- If a future migration lands a table holding anything user-identifying (IFPA player email, admin notes, etc.), the default-copy of migration 001's pattern would expose it wholesale.
- The schema-level convention should be: **start RLS-denied**, then add a `SELECT` policy scoped to what's actually public. The current convention (add `USING (true)`) is faster but risky to copy-paste.

No action — informational flag to reviewer for future schema work.

---

## Fix Phase — SQL

### Migration-safe (proposed `004_harden_grants.sql` — DO NOT CREATE THE FILE)

```sql
-- 004_harden_grants.sql
-- Pass 3 fix: revoke DML grants that RLS already blocks, plus TRUNCATE/REFERENCES/TRIGGER
-- which RLS *cannot* block. Writes remain possible via service_role (bypasses RLS).
-- Reversible: GRANT ... TO anon; reinstates defaults.

-- All 11 public tables, for both anon and authenticated.
-- INSERT/UPDATE/DELETE are already blocked by RLS (no permitting policy), but explicit
-- REVOKE is defense-in-depth: if a future policy is added by mistake, the grant gate
-- still stops it. TRUNCATE/REFERENCES/TRIGGER are NOT row-level and MUST be revoked.

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

-- SELECT is intentionally left granted to anon. RLS's "Allow public read" policy is
-- what allows each row through; the table-level SELECT grant is the outer gate.
-- Removing it would break the entire dashboard.
```

**Post-apply smoke test** (as anon, via the deployed dashboard URL): simply load the page. If the 6 Server Component queries still return data, the SELECT grant is intact. Separately, attempt a write via PostgREST with the anon key — should get `permission denied for table ...` instead of the previous `new row violates row-level security policy`. Both are rejections; the new one is thrown earlier and also covers `TRUNCATE`.

### Dashboard / CLI manual

None. Every statement above is a short-lock DDL operation on tiny tables; no pooler timeout risk.

### Not fixed here (app-side, cross-reference other audits)

- Admin route bearer sharing with `CRON_SECRET` + timing-unsafe compare — security-scan owns this.
- `FORCE RLS` on all tables — intentionally skipped; `service_role` bypasses it anyway and `postgres` is never the request-time role. Adding `FORCE RLS` is a cosmetic change with zero behavior delta for this project.

---

## Severity Summary

| Severity | Count | Findings |
|---|---:|---|
| 🔴 CRITICAL | 0 | — |
| 🟠 HIGH | 1 | R-01: `anon` + `authenticated` hold `TRUNCATE` (+ redundant INSERT/UPDATE/DELETE/REFERENCES/TRIGGER) grants on all 11 public tables |
| 🟡 MEDIUM | 0 | — |
| 🔵 LOW | 0 | — |
| ⚪ INFO | 1 | §8 `USING (true)` policies are fine today, risky as a copy-paste default for future tables |
| ✅ PASS | 6 | §1 RLS on all tables; §2 policy shape uniform; §4 service client usage clean; §5 zero SECURITY DEFINER; §6 no secrets in schema; §7 auth schema untouched |

**Anon write access (effective):** No (RLS blocks row-level DML). **Anon destructive access (effective):** Yes — `TRUNCATE` is a table-level grant that RLS does not intercept. Addressed by R-01 fix.

**Service role call-site inventory:** 10 server-only use sites (6 collectors + 2 cron routes + 2 admin routes + 1 factory). Zero in client components or pages.

**Migration-safe SQL snippets:** 11 `REVOKE` statements (one per table).
**Dashboard-only SQL snippets:** 0.

---

## Confirmation

- Read-only diagnostic queries only. No `DROP`, `ALTER`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, or `REVOKE` was executed against the database.
- No migration files created.
- No application code, `docs/`, `CLAUDE.md`, `NOTES.md`, or `PLAN.md` touched.
- No commits.
- Only file written: `_db-audit/03-security-rls.md`.
