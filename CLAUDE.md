# IFPA Health

<!-- swarm-last-run: 2026-04-17 -->

## What This Project Is

A single-page public dashboard that answers one question: is competitive pinball growing or dying? It pulls data from the IFPA (International Flipper Pinball Association) API on a daily + weekly schedule, stores snapshots in Supabase, and renders a "pulse check" — a composite health score (0–100), a narrative sentence, three answer cards (players, retention, tournaments), and a detail drawer with breakdowns. No users, no auth, no comments. Read-only for the public.

Live at https://ifpa-health.vercel.app.

## Tech Stack

- **Framework:** Next.js 16.1 (App Router, React 19, Server Components)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`) + shadcn/ui primitives via `radix-ui`
- **Database:** Supabase PostgreSQL (project `ryteszuvasrfppgecnwe`, us-west-1)
- **Icons:** lucide-react
- **Dates:** date-fns
- **Testing:** Vitest 4 (unit tests for score, forecast, narrative)
- **Hosting:** Vercel (frontend + cron)
- **Charts:** Custom SVG sparklines (no Recharts — removed in v2 redesign)

Project is a lean single-page app. No Playwright, no Redis, no auth, no CMS, no user-generated content.

## Architecture Overview

See `docs/architecture.md` for the full deep dive.

Three layers, straight line:

1. **Collection (cron → collectors → Supabase).** Vercel cron hits `/api/cron/daily` at 08:00 UTC and `/api/cron/weekly` Mondays at 09:00 UTC. Each route auth-checks against `CRON_SECRET`, writes a `collection_runs` row (`status='running'`), runs the relevant collectors, and updates the row on completion. Daily runs collectors sequentially and fails fast on any throw (`status=error`). Weekly runs each collector in a per-task `.catch()` and flips to `status=partial` if some succeed and some fail — or `success`/`error` for the clean outcomes. Collectors live in `lib/collectors/` and each own one or two Supabase tables.

2. **Compute (health-scorer + forecaster).** After each daily run, `health-scorer.ts` reads `annual_snapshots` + `monthly_event_counts` and writes a v2 composite score to `health_scores` (3 equally-weighted pillars: players, retention, tournaments). `forecaster.ts` reads partial-year monthly data and writes a seasonal-ratio projection (with 68%/95% CIs) to `forecasts`.

3. **Render (server component → UI).** `app/page.tsx` is a Server Component with `revalidate = 3600`. It fetches latest rows from 6 tables in parallel, computes a few page-local derivations (lifecycle waterfall, country growth, sparkline arrays), and renders: gauge → projected gauge → narrative → three answer cards → detail drawer. No client data fetching. Dark-first theme with `ThemeToggle` class-based opt-in light variant.

**Two Supabase client types** (`lib/supabase.ts`):

| Client | Function | Usage |
|---|---|---|
| Public (anon) | `createPublicClient()` | Server Component reads. Browser-safe. |
| Service | `createServiceClient()` | Cron routes, admin routes, backfill script. Bypasses RLS. |

Page rendering uses the anon client. Cron routes and `/api/admin/*` use service. That's the entire auth story — no user sessions anywhere.

## Key Features

See `docs/features.md` for the full catalog.

- **Health gauge (0–100) with band.** Raw band enum is `thriving / healthy / stable / concerning / critical` (the scorer writes `critical`; the UI may label it differently). Count-up animation lives on `HealthScoreGauge` only; `ProjectedGauge` is a Server Component with no animation.
- **Projected gauge.** Same score applied to forecast data. Shown when a projection exists.
- **Narrative sentence.** Template-based (no AI), deterministic, generated from the health score result. See `lib/narrative.ts`.
- **Three answer cards** with sparklines:
  - Players — "Are more people playing?" (unique_players YoY)
  - Retention — "Are they coming back?" (retention_rate, pp delta)
  - Tournaments — "Is there more to compete in?" (tournament count YoY)
- **Detail drawer** (native `<details>`/`<summary>` with localStorage persistence):
  - Year-by-year table
  - Monthly pulse (12-month YoY bars)
  - Country growth list
  - Player lifecycle waterfall (returning / churned / new)
  - Forecast card (CIs, months of data, prior-year comparison)
- **Data freshness badge** reads `collection_runs.completed_at` of the latest row (48h stale threshold).
- **Admin routes** (unauthed, obscure paths) for observations + methodology calibration.

## Project Structure

```
app/
  page.tsx                # The dashboard (Server Component)
  layout.tsx              # Root layout + theme script
  globals.css             # Tailwind v4 theme tokens (oklch, dark-first)
  api/
    cron/
      daily/route.ts      # 08:00 UTC: daily + health-scorer + forecaster
      weekly/route.ts     # Mon 09:00 UTC: annual + monthly + country
    admin/
      observations/       # Ground-truth label CRUD
      calibrate/          # Methodology version + shadow-score runner

components/               # 12 components — gauge, sparkline, cards, drawer pieces
  ui/                     # shadcn primitives

lib/
  supabase.ts             # 2 clients (anon + service)
  ifpa-client.ts          # Typed IFPA API wrapper (stats, events_by_year, players_by_year, country_players, rankings/wppr)
  health-score.ts         # V2 scorer (3 pillars)
  projected-score.ts      # Health score applied to forecast
  forecast.ts             # Seasonal-ratio projection with CIs
  narrative.ts            # Template-based sentence engine
  utils.ts                # cn() + misc
  collectors/             # 6 collectors (daily, annual, monthly, country, health-scorer, forecaster)
  __tests__/              # Vitest: forecast, health-score, narrative, projected-score

supabase/
  migrations/             # 2 SQL files (001_initial_schema, 002_forecast_player_columns)

scripts/                  # One-off ops: backfill.ts, recompute-v2-score.ts, recompute-forecast.ts
```

## How to Run Locally

1. **Prereqs:** Node.js 20+, npm.
2. **Clone and install:** `npm install`
3. **Environment:** copy existing `.env.local` or set the four required vars (see below).
4. **Dev:** `npm run dev` → http://localhost:3000

There is no seed step — the dashboard reads whatever is already in Supabase. For a fresh DB, run `npx tsx scripts/backfill.ts` against the target project.

## CLI Commands

```bash
npm run dev              # Dev server
npm run build            # Production build
npm run lint             # ESLint
npx vitest run           # Unit tests (forecast, health-score, narrative, projected-score)
npx vitest               # Watch mode

# Ops / scripts (run with tsx)
npx tsx scripts/backfill.ts              # Seed historical data from IFPA API
npx tsx scripts/recompute-v2-score.ts    # Rewrite latest health_scores using current scorer
npx tsx scripts/recompute-forecast.ts    # Rewrite latest forecast from stored data

# Supabase (linked project: ryteszuvasrfppgecnwe)
supabase db push --linked --dry-run      # Preview migration
supabase db push --linked                # Apply migration

# Cron (manual trigger against deployed URL)
curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/daily
curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/weekly
```

There is no `sentinel` script yet — the project has no typecheck or test gate in CI. If one is added, match the pattern: `tsc --noEmit && eslint && vitest run && next build`.

## Code Conventions

See `docs/patterns-and-conventions.md` for canonical files and full rules.

- **Server Components by default.** `"use client"` only on `ThemeToggle`, `DetailDrawer`, and `HealthScoreGauge` (for the count-up animation). `ProjectedGauge` and everything else render on the server. No client-side data fetching.
- **Page-local derivations live in `app/page.tsx`.** This project is small enough that splitting compute into `lib/queries/*` would be premature. If a derivation is reused or tested, it earns a spot in `lib/`.
- **Collectors return `{ records_affected, details }`.** Cron routes aggregate these into the `collection_runs` row. Never throw quietly — always surface errors so the row flips to `error` with a message.
- **IFPA API response mismatches.** The real API fields differ from published docs. Known deltas:
  - `events_by_year`: response key `stats` (not `events_by_year`), fields `tournament_count` / `player_count` (singular)
  - `players_by_year`: response key `stats`, fields `count` / `previous_year_count` (`count` is the current-year value despite the name)
  - `country_players`: response key `stats` (not `country_list`), field `player_count` (not `count`)
  - `stats/overall`: age nested under `stats.age`, keys like `age_18_to_29`
  - `rankings/wppr`: `name` (full), `current_rank`, `rating_value`
  - See session 2 in `NOTES.md` — these are encoded in `lib/ifpa-client.ts`.
- **Use last COMPLETE year for metric cards.** The current year is partial and YoY comparisons against a partial year look like a 90%+ crash. Filter with `year < currentYear` before taking `latestYear`.
- **Health score is v2 (3 pillars).** `computeHealthScore()` in `lib/health-score.ts`. Breakpoints: players/tournaments `[-10→0, 0→50, 15→100]`, retention `[25→0, 35→50, 50→100]`.
- **Narrative is template-based, not AI.** Fast, deterministic, no API calls. Spread threshold is `< 8` (tuned for real data, lower than the original spec's `< 15`).
- **Dark-first CSS.** `globals.css` uses oklch tokens; `.light` is the opt-in variant. Functional color tokens (`--up`, `--down`, `--flat`) instead of hard-coded hex.
- **ISR with 1-hour revalidate.** `export const revalidate = 3600` on the root page.
- **DB convention:** `snake_case` columns, `bigint generated always as identity` PKs, `timestamptz` everywhere, `created_at` / `collected_at` on every table. Generated columns for `retention_rate` and `avg_attendance`.
- **Migrations are cumulative, not squashed.** 2 files as of this writing.

## Common Tasks

**Add a new data source (e.g., a new IFPA endpoint):**
1. Add a typed wrapper in `lib/ifpa-client.ts`
2. Create a collector in `lib/collectors/{name}-collector.ts` — return `{ records_affected, details }`
3. Wire it into `app/api/cron/daily/route.ts` or `weekly/route.ts`
4. Migration: new table in `supabase/migrations/NNN_*.sql`
5. If it affects the health score, edit `lib/health-score.ts` and add a test in `lib/__tests__/`

**Adjust the health score:**
1. Edit breakpoints or weights in `lib/health-score.ts`
2. Update `lib/__tests__/health-score.test.ts` fixtures
3. Run `npx tsx scripts/recompute-v2-score.ts` to rewrite the latest row (don't wait for the next cron)

**Tweak the narrative:**
1. Edit `lib/narrative.ts` (template conditions)
2. Update `lib/__tests__/narrative.test.ts`
3. No recompute needed — narrative is generated at render time

**Reseed from scratch:**
1. Truncate tables you want to rebuild
2. `npx tsx scripts/backfill.ts` — pulls historical data from IFPA
3. Trigger `/api/cron/daily` once to recompute scores and forecasts

**Apply a DB migration:**
1. Write `supabase/migrations/NNN_description.sql`
2. `supabase db push --linked --dry-run` to preview
3. `supabase db push --linked` to apply
4. If the DDL would hit the pooler timeout on a large table, run it in the Supabase Dashboard SQL Editor instead

## Environment Variables

See `docs/setup-and-config.md` for grep-verified detail, Vercel setup, and manual ops commands.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key (server-component reads) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Bypasses RLS. Cron + admin + scripts only. |
| `IFPA_API_KEY` | Yes | IFPA v2 API key |
| `CRON_SECRET` | Yes | Shared secret for `/api/cron/*` bearer auth |

All vars are loaded via `process.env.*` directly — no Zod validation layer yet. If the project grows, add one in `lib/env.ts`.

## Database Schema

11 tables, all in the `public` schema. See `docs/schema-reference.md` for per-table column lists, indexes, and collector ownership. `supabase/migrations/001_initial_schema.sql` is the canonical DDL.

- **Snapshots (4):** `annual_snapshots`, `monthly_event_counts`, `overall_stats_snapshots`, `country_snapshots`
- **Rankings (1):** `wppr_rankings`
- **Outputs (2):** `health_scores`, `forecasts`
- **Calibration (2):** `observations` (ground truth), `methodology_versions` (+ `shadow_scores` for backtests)
- **Ops (1):** `collection_runs`

Generated columns:
- `annual_snapshots.avg_attendance` = `player_entries / tournaments`
- `annual_snapshots.retention_rate` = `returning_players / unique_players * 100`

RLS is enabled on all tables with permissive anon read. Writes are service-role only.

## Deployment

```
Local dev       -> localhost:3000      -> Supabase production (only environment)
main branch     -> ifpa-health.vercel.app -> Supabase production
```

Single environment. No staging. Small enough that changes go main → prod.

**Vercel:** auto-deploys on push to `main`. Cron config in `vercel.json` (2 jobs, both `maxDuration: 300`).

**Supabase:** project `ryteszuvasrfppgecnwe` in `us-west-1`. Connection via pooler at `aws-0-us-west-1.pooler.supabase.com:6543`.

## Key Decisions

- **V2 redesign (Feb 2026):** 6-component score → 3-pillar score. Added narrative + detail drawer. Dropped Recharts (1,340 lines removed). Dark-first.
- **Single viewport.** Whole dashboard fits without scrolling on desktop. Detail drawer is opt-in.
- **Template narrative, not AI.** Deterministic, zero cost, tested.
- **No user features.** Public read-only. If we ever want ratings/comments, that's a different app.
- **No staging.** Small scope, single operator, low blast radius. If the dashboard breaks for a day, nobody's calling.
- **Freshness badge uses `collection_runs.completed_at`** (not `started_at`). 48-hour stale threshold.
- **Complete-year filter everywhere.** Partial current year is excluded from trend charts and YoY math — it's only surfaced in the forecast path.

## Testing & Ops

See `docs/testing-and-ops.md` for Vitest inventory (29 tests across 4 files — health-score 14, narrative 7, projected-score 5, forecast 3), cron observability via `collection_runs`, and script runbooks.

## Known Issues & Tech Debt

- **No typecheck or test gate.** `npm run lint` is the only CI-eligible check. Adding a `sentinel` script is a good next step.
- **`.env.local` has trailing `\n` characters** on several values (`IFPA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`). `lib/ifpa-client.ts` defensively `.trim()`s `IFPA_API_KEY`, but no other reader does. Fix at the source.
- **No `.env.example` file.** Contributors have to reverse-engineer the var list from code.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY` + anon RLS read all the things.** Fine today (data is public), but if anything sensitive lands in a table, RLS needs a real policy review.
- **Admin routes share `CRON_SECRET` with cron.** `/api/admin/observations` and `/api/admin/calibrate` auth against the same bearer token as `/api/cron/*`. Fine today but split to a separate `ADMIN_SECRET` before publishing admin URLs, and switch the compare to `crypto.timingSafeEqual` (currently plain `!==`).
- **Scripts directory has no index.** `scripts/` has ops scripts with no README. Each script is self-describing in its top comment.
- **Two-migration schema.** No squash or baseline. Will become a problem if it gets to 20+.
- **Country growth compares first snapshot to latest** — not truly "growth over N days," more "growth since we started tracking." Document when a real window is requested.

## External Dependencies & Integrations

| Service | Purpose |
|---------|---------|
| IFPA API (`api.ifpapinball.com/v2`) | Source of truth for all data |
| Supabase | Database, RLS |
| Vercel | Frontend hosting + cron |

No webhooks, no external auth providers, no third-party analytics, no error tracking. If errors matter, add Sentry.

## Maintenance Processes

Each process doc is self-contained. Read the linked file to run it.

| Process | Trigger | Output | Link |
|---------|---------|--------|------|
| Documentation Swarm | "Run the doc swarm" | `docs/` + `CLAUDE.md` | [docs/process/documentation-swarm.md](docs/process/documentation-swarm.md) |
| Code Health Sweep | "Run all 5 passes of the code health sweep" | `_refactor/` | [docs/process/code-health-sweep.md](docs/process/code-health-sweep.md) |
| Frontend Audit | "Run all 5 passes of the frontend audit" | `_audit/` | [docs/process/frontend-audit.md](docs/process/frontend-audit.md) |
| Security Scan | "Run all 4 passes of the security scan" | `_security/` | [docs/process/security-scan.md](docs/process/security-scan.md) |
| Database Audit | "Run all 5 passes of the database audit" | `_db-audit/` | [docs/process/database-audit.md](docs/process/database-audit.md) |

## Session Notes

- Read `NOTES.md` at the start of each session for past decisions, bugs, and plans
- Update `NOTES.md` at the end of each session with new decisions, bugs encountered, changes made, or ideas discussed
- Commit and push updated notes

## Key Files

- `NOTES.md` — Session history (authoritative for "why is it like this")
- `PLAN.md` — Original phase plan (historical, mostly complete)
- `app/page.tsx` — The dashboard (read this first to understand rendering)
- `lib/health-score.ts` — V2 scorer (the math behind the gauge)
- `lib/narrative.ts` — Template sentence engine
- `lib/ifpa-client.ts` — API wrapper with the known field-name fixes baked in
- `supabase/migrations/001_initial_schema.sql` — Canonical schema
- `docs/architecture.md` — Full architecture deep dive
- `docs/features.md` — Complete feature catalog
- `docs/patterns-and-conventions.md` — Code patterns, canonical files, tech debt
- `docs/setup-and-config.md` — Env vars, Vercel setup, manual ops
- `docs/schema-reference.md` — Per-table reference with ownership map
- `docs/testing-and-ops.md` — Vitest inventory, cron observability, scripts
