# Security Scan — Summary

**Date:** 2026-04-17
**Passes run:** 4/4 (`01-secrets`, `02-api-surface`, `03-validation-errors`, `04-database-rls`)
**Cross-reference:** overlapping DB ground covered in `_db-audit/` — not re-litigated here.

---

## TL;DR

`ifpa-health` is a public read-only dashboard — no users, no forms, no cookies — so most of the security surface is cron + admin write routes and the Supabase anon key, and the scan came back with one actionable HIGH (default Supabase `TRUNCATE`/DML grants to `anon` + `authenticated` that RLS cannot intercept) and a handful of LOW/INFO cleanups. Every MEDIUM and every code-side LOW was either fixed inline during the scan or queued with the exact remediation ready to apply. Honest read: this is a small, well-scoped project with good boundaries — the remaining work is one migration apply, one env-var addition in Vercel, and a dashboard janitorial pass on trailing `\n` in env values.

---

## Threat model scope

What this scan covers and what it deliberately doesn't:

- **In scope:** hardcoded secrets in source/git, `.env.local` hygiene, bearer-auth on the 4 write routes, admin-POST body validation, error-body leakage (including anon-readable `collection_runs.error_message`), client-bundle secret leakage, RLS state + policy shape, `SECURITY DEFINER` inventory, service-role call-site containment, `NEXT_PUBLIC_` prefix scoping, `auth.*` cross-schema references.
- **Out of scope (by design):** user-auth flows (none), session/cookie security (none), CSRF (no cookie auth), CORS (no browser write origin), Sentry/error-tracking review (not integrated), DoS/rate-limiting at app layer (Vercel platform defaults), Content-Security-Policy (no user-reflected input), supply-chain / dependency CVE audit (separate concern).
- **Cross-referenced, not duplicated:** `_db-audit/` Pass 3 already enumerated the 22 public policies and found R-01 (default grants). Pass 4 re-verified live state had not drifted, inherited the finding as P4-01, and authored the fix migration. See `_db-audit/03-grants-roles.md` for the original grant inventory.

---

## Severity rollup

Totals across all four passes (deduped; `_db-audit/` R-01 → Pass 4 P4-01 is counted once):

- 🔴 **CRITICAL:** 0
- 🟠 **HIGH:** 1 — default `anon`/`authenticated` `TRUNCATE`/DML grants on 11 public tables (Pass 4, inherited from DB audit R-01; migration ready)
- 🟡 **MEDIUM:** 0 open (2 fixed inline — timing-attackable bearer compare in Pass 2; leaky error bodies + missing admin validation in Pass 3)
- 🔵 **LOW:** 5 open — `.env.example` missing (hook-blocked), Vercel env trailing `\n` at source, admin routes share `CRON_SECRET` (env-blocked), `collection_runs.error_message` belt-and-braces scrub, no `lib/env.ts` Zod boot schema (out of scope at this size)
- ⚪ **INFO:** 16 — clean source, clean git history, correct `.gitignore`, correct `NEXT_PUBLIC_` scoping, clean client bundle, clean RLS state, zero `SECURITY DEFINER`, zero `auth.*` cross-schema references, and other passive checks

---

## Posture assessment

**Secrets / env hygiene (Pass 1).** Clean source tree, clean git history — nothing sensitive has ever been committed, `.env.local` is properly gitignored, and the `NEXT_PUBLIC_` prefix is used only for the two genuinely-public Supabase values. Specifically: no matches for `eyJhbGciOi` (JWT prefix), no `Bearer` literals with long suffixes, no `sk_live`/`pk_live`, no `postgres://user:pass@`, and every `api_key` hit in source references the string as a query-param name with the value pulled from `process.env.IFPA_API_KEY`. The one live gotcha is that several values in `.env.local` end in a literal `\n` escape sequence injected by `vercel env pull` — harmless in prod (Vercel loads from the dashboard directly) but a local-dev footgun that was already defeating Supabase calls. Defended inline via `.trim()` on three reads in `lib/supabase.ts`; real root-cause fix is a dashboard cleanup the user has to do.

**Write-endpoint auth (Pass 2).** Four write routes (`/api/cron/daily`, `/api/cron/weekly`, `/api/admin/observations`, `/api/admin/calibrate`), all bearer-gated on a single `CRON_SECRET` with previously-plain `!==` comparison. Replaced with a centralized `verifyBearer(request, secretEnvName)` helper in `lib/auth.ts` that uses `crypto.timingSafeEqual`, fails closed on missing env, trims input, and gives identical rejection shape for "missing", "malformed", and "wrong" — eliminating both the timing side-channel and the `Bearer undefined` failure mode. Admin routes still share `CRON_SECRET` with cron (noted in `CLAUDE.md` Known Issues); splitting to `ADMIN_SECRET` is a one-line-per-call-site change once the env var exists in Vercel.

**Validation + error leakage (Pass 3).** `POST /api/admin/observations` previously had thin validation and leaked `error.message` from Supabase to the caller; added `validateObservation()` with ISO date checks, period ordering, enum, numeric bounds, and 5000-char caps, plus try/catch on `request.json()`. Across all four routes, 500 responses now return terse generic bodies (`{ error: 'Collection failed' }`) with raw errors only in `console.error`. New `lib/sanitize.ts` strips `api_key=`, `Bearer`, and `Authorization:` fragments and caps messages at 2000 chars before any write to `collection_runs.error_message` or `console.error` — future-proofs the only public-readable DB column against regressions in how collectors construct error strings.

**Database RLS + service role containment (Pass 4).** RLS on for all 11 public tables, 22 policies uniform (`anon.SELECT "Allow public read"` + `service_role.ALL "Allow service write"`), zero `SECURITY DEFINER` functions in `public`, zero `auth.*` schema references in app code, service role used only in the 4 API routes + 6 collectors + 3 ops scripts (never in a Server Component or client bundle), production bundle grepped and contains zero references to `SUPABASE_SERVICE`, `IFPA_API_KEY`, or `CRON_SECRET`. The only anon-client call site is `app/page.tsx:17` (`createPublicClient()`) — boundary is clean with no wrong-direction usage. The one real gap is RLS's inability to block `TRUNCATE` — `anon` currently holds it on all 11 tables by Supabase default (Supabase grants `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` by default; RLS blocks the DML operations row-by-row but cannot intercept `TRUNCATE` at all). `supabase/migrations/003_revoke_anon_grants.sql` is authored and ready but not applied — spec forbids live DDL in this pass, so the file is the handoff.

---

## Fixed during this scan

- [x] `.trim()` on `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `lib/supabase.ts` (Pass 1)
- [x] Created `lib/auth.ts` with `verifyBearer(request, secretEnvName)` — constant-time, fail-closed, shape-identical rejections (Pass 2)
- [x] Refactored all 4 write routes to call `verifyBearer(request, 'CRON_SECRET')` — `cron/daily`, `cron/weekly`, `admin/observations` (GET+POST), `admin/calibrate` (Pass 2)
- [x] Created `lib/sanitize.ts` with `sanitizeErrorMessage()` — strips key-shaped fragments, caps at 2000 chars (Pass 3)
- [x] Added `validateObservation()` to `POST /api/admin/observations` — ISO dates, period ordering, enum, numeric bounds, length caps; `request.json()` wrapped in try/catch (Pass 3)
- [x] Wired `sanitizeErrorMessage` into both cron routes' error paths before writing `collection_runs.error_message` (Pass 3)
- [x] Tightened 500 response bodies across all 4 write routes — generic `{ error: '...' }` only; raw errors to `console.error` (Pass 3)
- [x] Wrote `supabase/migrations/003_revoke_anon_grants.sql` — REVOKEs `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` from `anon` + `authenticated` on all 11 tables (Pass 4 — **not applied**)

---

## Open items (not fixed)

- `.env.example` creation blocked by `protect-files.sh` hook (matches `.env*`) — proposed content is in Pass 1, user can paste manually or relax the hook allowlist (Pass 1)
- Vercel env dashboard still has literal `\n` suffix on several values — fix requires opening each var in the dashboard and saving without trailing whitespace (Pass 1)
- `ADMIN_SECRET` split for admin routes — blocked on adding the env var in Vercel; `verifyBearer` already accepts it via a union-typed `secretEnvName` parameter so only the two call sites need flipping (Pass 2)
- Apply migration 003 to revoke anon grants — `supabase db push --linked --dry-run` then `supabase db push --linked` (Pass 4)
- Belt-and-braces `collection_runs.error_message` scrub SQL — queued in Pass 3 §9 for manual Dashboard run; expected zero rows given DB audit history

---

## Top 3 actions for the owner

1. **Apply migration 003** — closes the `TRUNCATE` exposure; one `supabase db push --linked` after a dry-run; post-apply smoke test is loading the dashboard and confirming data still renders.
2. **Add `ADMIN_SECRET` in Vercel env (staging+prod), flip admin routes to use it** — one line per route (`'CRON_SECRET'` → `'ADMIN_SECRET'` in the `verifyBearer` call); already typed for the union.
3. **Strip trailing `\n` from Vercel dashboard env values** — stops `vercel env pull` from re-injecting the literal escape into future `.env.local` pulls; the `.trim()` defense in `lib/supabase.ts` is belt-and-braces, not an excuse to leave the source dirty.

---

## Anti-recommendations (tempting but bad)

- **Don't add Zod just for one route.** The manual `validateObservation()` validator is appropriate for the current surface (1 admin POST body, 5 env vars). Adopt Zod only when a second admin-body route appears or when the env surface grows enough to warrant a boot-time schema.
- **Don't add CSRF tokens.** All writes are `Authorization: Bearer` header-authed with no cookies, no sessions, no Server Actions. Browsers don't auto-attach the `Authorization` header cross-origin. A double-submit-cookie pattern here adds complexity for zero threat model.
- **Don't add app-layer rate limiting.** Vercel's per-function platform defaults already bound brute-force attempts; against a high-entropy `CRON_SECRET` the search space dominates. If admin URLs ever become publicized, revisit — until then, Upstash/Redis is premature.
- **Don't "fix" `console.error` calls by removing them.** Sanitized server-side logs are the only observability layer this project has (no Sentry, no external error tracking). The Pass 3 sanitizer makes them safe. Keeping the logs is the right call.

---

## Tracking

### Fixed during scan

- [x] `.trim()` on 3 Supabase env reads in `lib/supabase.ts` (Pass 1)
- [x] `lib/auth.ts` with `verifyBearer` + `timingSafeEqual` (Pass 2)
- [x] All 4 write routes refactored onto `verifyBearer` (Pass 2)
- [x] `lib/sanitize.ts` with `sanitizeErrorMessage` (Pass 3)
- [x] `validateObservation()` added to `POST /api/admin/observations` (Pass 3)
- [x] Sanitizer wired into cron routes' `collection_runs.error_message` write paths (Pass 3)
- [x] 500 response bodies tightened across all 4 routes (Pass 3)
- [x] `supabase/migrations/003_revoke_anon_grants.sql` authored (Pass 4 — not applied)

### Open — Quick wins (< 1h)

- [ ] Apply migration 003 (user decision — one `supabase db push --linked`)
- [ ] Run the `collection_runs.error_message` scrub SQL in Dashboard (query in Pass 3 §9; expected zero rows)
- [ ] Strip `\n` from Vercel dashboard env values

### Open — Requires env work

- [ ] Add `ADMIN_SECRET` in Vercel env (staging+prod)
- [ ] Flip admin routes from `'CRON_SECRET'` to `'ADMIN_SECRET'` in `verifyBearer` call
- [ ] Create `.env.example` (blocked by protect-files hook — relax hook OR paste manually)

### Open — Architecture (owner decision)

- [ ] Install Zod if more admin routes are added with bodies
- [ ] Add rate limiting if admin URLs are publicized

---

## Files touched during scan

| File | Change | Pass |
|---|---|---|
| `lib/supabase.ts` | `.trim()` added on 3 env reads | 1 |
| `lib/auth.ts` | **New** — `verifyBearer(request, secretEnvName)` with `timingSafeEqual` | 2 |
| `app/api/cron/daily/route.ts` | Swapped to `verifyBearer`; sanitize on `collection_runs.error_message`; terse 500 body | 2, 3 |
| `app/api/cron/weekly/route.ts` | Swapped to `verifyBearer`; sanitize each collector `.catch` + final joined message | 2, 3 |
| `app/api/admin/observations/route.ts` | Swapped to `verifyBearer`; `validateObservation()`; `request.json()` in try/catch; generic 500 | 2, 3 |
| `app/api/admin/calibrate/route.ts` | Swapped to `verifyBearer`; full-handler try/catch; generic 500 | 2, 3 |
| `lib/sanitize.ts` | **New** — `sanitizeErrorMessage()` strips `api_key=`, `Bearer`, `Authorization:` + 2000-char cap | 3 |
| `supabase/migrations/003_revoke_anon_grants.sql` | **New — not applied** | 4 |

No other files in `docs/`, `_db-audit/`, `_audit/`, `CLAUDE.md`, `NOTES.md`, or `PLAN.md` were modified.

---

## Verification (all passes)

- `npm run lint` — only pre-existing errors (3 errors + 1 warning in `components/data-freshness.tsx` and `scripts/migrate-002.cjs`), unchanged from baseline. Zero new lint issues introduced.
- `npx vitest run` — **29/29 tests pass** across 4 files (health-score 14, narrative 7, projected-score 5, forecast 3).
- `npm run build` — succeeded cleanly; client bundle grep for `service_role|SUPABASE_SERVICE|IFPA_API_KEY|CRON_SECRET` returned zero matches.
- Live DB checks re-confirmed: RLS on for all 11 public tables, 22 policies uniform, zero `SECURITY DEFINER` in `public`.
