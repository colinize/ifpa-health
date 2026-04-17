# Security Scan — Pass 1: Secrets & Environment Hygiene

## Security Context Summary

`ifpa-health` is a single-page, public, read-only Next.js 16 dashboard over Supabase Postgres. No user accounts, no forms, no uploads, no webhooks. The entire write surface is four server-side routes (`/api/cron/daily`, `/api/cron/weekly`, `/api/admin/observations`, `/api/admin/calibrate`), all gated on a single `CRON_SECRET` bearer token. The secret surface is five variables: two `NEXT_PUBLIC_*` (intended browser exposure), two server-only (`SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`), and one shared bearer (`CRON_SECRET`). Pass 1 checks that no secret has been hardcoded into source, that `.env.local` is structured correctly and gitignored, that `.env.example` documents required variables, and that git history has never carried a real credential. This is the first `_security/` run — there is no prior scan to diff against. Supabase MCP availability is irrelevant for Pass 1 (Pass 4 territory); the main-DB audit in `_db-audit/` already confirmed zero custom RPCs, zero `SECURITY DEFINER` functions, and no secrets in any migration.

---

## Scope executed

All four Pass 1 items per `docs/process/security-scan.md`:
1. Hardcoded secrets in `.ts` / `.tsx` / `.js` / `.cjs` / `.mjs` (including `scripts/`)
2. `.env.local` structural audit (never echoing values)
3. `.env.example` creation
4. Git-history leak sweep

---

## Findings

### 1. Hardcoded secrets in source code — CLEAN (INFO)

Grepped the full repo for API-key-shaped strings, JWT prefixes, `Bearer ` literals, inline `api_key=<value>` query strings, and Postgres connection URIs with embedded credentials:

- `eyJhbGciOi` (Supabase/JWT prefix) — no matches
- `sk_live|sk_test|pk_live|pk_test` — no matches
- `Bearer [A-Za-z0-9]{20,}` — no matches
- `api_key=[A-Za-z0-9]{10,}` — no matches (the only hits for the string `api_key` are the query-param *name* used by `lib/ifpa-client.ts:76` and `scripts/backfill.ts:36`, with the value sourced from `process.env.IFPA_API_KEY`)
- `postgres(ql)?://user:pass@...` — no matches

`scripts/backfill.ts:94` logs `process.env.NEXT_PUBLIC_SUPABASE_URL` — this is a public value, fine. `scripts/backfill.ts:95` logs a last-4-character fingerprint of the IFPA key (`***abcd`) — not a leak, it's the conventional "is the key present?" startup check.

**Verdict:** no hardcoded secrets anywhere in the tracked source tree. WHITE / INFO.

### 2. `.env.local` audit — MEDIUM on embedded literal `\n`

File exists at project root, readable, owned by user, contains 27 keyed lines. Reference by variable name only (per scan rules):

Required set present:
- `NEXT_PUBLIC_SUPABASE_URL` — present
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — present
- `SUPABASE_SERVICE_ROLE_KEY` — present
- `IFPA_API_KEY` — present
- `CRON_SECRET` — present

Unexpected (but harmless) variables, all from `vercel env pull`:
- `NX_DAEMON`, `TURBO_CACHE`, `TURBO_DOWNLOAD_LOCAL_ENABLED`, `TURBO_REMOTE_ONLY`, `TURBO_RUN_SUMMARY` — Vercel/Turbo build-system flags
- `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_URL` — Vercel runtime identity
- `VERCEL_GIT_*` (10 vars) — all empty strings
- `VERCEL_OIDC_TOKEN` — a short-lived Vercel-issued OIDC JWT. Scoped to the local development environment of this project; not a long-lived credential. Refreshed by `vercel env pull`. **INFO** — not a leak concern, but noting its presence.

**File header says "Created by Vercel CLI"** which means the dev pulled it with `vercel env pull`.

**The trailing-`\n` gotcha is real and nuanced.** Several values are stored in `.env.local` as double-quoted strings ending in the literal two-character escape sequence `\n` (backslash + `n`), e.g. `IFPA_API_KEY="...\n"`, `NEXT_PUBLIC_SUPABASE_URL="...\n"`, `NEXT_PUBLIC_SUPABASE_ANON_KEY="...\n"`, `SUPABASE_SERVICE_ROLE_KEY="...\n"`. This is how `vercel env pull` serialised values that the Vercel dashboard stored with trailing whitespace.

How each loader handles this differs:

- **Next.js dev/build** uses `@next/env` which parses double-quoted values and *does* interpret `\n` as a real newline. So `process.env.NEXT_PUBLIC_SUPABASE_URL` at runtime would contain a trailing `\n`.
- **Vercel production** loads env vars from the Vercel dashboard directly, not from `.env.local`. The dashboard stores strings literally, so prod values are likely clean (confirmed by working cron runs).

Impact by variable:
- `IFPA_API_KEY` — **already defended.** `lib/ifpa-client.ts:71` calls `.trim()` before use. No impact.
- `NEXT_PUBLIC_SUPABASE_URL` — **was NOT trimmed.** Used raw in `lib/supabase.ts` via `process.env.NEXT_PUBLIC_SUPABASE_URL!`. `@supabase/supabase-js` passes this through to its internal URL parser; a URL with a trailing newline may produce `https://...co\n/rest/v1/...` which most HTTP stacks reject or treat as a malformed request. Locally could silently 400 or 404; prod is unaffected because Vercel's env values don't contain the literal escape.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — JWT with trailing newline fails signature verification if sent in a header. Same symptom: works in prod, broken locally.
- `CRON_SECRET` — local only matters for manual curl testing; Vercel cron uses the dashboard value.

**Severity:** MEDIUM (local-dev footgun, not prod-exploitable) but trivial to prevent.

**Inline fix applied:** added `.trim()` in `lib/supabase.ts` for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — symmetric with `ifpa-client.ts`. One-line defensive normalization; unchanged behavior for clean values.

**Not fixed:** the `.env.local` file itself. Editing the file to strip the `\n` literals would require echoing / touching secret values and would be overwritten next `vercel env pull`. The right root-cause fix is in the Vercel dashboard (inspect each env var and strip trailing whitespace). Flagged as a MEDIUM follow-up for the user.

### 3. `.gitignore` coverage — PASS (INFO)

`.gitignore` contains both `.env*` (line 37) and `.env*.local` (line 42). `git check-ignore -v .env.local` returns `.gitignore:42:.env*.local` — confirmed ignored. PASS.

### 4. `.env.example` creation — BLOCKED BY HOOK, OPEN (LOW)

Attempted to write `.env.example` at project root with the five required variable names and a one-line description each (no values). The write was blocked by the local `protect-files.sh` hook, which matches any file whose name starts with `.env` — including `.env.example`, which is standard practice to commit.

Proposed content (LOW — for the user to add manually, or by adjusting the hook allowlist):

```
# IFPA Health — Environment Variables
# Copy this file to .env.local and fill in real values. Never commit .env.local.
# All five variables below are REQUIRED for the app to run.

# Supabase project URL (safe to expose — shipped to the browser for anon reads)
NEXT_PUBLIC_SUPABASE_URL=

# Supabase anon key (safe to expose — RLS enforces read-only access)
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase service role key (SERVER ONLY — bypasses RLS; used by cron + admin + scripts)
# MUST NOT be prefixed NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=

# IFPA v2 API key (SERVER ONLY — used by collectors via lib/ifpa-client.ts)
IFPA_API_KEY=

# Shared bearer secret for /api/cron/* and /api/admin/* routes
# Generate with: openssl rand -hex 32
CRON_SECRET=
```

### 5. Git history leak check — CLEAN (INFO)

Ran the four history-sweep commands from the spec:

- `git log --all --oneline -- ".env*"` — empty output. No `.env*` file has ever been tracked.
- `git log --all -p -S "SUPABASE_SERVICE_ROLE"` — one hit: commit `5d7556a` (`docs: add projected score implementation plan`). The diff contains only the variable *name* inside a markdown code fence (`process.env.SUPABASE_SERVICE_ROLE_KEY`) — no value.
- `git log --all -p -S "api_key"` — one hit: commit `ae77825` (initial scaffolding) adds `url.searchParams.set('api_key', this.apiKey)` to `lib/ifpa-client.ts`. No literal key value anywhere.
- `git log --all -p -S "eyJhbGciOi"` — empty output. No JWT prefix has ever been committed.

**Verdict:** git history is clean. No rotation required on the basis of history leaks.

---

## Additional cross-checks (defense-in-depth)

- **`IFPA_API_KEY` stays server-only.** `lib/ifpa-client.ts` is imported only by `lib/collectors/{annual,country,daily,monthly}-collector.ts` and `scripts/backfill.ts` — all server paths. The three `"use client"` files (`components/health-score-gauge.tsx`, `components/detail-drawer.tsx`, `components/theme-toggle.tsx`) do not transitively pull in `ifpa-client` or reference `IFPA_API_KEY`. No client-bundle exposure path.
- **`NEXT_PUBLIC_` prefix audit.** Only two variables use the prefix, both intentionally public. No misprefixed secret.
- **Logging leaks.** Only `scripts/backfill.ts:94-95` logs env vars — one public URL and one last-4-char fingerprint of `IFPA_API_KEY`. No code logs `SUPABASE_SERVICE_ROLE_KEY` or `CRON_SECRET` directly or indirectly.

---

## Inline fixes applied in this pass

- `lib/supabase.ts` — pulled `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` through `.trim()` at module load, symmetric with `lib/ifpa-client.ts:71`. Prevents the trailing-newline class of bug locally without affecting prod.

## Fixes NOT applied (and why)

- `.env.example` creation — blocked by `protect-files.sh` hook. Left as a LOW for the user to add manually.
- `.env.local` value cleanup — would require echoing or touching secret values; root cause lives in the Vercel dashboard. Flagged as MEDIUM follow-up (see below).

---

## Severity summary — Pass 1

- CRITICAL: 0
- HIGH: 0
- MEDIUM: 1 — literal `\n` escape sequences embedded in `.env.local` values (local-dev only; defended by the `.trim()` additions; root cause is Vercel dashboard values with trailing whitespace)
- LOW: 1 — `.env.example` still missing (hook-blocked; trivial manual add)
- INFO: 4 — source clean, git history clean, gitignore correct, NEXT_PUBLIC_ scoping correct

---

## Recommended follow-ups (queued for user, not done in this scan)

1. **Clean the Vercel dashboard env values.** For project `ifpa-health`, open each variable in the Vercel dashboard → verify no trailing whitespace or newline in the value field → save. This stops `vercel env pull` from re-injecting `\n` into future local pulls.
2. **Add `.env.example` manually** (or relax the `protect-files.sh` hook to allow `*.example`).
3. **Optional hardening (Pass 2 territory but related):** consider adding a small `lib/env.ts` Zod validator that fails fast at startup if any required var is missing or obviously malformed (e.g., Supabase URL must start `https://` and end with `.supabase.co`). Not required for this pass.

---

## Verification

- `npm run lint` — 3 pre-existing errors + 1 warning (in `components/data-freshness.tsx` and `scripts/migrate-002.cjs`). Confirmed by stashing my change and re-running: same 3 errors exist on unmodified main. My edit to `lib/supabase.ts` introduces **zero** new lint issues.
- `npx vitest run` — 4 files, 29 tests, 29 passed.

Output file: `/Users/calsheimer/projects/ifpa-health/_security/01-secrets.md`
