# Setup and Configuration

Reference for running IFPA Health locally, the environment variables it needs, Vercel cron config, Supabase project coordinates, and manual ops runbooks.

Scope: this project is a single-environment Next.js dashboard with two cron jobs and one Postgres database. There is no staging. There is no seed step. What you see on the dashboard is whatever is currently in Supabase.

## Prerequisites

- **Node.js 20+** (matches `@types/node ^20` and Next.js 16.1 runtime requirements).
- **npm** (lockfile is `package-lock.json`; no pnpm/yarn/bun in the repo).
- **Supabase CLI** (optional, only needed to apply migrations). Install with `brew install supabase/tap/supabase`.

No Docker, no Redis, no Playwright browsers to install.

## Local Dev Walkthrough

```bash
git clone <repo-url> ifpa-health
cd ifpa-health
npm install
# Populate .env.local (see Environment Variables below)
npm run dev
# → http://localhost:3000
```

There is no seed step. The dashboard (`app/page.tsx`) reads whatever rows exist in Supabase. If the target project is empty, the page will render with null states. To populate a fresh DB from scratch, see the backfill runbook below.

## Environment Variables

All vars are read via `process.env.*` directly. No Zod validation layer.

| Variable | Required | Who reads it | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + server (Next.js public var) | Supabase project URL. Read by `lib/supabase.ts` (both clients), `scripts/backfill.ts`, `scripts/recompute-v2-score.ts`, `scripts/migrate-002.cjs`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client + server | Anon key used by `createPublicClient()` in `lib/supabase.ts` for Server Component reads. Browser-safe. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Server + cron + scripts | Bypasses RLS. Used by `createServiceClient()` in `lib/supabase.ts`, both cron routes, all admin routes, and all scripts. Never expose to the browser. |
| `IFPA_API_KEY` | Yes | Server + scripts | IFPA v2 API key. Read by `lib/ifpa-client.ts:71` (applied `.trim()` on read) and `scripts/backfill.ts:31`. |
| `CRON_SECRET` | Yes | Server only | Bearer token for `/api/cron/daily`, `/api/cron/weekly`, `/api/admin/observations`, `/api/admin/calibrate`. Currently shared between cron and admin routes — see Known Issues in `CLAUDE.md`. |

Grep confirms these are the only five env vars referenced in `lib/`, `app/`, `scripts/`.

### Trailing `\n` Gotcha

`.env.local` has trailing newline characters on several values (noted in `CLAUDE.md`). This has bitten `IFPA_API_KEY` and `NEXT_PUBLIC_SUPABASE_URL` specifically. Symptoms: IFPA 401s even with a correct key; Supabase URL errors that look like DNS problems.

`lib/ifpa-client.ts:71` already defensively calls `.trim()` on the API key. Nothing else does. If a value looks right but fails auth, strip the trailing newline from the file:

```bash
# Inspect .env.local for trailing newlines (hex dump)
xxd .env.local | tail -5

# Rewrite the file with trailing whitespace stripped from each line
awk '{sub(/[[:space:]]+$/, ""); print}' .env.local > .env.local.tmp && mv .env.local.tmp .env.local
```

**Longer-term fix:** add a tiny `lib/env.ts` that reads each var and calls `.trim()` on load, then import from there instead of `process.env.*`. Would also be the place to add Zod later if the project grows.

### `.env.example` Status

**Does not exist.** Flag as tech debt. Minimal contents it should have:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
IFPA_API_KEY=
CRON_SECRET=
```

Creating this file is a one-line win — copy the template above into `.env.example` and commit. New clones will `cp .env.example .env.local` and fill in values.

## Vercel Cron Configuration

From `vercel.json`:

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

- **Daily:** 08:00 UTC every day. Runs the daily collector, health-scorer, forecaster.
- **Weekly:** 09:00 UTC every Monday. Runs annual + monthly + country collectors.
- **`maxDuration: 300`** (5 minutes) on both. IFPA calls for backfill-ish workloads are the usual reason a run drifts long.

Both routes bearer-check against `CRON_SECRET`. Vercel cron includes the secret automatically on the scheduled invocation.

## Supabase Project

- **Project ref:** `ryteszuvasrfppgecnwe`
- **Region:** `us-west-1`
- **Pooler hostname:** `aws-0-us-west-1.pooler.supabase.com:6543` (transaction pooler)
- **Environments:** one. No staging. No branch-based preview DBs. Pushes to `main` hit production.

There is no `supabase/config.toml` in the repo — project is linked via the CLI's account-level state (`supabase link --project-ref ryteszuvasrfppgecnwe`), not a committed config file.

## npm Scripts

Current `package.json` scripts:

```json
{
  "dev":   "next dev",
  "build": "next build",
  "start": "next start",
  "lint":  "eslint"
}
```

**Missing (tech debt):**

- `typecheck` — should run `tsc --noEmit`. Currently must invoke manually.
- `test` — should run `vitest run`. Currently must invoke via `npx vitest run`.
- `sentinel` — pre-deploy gate. Suggested chain: `tsc --noEmit && eslint && vitest run && next build`.

Adding these three scripts is a no-risk win. Until they exist, CI is `npm run lint` only.

## Manual Operations

### Run tests

```bash
npx vitest run          # single run (CI-style)
npx vitest              # watch mode
npx vitest run lib/__tests__/health-score.test.ts  # single file
```

Four test files live in `lib/__tests__/`: `health-score.test.ts`, `projected-score.test.ts`, `forecast.test.ts`, `narrative.test.ts`. All pure-function tests — no DB or network mocking.

### Typecheck

```bash
npx tsc --noEmit
```

`tsconfig.json` sets `"noEmit": true` already, so this is pure type verification.

### Trigger cron manually

Against the deployed app (bypasses Vercel schedule):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://ifpa-health.vercel.app/api/cron/daily

curl -H "Authorization: Bearer $CRON_SECRET" \
  https://ifpa-health.vercel.app/api/cron/weekly
```

Both routes write a `collection_runs` row on entry and update it on exit. Check that row for status/details after the curl returns.

Against local dev:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/daily
```

### Backfill from scratch

`scripts/backfill.ts` is a one-time seed of historical data (2016–present). It pulls from the IFPA API directly (not via `lib/ifpa-client.ts`), writes to `annual_snapshots`, `monthly_event_counts`, `country_snapshots`, `overall_stats_snapshots`, and computes initial `health_scores` + `forecasts` rows.

Runbook:

1. Decide your reset scope. If rebuilding a specific table, truncate it first in the Supabase SQL Editor:
   ```sql
   truncate table annual_snapshots restart identity cascade;
   ```
2. Ensure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`.
3. Run it:
   ```bash
   npx tsx scripts/backfill.ts
   ```
4. Hit `/api/cron/daily` once to regenerate the latest `health_scores` + `forecasts` row:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/daily
   ```

The script logs the Supabase URL it's writing to (`scripts/backfill.ts:94`) — sanity-check that before it starts.

### Recompute latest score without waiting for cron

After editing `lib/health-score.ts`:

```bash
npx tsx scripts/recompute-v2-score.ts
```

Reads the latest two complete-year rows from `annual_snapshots`, computes a v2 score, and rewrites today's `health_scores` row. Idempotent.

### Recompute latest forecast without waiting for cron

After editing `lib/forecast.ts` or `lib/collectors/forecaster.ts`:

```bash
npx tsx scripts/recompute-forecast.ts
```

Delegates to `runForecaster()` from `lib/collectors/forecaster.ts` and prints the result JSON. Use after a forecast math change or when you want the freshest projection without waiting for 08:00 UTC.

## Migration Flow

Migrations live in `supabase/migrations/` as sequentially-numbered SQL files. There are two as of this writing (`001_initial_schema.sql`, `002_forecast_player_columns.sql`). Not squashed.

Standard flow:

1. Write `supabase/migrations/NNN_description.sql`. Next number, snake-case description.
2. Preview:
   ```bash
   supabase db push --linked --dry-run
   ```
3. Apply:
   ```bash
   supabase db push --linked
   ```

**Pooler timeout escape hatch.** If the DDL is heavy (large index rebuild, table rewrite on a populated table), `supabase db push` routes through the pooler and will hit its hard statement timeout. Workaround: copy the SQL into the Supabase Dashboard SQL Editor and run it there — the Dashboard bypasses the pooler's timeout for DDL. Still commit the migration file so the history stays authoritative.

**Migration drift.** No squash or baseline. Fine at 2 files; revisit around 20.

## Deployment

- **Single environment.** `main` → production at `https://ifpa-health.vercel.app`.
- **Vercel auto-deploys** on every push to `main`. No preview environments used.
- **No staging.** Small scope, single operator, low blast radius. If the dashboard breaks for a day, nobody's calling.
- **Rollback** is a Vercel dashboard action (promote a prior deployment) — there is no blue/green or feature-flag layer.

Build command is `next build`. Output is standard Next.js (App Router). Environment variables are set in the Vercel project dashboard; they mirror `.env.local` one-to-one.

## Quick Reference

| Need | Command |
|---|---|
| Start dev | `npm run dev` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Run tests | `npx vitest run` |
| Build | `npm run build` |
| Trigger daily cron | `curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/daily` |
| Trigger weekly cron | `curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/weekly` |
| Seed fresh DB | `npx tsx scripts/backfill.ts` |
| Recompute latest score | `npx tsx scripts/recompute-v2-score.ts` |
| Recompute latest forecast | `npx tsx scripts/recompute-forecast.ts` |
| Preview migration | `supabase db push --linked --dry-run` |
| Apply migration | `supabase db push --linked` |
