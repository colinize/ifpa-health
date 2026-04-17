# Pass 3 — Data Validation & Error Leakage

**Date:** 2026-04-17
**Scope:** What the app accepts from outside (admin/cron inputs) and what it sends back (HTTP responses, DB error_message, logs).
**MCP availability:** Supabase MCP not authenticated for project `ryteszuvasrfppgecnwe` in this session — the "current error_message rows" live scrub is queued as a manual follow-up, not run. See §9.

## Changes Since Last Scan

Pass 2 introduced `lib/auth.ts` (`verifyBearer`, constant-time). All 4 write routes now gate on it. Pass 3 does not re-audit auth — it layers validation and error-response hygiene on top.

---

## Findings

### 1. Admin route body validation

**`POST /api/admin/observations`** — before this pass: manual required-field checks + enum + numeric range. No ISO-date validation; no length caps on `notes` / `evidence`; Supabase errors bubbled `error.message` to the caller verbatim.

**Severity:** MEDIUM (pre-fix) → :blue_circle: LOW (post-fix). Still bearer-gated, so not exploitable remotely.

**Fix applied:**
- Added `validateObservation(body)` in `/Users/calsheimer/projects/ifpa-health/app/api/admin/observations/route.ts`. Checks: ISO date format (regex), period ordering (`period_start <= period_end`), enum, finite numeric range 0-100, 5000-char cap on `notes` and `evidence`.
- Wrapped `request.json()` in try/catch — malformed JSON returns 400 cleanly instead of crashing.
- Supabase errors no longer leak `error.message` to caller — logged server-side via `sanitizeErrorMessage`, client sees `{ error: 'Failed to create observation' }`.

**Zod:** not installed (`package.json` checked — only runtime deps are Supabase, Next, React, date-fns, lucide-react, tailwind). Manual validation was chosen over adding a new dep for a single route. If a second admin POST appears, switch to Zod.

**`POST /api/admin/calibrate`** — reviewed. **Does not read a body** at all. The handler re-reads `observations`, `methodology_versions`, `shadow_scores` and recomputes MAE. No user input → no validation needed. Wrapped the whole handler in a try/catch so any upstream Supabase fetch error returns `{ error: 'Calibration failed' }` (status 500) instead of crashing the route and surfacing a framework stack to the caller.

### 2. Cron route input surface

Both cron routes (`/api/cron/daily`, `/api/cron/weekly`) are `GET` only and read exactly one request header — `authorization`. They consume no body, no query params, no cookies. Confirmed by reading both files. No additional input validation is warranted. :white_circle: INFO.

### 3. Error response content

Before this pass:

- `/api/cron/daily` 500 response returned `{ error: 'Collection failed', message: error.message }` — the raw message could include Supabase constraint/column names or (hypothetically) an IFPA error URL.
- `/api/admin/observations` returned `{ error: error.message }` from Supabase on failure — same class of leak, but only callable with a bearer.
- `/api/admin/calibrate` had no error handling at all — unexpected Supabase failure would crash the handler and let Next.js emit a generic 500, but with dev-mode stack traces visible in local testing.

**Severity:** MEDIUM pre-fix (anon can't hit these, but `collection_runs.error_message` is anon-readable — see §4).

**Fix applied:**
- `app/api/cron/daily/route.ts` — 500 response is now `{ error: 'Collection failed' }` (no `message` field). Raw error still logged via `console.error` for Vercel Runtime Logs (owner-only).
- Admin routes — generic `{ error: 'Failed to...' }` responses; raw goes to `console.error` (sanitized).

No stack traces or framework internals appear in any 500 response body.

### 4. `collection_runs.error_message` write path

This was the biggest practical leak risk. The table is RLS-permissive for anon SELECT — anything written here is effectively public.

**Write paths audited:**

- `app/api/cron/daily/route.ts:58` (pre-fix): `error.message` written directly.
- `app/api/cron/weekly/route.ts:55` (pre-fix): `errors.join('; ')` of each collector's raw `.catch(e => e.message)`.

A collector today can realistically throw in two paths:

1. `lib/ifpa-client.ts:84` — `throw new Error(\`IFPA API error: ${res.status} ${res.statusText} for ${endpoint}\`)`. Uses the path-only `endpoint`, not the full URL with `api_key=`. **Currently safe.** Documented as :white_circle: INFO in Pass 2 already.
2. `lib/collectors/health-scorer.ts:30,34` — Supabase fetch error message. No API key in that path; but a constraint name or RLS message could land in `error_message`.

The risk is forward-looking: a future developer adds `throw new Error(\`Failed to call ${url}\`)` with the full URL, and `api_key=...` lands in a public-readable DB column. The sanitize pass prevents that regression.

**Fix applied:** New file **`/Users/calsheimer/projects/ifpa-health/lib/sanitize.ts`** exporting `sanitizeErrorMessage(msg: unknown): string`. Strips:

- `api_key=[^&\s"']+` → `api_key=***`
- `Bearer\s+[A-Za-z0-9\-_.]+` → `Bearer ***`
- `Authorization:\s*[^\n\r]+` → `Authorization: ***`

Also caps at **2000 chars** with a `…[truncated]` suffix, so a runaway collector (e.g. IFPA returns an HTML error page that gets stringified) can't bloat the `error_message` column.

**Wired into:**

- `app/api/cron/daily/route.ts` — catch block, before `UPDATE collection_runs`.
- `app/api/cron/weekly/route.ts` — each `.catch((e: Error) => ...)` sanitizes `e.message` before pushing to `errors[]` and before writing to `details.error`. Final `error_message` is re-sanitized for belt-and-braces on the joined string.
- `app/api/admin/observations/route.ts` and `app/api/admin/calibrate/route.ts` — used on `console.error` calls so Vercel Runtime Logs stay clean too (defense in depth; those logs are owner-only but there's no reason to log a raw key there either).

**Severity (post-fix):** :blue_circle: LOW — sanitizer is preventive; no current leak vector was identified but future-proofs the column.

### 5. `lib/ifpa-client.ts` inspection

Re-reviewed. No logging, no inclusion of `url.toString()` in thrown errors, `api_key` stays in the query string and never appears in thrown `Error.message`. Safe. :white_circle: INFO.

### 6. `console.log` / `console.error` audit

Grep results inventoried across `lib/collectors/*`, `lib/ifpa-client.ts`, API routes, and `scripts/`:

**Collectors (9 call sites)** — all log one of:
- A literal message string (e.g. `'Failed to upsert health score:'`) followed by `error.message` (a Supabase PostgrestError message — safe).
- A parameterized label (`'Failed to fetch tournaments for ${year}-${month}:'`) followed by the `err` object — still safe, caught error objects from Supabase/fetch don't contain env values.

None of these log full env, full request URLs with `api_key=`, or secret values. :white_circle: INFO.

**API routes** — now log via `console.error('... failed:', sanitizeErrorMessage(err))` (added by this pass). Safe even if a future dev accidentally throws a URL-with-key.

**`scripts/backfill.ts:94-95`** — logs `NEXT_PUBLIC_SUPABASE_URL` (public, fine) and a masked IFPA key (`'***' + IFPA_API_KEY.slice(-4)`). Last 4 chars of a secret is weak protection but acceptable for a local-only ops script that a developer runs with eyes on the terminal. :blue_circle: LOW — consider dropping the suffix entirely on next touch.

**`scripts/migrate-002.cjs`** — logs a manual SQL statement. No secrets. :white_circle: INFO.

No `console.*` call logs the whole `process.env` object anywhere. Verified via grep for `process.env` within 3 lines of any `console.` call.

### 7. Response header hygiene

`next.config.ts` is essentially empty — no custom headers configured. Next.js 16 defaults remove `X-Powered-By` on response. Spot-checked: no route handler adds custom headers (no `NextResponse` construction sets `headers:` anywhere in `app/api/`). :white_circle: INFO.

No need for a Content-Security-Policy review at this pass — the dashboard is server-rendered static with no user input reflected to the page.

### 8. IFPA API response handling (re-review)

`IFPAClient.fetch()` builds a URL with `api_key` in the query string, calls `fetch()`, and on non-OK throws:

```
IFPA API error: ${res.status} ${res.statusText} for ${endpoint}
```

- `endpoint` is the path (e.g. `/stats/overall`), passed in by each typed method. **Not** the full URL. The `api_key` is applied via `url.searchParams.set` inside `fetch` and never concatenated into an error message.
- The response body from IFPA is not inspected in the error path. Even if IFPA 401s with an echoed request URL in its body, the body is discarded by `res.json()` never being called on a non-OK response.

**Safe as-written.** :white_circle: INFO. The sanitizer in §4 is still worth having because a future touch to this function is realistic.

### 9. One-off scrub query (deferred)

Supabase MCP is not authenticated in this session. Queue the following for a manual run in the Supabase Dashboard SQL Editor:

```sql
-- Find any current collection_runs rows that contain leak-shaped substrings.
SELECT id, run_type, status, started_at,
       length(error_message) AS msg_len,
       substring(error_message, 1, 200) AS preview
FROM collection_runs
WHERE error_message IS NOT NULL
  AND (
    error_message ILIKE '%api_key=%'
    OR error_message ~ 'Bearer\s+[A-Za-z0-9\-_.]{20,}'
    OR error_message ILIKE '%Authorization:%'
    OR length(error_message) > 2000
  )
ORDER BY started_at DESC
LIMIT 50;
```

If any rows return, `UPDATE collection_runs SET error_message = '[scrubbed post-audit]' WHERE id IN (...)`. Prior DB audit Pass 4 already confirmed no secrets in `error_message` at audit time — this is a belt-and-braces check after Pass 3.

### 10. Zod / env validation

Not added. The project has 5 env vars total; a Zod boot-time schema (`lib/env.ts`) is reasonable but out of scope for Pass 3. Re-raise in a future pass if the project adds more env surface. :blue_circle: LOW (unchanged from spec).

---

## Fixes Applied

| File | Change |
|---|---|
| `lib/sanitize.ts` (new) | `sanitizeErrorMessage(msg)` — strips `api_key=`, `Bearer`, `Authorization:` fragments; caps at 2000 chars. |
| `app/api/cron/daily/route.ts` | 500 body is now generic; raw error goes only to `console.error`; `collection_runs.error_message` written via sanitizer. |
| `app/api/cron/weekly/route.ts` | Each collector `.catch` sanitizes before pushing to `errors[]` and before writing `details.error`. Final `error_message` re-sanitized. |
| `app/api/admin/observations/route.ts` | Manual `validateObservation()` checks ISO dates, period ordering, enum, numeric bounds, 5000-char caps. `request.json()` wrapped in try/catch. Supabase errors no longer leak `error.message` to caller. |
| `app/api/admin/calibrate/route.ts` | Entire handler wrapped in try/catch — generic `{ error: 'Calibration failed' }` on failure; raw goes to `console.error` (sanitized). |

---

## Severity Counts

- :red_circle: CRITICAL: 0
- :orange_circle: HIGH: 0
- :yellow_circle: MEDIUM: 0 (both pre-fix MEDIUMs resolved by sanitize + generic 500 body)
- :blue_circle: LOW: 3 (no Zod env layer; `backfill.ts` masked-key suffix; admin routes still share `CRON_SECRET`)
- :white_circle: INFO: 5 (cron input, ifpa-client throws, collector console.errors, response headers, scripts logging)

---

## Verification

- `npm run lint` → only pre-existing errors (`components/data-freshness.tsx` Date.now purity, `scripts/migrate-002.cjs` require-imports). **No new errors introduced.**
- `npx vitest run` → 4 files, **29/29 tests pass**.

---

## Still Needs Fixing

1. **Manual scrub of `collection_runs.error_message`** — MCP was unavailable this session. Query in §9 should be run in the Supabase Dashboard SQL Editor. Expected: zero rows (DB audit Pass 4 already confirmed clean history). :blue_circle: LOW.
2. **Admin routes share `CRON_SECRET`** — deferred from Pass 2; requires a Vercel env change to add `ADMIN_SECRET`. :blue_circle: LOW.
3. **`lib/env.ts` Zod boot schema** — out of scope; 5-var project. Queue for when env surface grows. :blue_circle: LOW.
