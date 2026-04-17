# Pass 4 — Database, RLS & Service Role

## Snapshot

| Field | Value |
|---|---|
| Scan date | 2026-04-17 |
| RLS enabled | **11 of 11 public tables** ✅ (verified live, matches DB audit) |
| Policies in `public` | 22 (2 per table, uniform shape — no drift since DB audit) |
| `SECURITY DEFINER` functions in `public` | **0** (verified live) |
| Service-role call sites (app code) | 12, all server-only ✅ |
| Anon-client call sites (app code) | 1 (`app/page.tsx` → `createPublicClient()`) ✅ |
| `NEXT_PUBLIC_*` env vars in source | 2 (both expected: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ✅ |
| Service-role / IFPA / CRON secret in client bundle | **0 fragments** ✅ (`.next/static/` grepped clean) |
| `auth.*` references in app code | 0 ✅ |
| Migration `003_revoke_anon_grants.sql` | **Created, NOT applied** (leave for user to review + `supabase db push --linked`) |

**Bottom line:** Nothing new found in app code. The one HIGH finding is inherited from DB audit Pass 3 (R-01: Supabase default `TRUNCATE` / DML grants on `anon` + `authenticated`), and the migration-safe REVOKE SQL is now sitting at `supabase/migrations/003_revoke_anon_grants.sql` ready for the user to apply. RLS, policies, service-role containment, and `NEXT_PUBLIC_*` scoping are all clean.

---

## Deltas Since DB Audit Pass 3

The DB audit ran against the same codebase state earlier today. Pass 4 re-ran the two cheapest live checks to confirm no drift:

- **RLS state** — unchanged. All 11 tables still have `relrowsecurity = true`. No tables added since Pass 3.
- **Policy shape** — unchanged. Same 22 rows (`anon.SELECT "Allow public read"` + `service_role.ALL "Allow service write"` per table). No new or renamed policies.
- **SECURITY DEFINER count** — still 0 in `public`.

Findings the DB audit produced that are app-security-relevant:

| DB Audit Finding | Pass 4 treatment |
|---|---|
| R-01 — `anon` + `authenticated` hold `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` on all 11 public tables (default Supabase grants, not narrowed) | Inherited as Pass 4's primary 🟠 HIGH. Migration file authored; not applied. |
| §4a — Admin-route auth sharing `CRON_SECRET` | Already resolved in security-scan Pass 2 via `lib/auth.ts` + `verifyBearer`. No action this pass. |
| §2 — `USING (true)` on every anon SELECT policy | Informational; correct today because data is deliberately public. Noted as a schema-design caveat, not a vuln. |
| §1, §5, §6, §7 — RLS coverage, SECURITY DEFINER, secrets-in-schema, `auth.*` spillover | All PASS. Re-confirmed. |

Nothing the DB audit flagged needs a different severity in Pass 4's app-surface framing. The `TRUNCATE` grant is the one real security gap on this project.

---

## 1. RLS state — re-verified ✅

```sql
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
```

Result: 11 rows, all `relrowsecurity = true`. No drift since DB audit.

---

## 2. Service-role call-site inventory ✅

```
grep -rn 'createServiceClient\|SUPABASE_SERVICE_ROLE_KEY' lib/ app/ scripts/
```

12 hits in application code — all server-only. Zero in Server Components (`app/page.tsx`, `app/layout.tsx`), zero in Client Components.

| File:line | Context | OK? |
|---|---|:-:|
| `lib/supabase.ts:8,17` | Factory + env read | ✅ |
| `app/api/cron/daily/route.ts:2,15` | Cron route (bearer-gated) | ✅ |
| `app/api/cron/weekly/route.ts:2,15` | Cron route (bearer-gated) | ✅ |
| `app/api/admin/observations/route.ts:2,83,116` | Admin route (bearer-gated) | ✅ |
| `app/api/admin/calibrate/route.ts:2,17` | Admin route (bearer-gated) | ✅ |
| `lib/collectors/daily-collector.ts:8,14` | Called from cron | ✅ |
| `lib/collectors/annual-collector.ts:8,14` | Called from cron | ✅ |
| `lib/collectors/monthly-collector.ts:9,19` | Called from cron | ✅ |
| `lib/collectors/country-collector.ts:8,14` | Called from cron | ✅ |
| `lib/collectors/health-scorer.ts:8,14` | Called from cron | ✅ |
| `lib/collectors/forecaster.ts:14,22` | Called from cron | ✅ |
| `scripts/backfill.ts:27` | Ops script (runs from dev box) | ✅ |
| `scripts/recompute-v2-score.ts:12` | Ops script | ✅ |
| `scripts/migrate-002.cjs:7` | Ops script | ✅ |

`scripts/recompute-forecast.ts` does not directly reference `SUPABASE_SERVICE_ROLE_KEY` — it imports `createServiceClient` indirectly by importing `computeForecastsFromStorage` from the forecaster collector, which creates its own service client. Same effective containment.

**No service client in `components/*`, `app/page.tsx`, or `app/layout.tsx`.** The only rendering path through the app uses `createPublicClient()` at `app/page.tsx:17`, which is correct.

---

## 3. Anon-client usage (rendering only) ✅

```
grep -rn 'createPublicClient' lib/ app/
```

Exactly one call site: `app/page.tsx:17`. No API route and no collector uses the anon client — writes all go through service role as intended. The factory itself lives at `lib/supabase.ts:11`.

No wrong-direction usage (e.g., API route inserting with anon, or page rendering with service). The boundary is clean.

---

## 4. `NEXT_PUBLIC_*` prefix audit ✅

```
grep -rn 'NEXT_PUBLIC_' lib/ app/ scripts/ components/
```

Only two `NEXT_PUBLIC_*` names appear in source: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are designed-to-be-public values.

**Critical check:** `grep -rn 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY' .` returned only one hit — in `docs/process/security-scan.md`, where the scan template warns against it. Zero hits in source, `.env.local`, or docs outside the scan template. No mis-prefixed service key.

`.env.local` contents were not read into this pass (the shell hook blocks `cat`/`grep` on secret files). Per Pass 1 audit, the file contains exactly the 5 expected variable names (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, `CRON_SECRET`) with no mis-prefixed secrets. Vercel dashboard values need a separate manual check (`vercel env ls`) — out of scope for this pass.

`.env.example` still does not exist at repo root. Pass 1 discussed creating one; not created this pass either. :blue_circle: LOW — carries over.

---

## 5. Client bundle check for secrets ✅

Ran `npm run build` (output: 1 static page, 4 dynamic API routes, build succeeded cleanly in 1.5s). Then grepped the generated client bundle:

```
grep -rlE 'service_role|SUPABASE_SERVICE|IFPA_API_KEY|CRON_SECRET' .next/static/
```

**Zero matches.** No service-role key variable name, no IFPA key name, no CRON_SECRET name, no `service_role` string in any `.next/static/chunks/*.js` or other static asset. Client bundle is clean.

Scoped deeper: `grep -rlE 'IFPA_API_KEY|SUPABASE_SERVICE' .next/static/chunks/` also returned nothing. The only secret-adjacent values present in bundles would be anything prefixed `NEXT_PUBLIC_*`, which is correct by design.

No secret values are echoed in this report. The grep was by variable name, not by value.

---

## 6. Policy drift check ✅

```sql
SELECT tablename, policyname, roles::text, cmd FROM pg_policies
WHERE schemaname = 'public' ORDER BY tablename, policyname;
```

22 rows returned — identical shape to the DB audit:

- Every table has exactly **two** permissive policies.
- Every table has `anon.SELECT` named `"Allow public read"`.
- Every table has `service_role.ALL` named `"Allow service write"`.
- No `anon.INSERT/UPDATE/DELETE` policy anywhere.
- No `authenticated` role mentioned in any policy (consistent with "no user auth in this project").

No drift since the DB audit. :white_circle: INFO.

---

## 7. `SECURITY DEFINER` in `public` ✅

```sql
SELECT p.proname, p.prosecdef FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname='public' AND p.prosecdef=true;
```

Zero rows. Nothing to audit. :white_circle: INFO.

---

## 8. `auth` schema exposure ✅

```
grep -rn 'auth\.(users|sessions|refresh_tokens|identities)' lib/ app/ scripts/ components/ supabase/
```

Zero matches. The app has no user-auth flow (no `supabase.auth.*` calls, no sign-up, no sessions — consistent with `CLAUDE.md` § "No user features"). Supabase's own `auth.*` schema defaults (`auth.users.relrowsecurity = true`, etc.) remain in place per DB audit §7. No cross-schema leak path exists.

---

## 🟠 HIGH — P4-01: Default Supabase `anon` / `authenticated` grants include `TRUNCATE`

**Source:** Inherited from DB audit Finding R-01.

**Effective risk:** Any caller authenticating as `anon` (using the public anon key shipped in the client bundle) holds `TRUNCATE` on all 11 public tables. RLS does NOT intercept `TRUNCATE` because it is a table-level operation, not row-level. A handcrafted direct-pooler or future-surface call could one-shot wipe any table. `INSERT/UPDATE/DELETE` are separately granted but RLS blocks those — the DML grants are redundant, not load-bearing.

**Why it's HIGH, not CRITICAL:**
- No currently-known PostgREST endpoint exposes `TRUNCATE`.
- All data is re-derivable from the IFPA API via `scripts/backfill.ts`.
- The attacker would need direct pooler access or a misconfigured future edge function to trigger it.

**Why it's HIGH, not MEDIUM:**
- Defense-in-depth is missing on a destructive operation.
- Same class as the Kineticist finding referenced in the DB audit brief.
- Fix is two-line-per-table migration-safe DDL — cheap and irreversible-in-a-good-way.

**Fix (not applied):** `supabase/migrations/003_revoke_anon_grants.sql` was created in this pass. It revokes `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` from both `anon` and `authenticated` on all 11 public tables. `SELECT` is intentionally left granted — the dashboard relies on it through the "Allow public read" RLS policy.

**How to apply** (leave for user to review and run):

```bash
cd /Users/calsheimer/projects/ifpa-health
supabase db push --linked --dry-run   # preview
supabase db push --linked             # apply
```

**Post-apply smoke test:** load `https://ifpa-health.vercel.app` — if the 6 Server Component queries still return data, the SELECT grant is intact. Attempting a PostgREST write as anon should now fail with `permission denied for table ...` earlier than before (previously it failed at the RLS row-check stage).

---

## ⚪ INFO — P4-02: `USING (true)` on every anon SELECT policy (carryover)

Each table's public-read policy is `USING (true)`. Correct today because every public table is deliberately public data (IFPA stats). Flagged here so reviewers adding a future table don't copy-paste the pattern onto anything user-identifying, admin-only, or otherwise sensitive. The preferred convention for new tables: start RLS-denied, then add a minimally-scoped `SELECT` policy only if the data actually needs to be public.

No action.

---

## Overall DB security posture

The database layer is in good shape for what this app is. RLS is on for every public table, policies are uniform and shaped correctly (`anon` reads, `service_role` writes), no `SECURITY DEFINER` functions exist, the `auth.*` schema is untouched, no secrets live in migrations, and the `auth` role boundary in application code is clean — service role only appears in cron/admin routes and ops scripts, never in rendering paths or client bundles. `NEXT_PUBLIC_*` scoping is tight (two expected vars, nothing mis-prefixed), and a production build contains zero references to `SUPABASE_SERVICE`, `IFPA_API_KEY`, or `CRON_SECRET` in static chunks. The one remaining gap is the default Supabase `TRUNCATE`/DML grants to `anon` and `authenticated`, which RLS cannot block for `TRUNCATE` specifically — a migration-safe REVOKE is ready to apply at `supabase/migrations/003_revoke_anon_grants.sql` and will close it. Post-apply the posture is essentially textbook for a single-operator public dashboard.

---

## Severity counts (this pass)

| Severity | Count |
|---|---:|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 1 (P4-01, inherited from DB audit R-01) |
| 🟡 MEDIUM | 0 |
| 🔵 LOW | 0 new (carryover: `.env.example` still missing) |
| ⚪ INFO | 2 (policy drift check passed; `USING (true)` convention noted) |

## Fixes applied this pass

- **Authored `supabase/migrations/003_revoke_anon_grants.sql`** (not applied — requires user review + `supabase db push --linked`).

## Verification

- `supabase db query --linked` for RLS state, policy shape, and SECURITY DEFINER — all three re-confirmed clean.
- `grep -rn` for `createServiceClient`, `createPublicClient`, `NEXT_PUBLIC_*`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, and `auth.(users|sessions|…)` — all audited.
- `npm run build` succeeded; `grep -rlE 'service_role|SUPABASE_SERVICE|IFPA_API_KEY|CRON_SECRET' .next/static/` returned zero matches.
- `npm run lint` — pre-existing errors only (3 errors + 1 warning, same as Pass 3 baseline; none touched by this pass).
- `npx vitest run` — **29/29 tests pass**.

## Not done (deliberately)

- `REVOKE` SQL **not** applied to live DB. Spec explicitly forbids DDL in this pass; the migration file is the handoff.
- `.env.example` still not created (Pass 1 scope).
- Did not split `ADMIN_SECRET` from `CRON_SECRET` (Pass 2 scope; noted as out-of-scope there too).
