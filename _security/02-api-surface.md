# Pass 2 — API Surface & Auth

**Date:** 2026-04-17
**Scope:** All 4 write routes in `app/api/` and their bearer-auth posture.
**Prior pass:** `_security/01-secrets.md` (secrets clean, no leaks, no rotation needed).

## Context Recap

`ifpa-health` exposes no public read API — the dashboard is a Server Component reading Supabase via the anon client. The entire authenticated surface is four routes, all currently gated by a single shared bearer secret (`CRON_SECRET`) compared with plain `!==`. Two of those four are reachable from the public internet (the admin URLs are obscure but not secret). This pass hardens that comparison and centralizes it, without splitting `CRON_SECRET` from `ADMIN_SECRET` (that's a follow-up).

## Route Inventory

| Route | Method | Auth | Mutates (via service role) | Public intent |
|---|---|---|---|---|
| `/api/cron/daily` | GET | `Bearer CRON_SECRET` | `collection_runs`, `annual_snapshots`, `monthly_event_counts`, `overall_stats_snapshots`, `wppr_rankings`, `health_scores`, `forecasts` | Private (Vercel cron trigger) |
| `/api/cron/weekly` | GET | `Bearer CRON_SECRET` | `collection_runs`, `annual_snapshots`, `monthly_event_counts`, `country_snapshots` | Private (Vercel cron trigger) |
| `/api/admin/observations` | GET, POST | `Bearer CRON_SECRET` | `observations` (POST); read-only (GET) | Private (manual admin only) |
| `/api/admin/calibrate` | POST | `Bearer CRON_SECRET` | `methodology_versions.backtest_mae` | Private (manual admin only) |

No other files exist under `app/api/`. No unexported methods — Next.js App Router returns 405 automatically for anything not exported. Confirmed by directory walk.

`vercel.json` sanity: two cron entries (`0 8 * * *`, `0 9 * * 1`) targeting the two cron routes. Both functions set `maxDuration: 300`. Vercel cron auto-attaches the `Authorization: Bearer ${CRON_SECRET}` header — matches what the route handlers verify.

## Findings

### :yellow_circle: MEDIUM — Plain `!==` on bearer secret (timing-attackable) — **FIXED**

All four routes previously compared the incoming header to `` `Bearer ${process.env.CRON_SECRET}` `` via `!==`. JavaScript string equality short-circuits on the first mismatched byte, which is theoretically measurable via a precise timing side-channel. Feasibility against a high-entropy secret called ~2×/day through Vercel's network stack is very low, but the fix is cheap.

**Fix (inline, this pass):** Created `lib/auth.ts` with a `verifyBearer(request, secretEnvName)` helper that:
- Reads and `.trim()`s the env secret (same defensive posture as `lib/ifpa-client.ts` and `lib/supabase.ts`).
- Fails closed if the secret is unset — without this guard, `Bearer undefined` would be the accepted literal when `CRON_SECRET` is missing.
- Treats "missing header", "malformed header", "wrong secret" identically — all return `false` with no branching differences the caller could probe.
- Rejects on length mismatch before calling `crypto.timingSafeEqual` (which throws on unequal-length buffers). The length-mismatch branch is not itself constant-time, but token length is low-sensitivity and effectively fixed by the generator.
- Uses `timingSafeEqual` from `node:crypto` for the actual byte-wise compare.

All four route handlers were refactored to call `verifyBearer(request, 'CRON_SECRET')`. Behavior is unchanged from the caller's perspective: same 401 response, same `{ error: 'Unauthorized' }` body.

### :blue_circle: LOW — Admin routes share `CRON_SECRET` with cron — **DEFERRED**

Both `/api/admin/*` routes currently auth against the same secret as the cron jobs. This means:
- Rotating one rotates the other.
- A compromise of the Vercel cron invocation path (extremely unlikely, but hypothetical) hands an attacker both cron-write and admin-write.
- There's no per-surface audit log of which secret was used.

**Not fixed this pass** because `ADMIN_SECRET` does not yet exist in Vercel env. Flipping the admin routes to `verifyBearer(request, 'ADMIN_SECRET')` with no env value configured would break those routes on the next deploy — they'd return 401 universally (the helper fails closed on missing env).

**Next step (requires human action in Vercel dashboard):**
1. Generate a new high-entropy value, set `ADMIN_SECRET` in Vercel production env.
2. Pull to `.env.local` for local dev (`vercel env pull`).
3. Change both admin route call sites from `'CRON_SECRET'` to `'ADMIN_SECRET'`.
4. `CLAUDE.md` "Known Issues" entry can then be cleared.

The helper already accepts either via a discriminated union literal, so no changes to `lib/auth.ts` are needed when the split happens.

### :white_circle: INFO — CSRF not applicable

No cookies, no sessions, no Server Actions carrying credentials, no browser-origin write paths. All four routes authenticate via the `Authorization` header, which browsers do not automatically attach from cross-site contexts. If user accounts or cookie auth are ever introduced, reconsider — but for the current surface, CSRF is not a concern. Documented here so no future contributor "fixes" it with a pointless double-submit cookie.

### :blue_circle: LOW — No app-side rate limiting

There is no Redis, no Upstash, no middleware rate limiter. A brute-force attempt against `CRON_SECRET` via repeated `/api/cron/daily` hits would be bounded only by Vercel's per-route platform defaults (~hundreds of invocations/sec region-wide before throttling kicks in). Against a high-entropy secret this is not a practical attack — search space dominates. Against a weak secret it's meaningful; mitigation is to keep `CRON_SECRET` 32+ random bytes.

**Not fixed this pass** — architectural decision, out of scope per the spec. Noted as a gap, not a finding.

### :white_circle: INFO — HTTP method exposure is clean

Verified by reading each `route.ts`:
- `cron/daily/route.ts` — exports only `GET`.
- `cron/weekly/route.ts` — exports only `GET`.
- `admin/observations/route.ts` — exports `GET` and `POST`. Both bearer-gated. Matches intent.
- `admin/calibrate/route.ts` — exports only `POST`.

Any other method on any of these returns a default 405 via Next.js App Router. No `OPTIONS` handler exposed (CORS is not a concern — no browser write origin).

### :white_circle: INFO — Public page cache posture not affected

`/` (`app/page.tsx`) uses ISR (`export const revalidate = 3600`), anon client only. No cookie inspection, no header peek, no `draftMode()` — nothing that would opt the route out of static rendering. Frontend audit Pass 5 covered this in depth; cross-referenced and not re-audited.

### :white_circle: INFO — Auth failure response is clean

All four routes return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` on auth failure. No stack traces, no internal details, no differentiation between "missing header" and "wrong secret." Matches spec. Pass 3 will go deeper on error-body leakage in the non-auth-failure paths (admin POST validation errors, cron collector failures).

### :white_circle: INFO — Auth check precedes all DB work

Verified on all four routes: the bearer check is the first line of the handler. No `createServiceClient()` call, no `supabase.from(...)` call, and no `await request.json()` happens before 401 is returned.

## Changes Made This Pass

**New file:** `lib/auth.ts` (45 lines, one export).

**Refactored (auth check only, all four routes):**
- `app/api/cron/daily/route.ts`
- `app/api/cron/weekly/route.ts`
- `app/api/admin/observations/route.ts` (GET + POST)
- `app/api/admin/calibrate/route.ts`

Each route's inline `if (authHeader !== ...) return 401` became `if (!verifyBearer(request, 'CRON_SECRET')) return 401`. Imports added. No other logic touched.

The admin routes also gained a short comment pointing to this file and describing the `ADMIN_SECRET` follow-up.

## Summary

```
CRITICAL: 0
HIGH:     0
MEDIUM:   1  (timing-attackable compare — FIXED)
LOW:      2  (shared CRON/ADMIN secret — deferred; no rate limiting — out of scope)
INFO:     5
```

**Helper created:** Yes — `lib/auth.ts` with `verifyBearer(request, secretEnvName)`.
**Routes now using helper:** All 4 (`cron/daily`, `cron/weekly`, `admin/observations` GET+POST, `admin/calibrate`).
**Left for a future pass:** Introduce `ADMIN_SECRET` env var in Vercel, flip the two admin routes' call sites from `'CRON_SECRET'` to `'ADMIN_SECRET'`, update CLAUDE.md Known Issues. No code change needed in `lib/auth.ts` itself — the `secretEnvName` union already accepts both.

## Verification

- `npm run lint` — Pre-existing errors only: `components/data-freshness.tsx:14` (`Date.now()` purity rule) and `scripts/migrate-002.cjs` (2 `require()` errors + 1 unused var). Matches pre-audit baseline documented in Pass 1. No new lint errors introduced by `lib/auth.ts` or the route refactors.
- `npx vitest run` — 29/29 passing across 4 test files (health-score 14, narrative 7, projected-score 5, forecast 3). Unchanged from baseline. No API-route tests exist; no new tests added (spec says skip).
- Manual read-through of all four route code paths confirms each still returns 401 on bad/missing auth and proceeds to the original logic on valid auth. No behavior change.

## Output

- File: `/Users/calsheimer/projects/ifpa-health/_security/02-api-surface.md`
- Lines: ~170
