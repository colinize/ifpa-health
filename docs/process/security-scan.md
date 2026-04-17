# Security Scan — Multi-Pass Vulnerability Check

> **What this is:** A structured prompt system for Claude Code that checks for security issues in the `ifpa-health` codebase. This is not a pentest — it's a practical sweep for leaked secrets, missing auth on write endpoints, error-message leakage, and Supabase RLS gaps.
>
> **How to use:** Tell Claude Code: "Read `docs/process/security-scan.md` and run all 4 passes against this codebase." You can also run individual passes ("Pass 2 of the security scan") on demand.
>
> **Works with:** Next.js 16 (App Router, Server Components), Supabase (project `ryteszuvasrfppgecnwe`, RLS, anon + service clients), Vercel (cron + hosting), IFPA API (server-side only).
>
> **When to run:** Before surfacing admin URLs, before adding any write-capable endpoint, after adding a new data source, or whenever the env/secret surface changes. Small public dashboard — low surface, so a quarterly sweep is more than enough.
>
> **Calibrate to what this actually is.** `ifpa-health` is a single-page PUBLIC read-only dashboard. No user accounts, no sign-in, no forms, no uploads, no webhooks. The entire write surface is 4 routes (`/api/cron/daily`, `/api/cron/weekly`, `/api/admin/observations`, `/api/admin/calibrate`) — all of which share one bearer secret (`CRON_SECRET`). Severity must be calibrated to that. Most findings will be `LOW` or `MEDIUM`. A `CRITICAL` here means a service-role key is in the bundle or the admin routes are actually unauthed.

---

## MASTER INSTRUCTION

You are performing a security scan of the `ifpa-health` codebase. Execute 4 sequential passes, each focused on a different attack surface. Each pass has TWO phases: **scan** (find the problems) and **fix** (make the changes where possible). Write findings and fixes to markdown files in `_security/` at the project root.

### Pre-flight (before Pass 1)

1. **Read context:**
   - `CLAUDE.md` — especially the "Environment Variables" and "Known Issues & Tech Debt" sections
   - `NOTES.md` — for recent changes that might have introduced or resolved issues
   - `lib/supabase.ts` — two-client pattern (anon vs service)
   - `app/api/cron/daily/route.ts`, `app/api/cron/weekly/route.ts` — bearer check pattern
   - `app/api/admin/observations/route.ts`, `app/api/admin/calibrate/route.ts` — admin auth posture

2. **Check for previous scans.** If `_security/` exists, open the prior `00-summary.md` and start each new pass file with a "Changes Since Last Scan" block. Focus attention on new or altered code; re-verify previously-fixed findings are still fixed.

3. **Supabase MCP availability.** If the Supabase MCP server is authenticated for project `ryteszuvasrfppgecnwe`, use it for Pass 4:
   - `get_advisors(project_id, type: "security")` for live advisories
   - `list_tables(schemas: ["public"])` to confirm the 11-table inventory
   - `execute_sql(...)` for RLS and policy introspection
   If not authenticated, note the SQL queries as "needs manual run in Supabase Dashboard SQL Editor."

4. **Write a Security Context Summary** at the top of `_security/01-secrets.md` (one paragraph: what this app is, what the threat surface actually is, and whether MCP was available).

### Rules

- **Never log, print, or include actual secret values.** Reference by variable name only (e.g., `SUPABASE_SERVICE_ROLE_KEY`, not the value). No secret values in output files, commit messages, or terminal echo.
- **Make actual fixes** where the fix is small and safe. For anything that needs a design choice, document and leave a `// SECURITY: TODO` comment pointing at the scan finding.
- **Be honest about severity.** A public read-only dashboard with no user data is not a bank.
- **Don't break prod.** Cron must keep running. If a fix could break the daily run, guard behind a feature flag or leave as a documented TODO.
- All output files go in `_security/` at project root.

### Severity scale

- :red_circle: **CRITICAL** — Actively exploitable right now. Service-role key in bundle, admin writes unauthed on a public URL, credentials in committed git history.
- :orange_circle: **HIGH** — A moderately skilled attacker could exploit. Weak auth on a write endpoint, RLS off on a writable table.
- :yellow_circle: **MEDIUM** — Real issue but limited blast radius. Timing-attackable comparison on a non-public endpoint, verbose error responses.
- :blue_circle: **LOW** — Best practice / defense-in-depth. Missing `.env.example`, no Zod env validation, `console.log` in cron paths.
- :white_circle: **INFO** — Not a vulnerability, worth noting.

---

## PASS 1: Secrets & Environment Hygiene

**Output file:** `_security/01-secrets.md`

**Scan phase — find:**

1. **Hardcoded secrets in source.** Grep all `.ts`, `.tsx`, `.js`, `.cjs`, `.mjs` for:
   - Strings resembling API keys (long alphanumeric, `Bearer `, `sk_`, `pk_`, `api_key=`)
   - Database connection strings with embedded credentials
   - IFPA, Supabase, or Vercel tokens pasted inline
   - Include `scripts/` (backfill, migrate-002.cjs, recompute-v2-score.ts, recompute-forecast.ts)

2. **`.env.local` audit.** Reference variable names only — never echo values.
   - Confirm `.env.local` matches the required set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, `CRON_SECRET`
   - Any unexpected variables present?
   - **Known issue:** `.env.local` has trailing `\n` characters on several values (`IFPA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`). See `CLAUDE.md` Known Issues. Document presence. Note that `lib/ifpa-client.ts` already `.trim()`s the IFPA key, but the Supabase URL is not trimmed — verify this isn't causing silent failures.
   - Confirm `.env*` is gitignored (it is — `.gitignore` has `.env*` and `.env*.local`)

3. **`.env.example` completeness.** Currently: **does not exist.** This is a LOW finding. Create one with every variable name (no values) and a one-line description each. This is the only onboarding doc for secrets other than CLAUDE.md.

4. **Git history leak check.**
   - `git log --all --oneline -- ".env*"` — ensure no `.env*` file was ever committed
   - `git log --all -p -S "SUPABASE_SERVICE_ROLE" | head -200` — spot-check for pasted values
   - `git log --all -p -S "api_key" | head -200`
   - If history has ever contained a real secret, the secret must be rotated — `git filter-repo` is not enough if the key already leaked.

5. **`NEXT_PUBLIC_*` scope audit.** Only two `NEXT_PUBLIC_` vars should exist:
   - `NEXT_PUBLIC_SUPABASE_URL` — safe to expose
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe to expose (designed for browser)
   Flag anything else with `NEXT_PUBLIC_` as CRITICAL pending review. `SUPABASE_SERVICE_ROLE_KEY` must NEVER be prefixed `NEXT_PUBLIC_`.

6. **Client bundle check for IFPA_API_KEY.** `IFPA_API_KEY` must stay server-only. Confirm:
   - `lib/ifpa-client.ts` is only imported from `lib/collectors/*` and `scripts/*` (server-side paths)
   - Grep: any file with `"use client"` that transitively imports `ifpa-client` or references `IFPA_API_KEY`
   - Build once (`npm run build`) and grep the `.next/static/chunks/*.js` for any substring of a known-safe portion of the IFPA URL or for `IFPA_API_KEY` — should return zero matches. Do not grep for actual key substrings.

7. **Vercel env var scopes.** Document the command reference (do not execute without user consent):
   ```
   vercel env ls                    # List all envs and their scopes (production/preview/development)
   vercel env ls production         # Confirm production has all 5 required vars
   ```
   Flag if `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, or `CRON_SECRET` are set with `development` or `preview` scope without a reason. For a single-environment app, `production` scope is usually sufficient.

8. **Logging leaks.** Grep `console.log`, `console.error`, `console.warn`, `console.debug` for calls that include env vars directly:
   - `scripts/backfill.ts:94` logs `process.env.NEXT_PUBLIC_SUPABASE_URL` — this is public, fine, but document
   - Confirm no code logs `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, or `CRON_SECRET` directly or indirectly (e.g., whole `process.env` object)

**Fix phase — do:**

- Create `.env.example` at project root with variable names and descriptions (no values).
- Strip trailing `\n` from `.env.local` values if present (note: changing `.env.local` is a local-only fix — Vercel dashboard values need the same inspection manually).
- Add a `.trim()` to `process.env.NEXT_PUBLIC_SUPABASE_URL!` usage in `lib/supabase.ts` if whitespace is present anywhere in the value chain.
- If anything in Pass 1 is CRITICAL (secret leaked to git or client bundle), rotate the affected key via the IFPA account / Supabase dashboard / regenerated `CRON_SECRET` before finishing the scan.
- Commit: `security: pass 1 — secrets and environment hygiene`

---

## PASS 2: API Surface & Auth

**Output file:** `_security/02-api-surface.md`

**Scan phase — find:**

1. **Route inventory.** List every file under `app/api/` and classify:

   | Route | Method | Auth | Writes DB? | Public? |
   |---|---|---|---|---|
   | `/api/cron/daily` | GET | `Bearer CRON_SECRET` | Yes (service role) | Triggered by Vercel cron |
   | `/api/cron/weekly` | GET | `Bearer CRON_SECRET` | Yes (service role) | Triggered by Vercel cron |
   | `/api/admin/observations` | GET, POST | `Bearer CRON_SECRET` | Yes (service role) | URL is obscure, not published |
   | `/api/admin/calibrate` | POST | `Bearer CRON_SECRET` | Yes (service role) | URL is obscure, not published |

   There is no public read API. All reads go through the Server Component (`app/page.tsx`) using the anon client.

2. **Bearer check correctness.** The current pattern is:
   ```ts
   const authHeader = request.headers.get('authorization')
   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
   }
   ```
   - **Timing-attack exposure.** `!==` on strings in JavaScript is not constant-time. An attacker who can measure response timing precisely could theoretically leak the secret byte-by-byte. For a 32+ char random secret called at most a few times per day via Vercel cron, this is **MEDIUM at worst and arguably LOW.** Still worth fixing — swap to `crypto.timingSafeEqual` on equal-length buffers:
     ```ts
     import { timingSafeEqual } from 'node:crypto'
     function safeBearerCheck(header: string | null, secret: string): boolean {
       if (!header) return false
       const expected = `Bearer ${secret}`
       const a = Buffer.from(header)
       const b = Buffer.from(expected)
       if (a.length !== b.length) return false
       return timingSafeEqual(a, b)
     }
     ```
     Then use `if (!safeBearerCheck(authHeader, process.env.CRON_SECRET!)) { ... }`.
   - **Env var presence.** If `CRON_SECRET` is unset, the literal `Bearer undefined` becomes the accepted secret. Add an early guard:
     ```ts
     if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET not configured')
     ```
   - **Copy this into a shared helper** (`lib/auth.ts`) so all 4 routes use one path.

3. **Admin route status.** CLAUDE.md claims admin routes are unauthed — **this is out of date.** Both `/api/admin/observations` and `/api/admin/calibrate` currently gate on `Bearer CRON_SECRET`. Confirm this on every run — if the bearer check is ever removed, this flips to **HIGH**. Today: **INFO** (but update CLAUDE.md "Known Issues" to reflect reality, and consider using a separate `ADMIN_SECRET` so rotating one doesn't knock out the other).

4. **CSRF considerations.** None apply today. No browser auth cookies, no Server Actions that carry session state, no user login. Document as :white_circle: INFO. If user accounts are ever added, revisit.

5. **Rate limiting.** There is none. For the current surface:
   - `/api/cron/*` — Vercel cron is the only caller; bearer check is the gate.
   - `/api/admin/*` — manually invoked; bearer check is the gate. Worth noting: with no rate limiting, an attacker who obtained `CRON_SECRET` could run unlimited `calibrate` calls or flood `observations`. Since `CRON_SECRET` compromise already means full service-role access, rate limiting here is defense-in-depth against accidental loops, not adversaries.
   - **Public page (`app/page.tsx`)** — ISR-cached with 1-hour revalidate, so unprotected traffic is cheap. Vercel's platform-level protections (no custom rate limiter configured) are acceptable.
   Decision: **LOW** — no action required for a read-only dashboard. Revisit if any form or write endpoint is ever exposed to the public.

6. **Method coverage.** Confirm each route file only exports the handlers it intends to. `/api/admin/observations/route.ts` exports `GET` and `POST` — both are bearer-gated. Any un-exported method returns 405 by default in Next.js App Router (good).

7. **Vercel cron config sanity.** Read `vercel.json`:
   - Confirm the two jobs point at `/api/cron/daily` and `/api/cron/weekly`
   - Confirm `maxDuration: 300` is reasonable for current collector runtime (daily + weekly runs finish in seconds for this dataset)
   - Note that Vercel cron automatically adds a bearer token matching your `CRON_SECRET` if you use the `crons` array — confirm this setup, since the route handler expects exactly that format

**Fix phase — do:**

- Add `lib/auth.ts` with a single `requireCronBearer(request)` helper using `crypto.timingSafeEqual` and an early env guard. Replace the 4 inline checks in the route files.
- Update `CLAUDE.md` Known Issues: admin routes ARE authed; remove the stale "obscure paths aren't security" line or reframe it as "admin routes share `CRON_SECRET` — consider splitting to `ADMIN_SECRET` before publishing admin URLs."
- (Optional, if user approves) Introduce a separate `ADMIN_SECRET` env var and have admin routes accept either. Document the migration.
- Commit: `security: pass 2 — api surface and auth hardening`

---

## PASS 3: Data Validation & Error Leakage

**Output file:** `_security/03-validation-errors.md`

**Scan phase — find:**

1. **Admin route body validation.** `/api/admin/observations` POST does manual field checks (required fields, enum, numeric range). It does NOT use Zod. For a single-operator admin route behind a bearer secret, manual validation is acceptable — but:
   - The `notes` and `evidence` fields are passed through unchecked (`notes ?? null`). If `evidence` is later rendered anywhere as HTML, this is an XSS vector. Today: only rendered in JSON responses and consumed by the model math, so **LOW**.
   - `period_start` / `period_end` are not validated as ISO dates before insert — Supabase will reject malformed values, but the error message surfaces raw Postgres text to the caller (see point 3).
   - Recommended: add a small Zod schema in `lib/schemas.ts` (does not exist yet; create it) and parse both admin route bodies. Keep it proportional — this isn't a user-facing form.

2. **Cron route error surfacing.** `app/api/cron/daily/route.ts` returns:
   ```ts
   { error: 'Collection failed', message: error instanceof Error ? error.message : 'Unknown' }
   ```
   - If a Supabase insert fails, `error.message` can include column names, constraint names, or RLS details. A bearer-gated caller is the only reader, so blast radius is small, but this still leaks internals into `collection_runs.error_message` (which anon CAN read via RLS — see Pass 4).
   - **Fix:** return a generic `{ error: 'Collection failed' }` to the HTTP caller. Log the detail server-side (Vercel logs) only. Keep a truncated + sanitized `error_message` in `collection_runs` (e.g., strip anything matching `/[A-Za-z0-9+/=]{32,}/` to defang stray token-looking substrings). Severity: **MEDIUM** because `collection_runs.error_message` is readable by the anon client today.

3. **`collection_runs.details` and `error_message` secret leakage.** This is the biggest practical risk in this project.
   - `details` is a `jsonb` column written by the cron routes with arbitrary collector output. If a collector ever logs request/response bodies from IFPA that include the API key (it shouldn't — the key goes in the query string, not the body), it lands in a public-readable table.
   - Grep `lib/collectors/*` for anything that stuffs raw error responses or URLs into `details`. Today `lib/ifpa-client.ts` throws `IFPA API error: ${res.status} ${res.statusText} for ${endpoint}` — `endpoint` is the path only, not the full URL with API key. Safe.
   - `error_message` from cron routes is whatever `error.message` contains. If a developer ever adds `throw new Error(\`Failed to call ${url}\`)` with a URL that has `?api_key=...` query, the key lands in the DB. Add a lint rule or a runtime sanitizer in the cron routes' catch block:
     ```ts
     const raw = error instanceof Error ? error.message : 'Unknown error'
     const sanitized = raw.replace(/api_key=[^&\s]+/gi, 'api_key=***')
     ```
   - Severity: **MEDIUM** as a preventive control. **HIGH** if any current row contains a leaked key (run a one-off check: `select id, error_message from collection_runs where error_message ilike '%api_key%'` and scrub).

4. **`lib/ifpa-client.ts` logging behavior.** Reviewed: does not log at all. Throws `Error` with the endpoint path and status. Safe. :white_circle: INFO.

5. **`console.log` / `console.error` audit.** 9 occurrences in `lib/collectors/*`:
   - `monthly-collector.ts:40`, `87`
   - `country-collector.ts:49`
   - `daily-collector.ts:44`, `79`
   - `health-scorer.ts:83`
   - `annual-collector.ts:97`
   - `forecaster.ts:43`, `156`
   All log `error.message` or a static string. None log full env, full request, or secrets. Vercel captures these to the Runtime Logs dashboard (only the project owner sees them). Severity: :white_circle: INFO. Document that Vercel logs retention/access is the only control here.

6. **Page-side error boundaries.** `app/page.tsx` is a Server Component. If a Supabase fetch fails, Next.js renders the error boundary or surfaces a stack in dev. In production, Next auto-sanitizes error messages shown to the browser. Confirm: no `ErrorBoundary.tsx` with a raw `<pre>{error.stack}</pre>`.

7. **Zod / env validation.** There is no `lib/env.ts` Zod layer. Failed env lookups coerce to the string `"undefined"` via `!` assertion. This is a fail-late pattern. :blue_circle: LOW — add one if the project grows beyond 5 vars. For now, the trailing-newline issue and unset-var silent failures are the real risk; a Zod schema would catch both at boot.

**Fix phase — do:**

- Replace the error-response body in both cron routes with a generic client message; keep detailed server-side logging.
- Add a small `sanitizeErrorForDb(err)` helper in `lib/collectors/_shared.ts` (or inline in the cron routes) that strips `api_key=...` query-string values before writing to `collection_runs.error_message` / `details`.
- Run a one-off scrub query on `collection_runs` to verify no existing rows contain anything matching `/api_key=/i` or long bearer-token-shaped substrings. Document the result.
- (Optional) Add `lib/env.ts` with a Zod schema — 15 lines, fails fast at startup.
- Commit: `security: pass 3 — validation and error leakage fixes`

---

## PASS 4: Database, RLS & Service Role

**Output file:** `_security/04-database-rls.md`

**Scan phase — find:**

1. **RLS enabled on all 11 tables.** If Supabase MCP is available, run:
   ```sql
   SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
   FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname;
   ```
   Expected 11 tables (per CLAUDE.md): `annual_snapshots`, `monthly_event_counts`, `overall_stats_snapshots`, `country_snapshots`, `wppr_rankings`, `health_scores`, `forecasts`, `observations`, `methodology_versions`, `shadow_scores`, `collection_runs`. All should show `rls_enabled = true`. Any row with `false` is :orange_circle: HIGH.

2. **Policy inventory per table.**
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```
   Validate that each table has:
   - At minimum one SELECT policy for `anon` (project is public read)
   - NO INSERT/UPDATE/DELETE policy for `anon` — writes must be service-role only
   Flag any table with an `anon` write policy as :red_circle: CRITICAL.

3. **Overly permissive SELECT on ops tables.** Two tables are operational, not content:
   - `collection_runs` — contains `error_message`, `details` (jsonb). Today the dashboard reads from this (freshness badge). Confirm the policy is `USING (true)` on `anon` SELECT. :yellow_circle: MEDIUM — revisit the Pass 3 finding about error sanitization, since anon reads this.
   - `methodology_versions`, `shadow_scores`, `observations` — calibration data. Probably fine to be public (it's just arithmetic), but note that observed-health labels are a form of editorial opinion. Severity: :blue_circle: LOW.
   Document the call and move on. Nothing sensitive lands here today.

4. **Anon write attempt (sanity test).** Write a one-off script or use MCP `execute_sql` with the `anon` role context:
   ```sql
   -- Should fail
   INSERT INTO health_scores (score, band, captured_at) VALUES (0, 'thriving', now());
   ```
   Expected: RLS violation. If it succeeds, :red_circle: CRITICAL.

5. **`TRUNCATE` and sequence permissions.** Anon should not have `TRUNCATE` or `ALTER SEQUENCE` on any table. Supabase defaults are correct — flag only if a migration granted unusual privileges. Grep `supabase/migrations/*.sql` for `GRANT` statements touching `anon` or `authenticated`.

6. **Service role usage inventory.** `createServiceClient()` must only appear in server-side paths:
   ```
   app/api/cron/daily/route.ts        ✓ server (API route)
   app/api/cron/weekly/route.ts       ✓ server (API route)
   app/api/admin/observations/route.ts ✓ server (API route)
   app/api/admin/calibrate/route.ts   ✓ server (API route)
   scripts/backfill.ts                ✓ ops script
   scripts/recompute-v2-score.ts      ✓ ops script
   scripts/recompute-forecast.ts      ✓ ops script
   scripts/migrate-002.cjs            ✓ ops script
   ```
   Grep for any `createServiceClient` import from:
   - A `"use client"` file → :red_circle: CRITICAL
   - A Server Component (`page.tsx`, `layout.tsx`) → :orange_circle: HIGH — Server Components should use `createPublicClient()` so RLS is enforced
   - A `components/*` file → :orange_circle: HIGH (same reason)

7. **`SUPABASE_SERVICE_ROLE_KEY` prefix check.** Already scanned in Pass 1 — re-confirm here. Must NOT be `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` in:
   - `.env.local` (local)
   - `.env.example` (if created in Pass 1)
   - Vercel dashboard (manual check)

8. **`createPublicClient()` usage is the only client pattern for rendering.** Confirm `app/page.tsx` uses the public (anon) client. Any Server Component reading from the service client is a red flag — it means the author wanted to bypass RLS, which implies a missing anon policy. Surface both together.

9. **Generated column / trigger surface.** CLAUDE.md notes two generated columns (`annual_snapshots.avg_attendance`, `retention_rate`). These are computed, not attack vectors. If anything was ever added as a `SECURITY DEFINER` function, check for `SET search_path = ''`:
   ```sql
   SELECT p.proname, p.prosecdef
   FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.prosecdef = true;
   ```
   Expected: empty or very small set. Any function with `prosecdef = true` AND no `SET search_path` in source is :yellow_circle: MEDIUM.

10. **Supabase advisors.** If MCP is authenticated, include the output of `get_advisors(project_id: "ryteszuvasrfppgecnwe", type: "security")` verbatim at the end of the file. Cross-reference findings with the RLS inventory above.

**Fix phase — do:**

- Enable RLS on any table where it's disabled and add minimally-permissive anon SELECT policies.
- Remove any anon INSERT/UPDATE/DELETE policy found.
- Move any service-role import out of Server Components / client components.
- If `collection_runs.error_message` / `details` currently contains anything sensitive (see Pass 3 scrub query), scrub those rows.
- Add `SET search_path = ''` to any `SECURITY DEFINER` function missing it.
- Commit: `security: pass 4 — database, rls, and service role hardening`

---

## POST-SCAN: Summary

**Output file:** `_security/00-summary.md`

### Security Posture Overview

One paragraph, honest: is this thing secure enough for what it is? Reference the actual surface (4 bearer-gated routes, 1 public read client, 11 public-read tables, no user data, no forms) and note any remaining gaps.

### Findings by Severity

```
CRITICAL: [count]
HIGH:     [count]
MEDIUM:   [count]
LOW:      [count]
INFO:     [count]
```

### Fixed in This Scan

Bullet list of everything actually changed, by pass.

### Still Needs Fixing

Organized by severity. For each:
- What the issue is
- Why it wasn't fixed in this scan (complexity, human decision, etc.)
- What the fix would involve
- Risk if left unfixed

### Cross-Reference with Database Audit

The `docs/process/database-audit.md` process covers deeper schema integrity, RLS completeness, query performance, and data ownership. Any Pass 4 findings that need a full RLS policy review belong in a database audit.

### Security Checklist for Ongoing Work

```markdown
## Before adding a new API route
- [ ] Does it write to the DB? If yes, it must use `requireCronBearer()` from `lib/auth.ts`
- [ ] Does it accept a body? If yes, validate with Zod (see `lib/schemas.ts`)
- [ ] Does its error response leak DB internals? Return a generic message; log details server-side.

## Before adding a new env var
- [ ] Added to `.env.example` with a description (no value)
- [ ] Added to `CLAUDE.md` Environment Variables table
- [ ] If secret, NOT prefixed `NEXT_PUBLIC_`
- [ ] Set in Vercel with correct scope (`production`, or `production + preview` if previews need it)

## Before adding a new Supabase table
- [ ] RLS enabled in the migration (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] Anon SELECT policy if the dashboard needs to read it
- [ ] NO anon write policies — writes go through service role in a cron/admin route
- [ ] Documented in `CLAUDE.md` Database Schema

## Before publishing an admin URL
- [ ] Admin routes use their own secret (`ADMIN_SECRET`), not shared with `CRON_SECRET`
- [ ] Rotate `CRON_SECRET` if admin secret was previously shared
- [ ] Document the URL only in a place the team controls (1Password, private notes)
```

### Final Verification

After all 4 passes: run `npm run lint` and `npm run build`. If build emits any warning about client-side env usage or server-only imports in client bundles, halt and investigate.

---

## EXECUTION NOTES

**Run order:** Passes 1 → 2 → 3 → 4 in sequence.

**Re-scan awareness:** If `_security/` already exists, each pass file must start with "Changes Since Last Scan" — focus on new code and unresolved prior findings rather than re-auditing unchanged code.

**MCP availability:** Pass 4 is substantially easier with Supabase MCP authenticated for `ryteszuvasrfppgecnwe`. Without it, queue the SQL queries for manual run in the Supabase Dashboard SQL Editor and note the results in the output file.

**If you find a CRITICAL during the scan:** stop, write `_security/00-URGENT.md` with the issue and immediate fix, rotate any affected secret, then resume the scan.

**This is not a pentest.** You are reading code and running read-only SQL. Anything that needs runtime testing (timing-attack feasibility, rate-limit behavior under load) should be marked "needs manual verification."

**Calibrate to the project.** No user accounts, no user data, no forms, no uploads. A missing CSP header on a read-only dashboard is :blue_circle: LOW. A service-role key in a client bundle is :red_circle: CRITICAL. Use the scale honestly.
