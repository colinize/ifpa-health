# Architecture

Reference for how IFPA Health is wired end to end. For the high-level project description, see `CLAUDE.md`. For the "why" behind specific choices, see `NOTES.md`.

## Mental Model

A one-page public dashboard backed by a tiny ETL. Vercel cron pulls data from the IFPA API v2, six collectors write normalized snapshots into 11 Supabase tables, two pure-function computers (scorer, forecaster) derive outputs, and a single Server Component (`app/page.tsx`) renders everything with ISR. No users, no auth, no client data fetching — the browser receives pre-rendered HTML and the only interactivity is a theme toggle, a detail drawer, and a count-up gauge.

## Tech Stack

| Layer | Tech | Version |
|---|---|---|
| Framework | Next.js (App Router, RSC) | `16.1.6` |
| Runtime | React / React DOM | `19.2.3` |
| Language | TypeScript | `^5` |
| Styling | Tailwind CSS + `@tailwindcss/postcss` | `^4` |
| Animation | `tw-animate-css` | `^1.4.0` |
| UI primitives | `radix-ui` (shadcn-style) | `^1.4.3` |
| Icons | `lucide-react` | `^0.563.0` |
| Dates | `date-fns` | `^4.1.0` |
| Utils | `clsx`, `tailwind-merge`, `class-variance-authority` | `^2.1.1` / `^3.4.0` / `^0.7.1` |
| DB SDK | `@supabase/supabase-js` | `^2.95.1` |
| Postgres (scripts) | `postgres` | `^3.4.8` |
| Env loader (scripts) | `dotenv` | `^17.2.3` |
| Tests | `vitest` | `^4.0.18` |
| Script runner | `tsx` | `^4.21.0` |
| Lint | `eslint` + `eslint-config-next` | `^9` / `16.1.6` |
| Hosting | Vercel | — |
| Database | Supabase PostgreSQL (`ryteszuvasrfppgecnwe`, `us-west-1`) | — |

Source: `package.json`. No Recharts (removed in v2 redesign — see NOTES.md session 5). No auth libraries, no Sentry, no analytics.

## Directory Map

```
app/
  layout.tsx                         # Root layout + theme bootstrap
  page.tsx                           # The dashboard — Server Component, revalidate = 3600
  globals.css                        # Tailwind v4 tokens (oklch, dark-first)
  favicon.ico
  api/
    cron/
      daily/route.ts                 # 08:00 UTC: daily collector + scorer + forecaster
      weekly/route.ts                # Mon 09:00 UTC: annual + monthly + country
    admin/
      observations/                  # Ground-truth label CRUD (unauthed, obscure path)
      calibrate/                     # Methodology version + shadow-score runner

components/                          # 12 custom components (see note below)
  answer-card.tsx                    # One of three metric cards (players/retention/tournaments)
  country-growth.tsx                 # Drawer: country growth list
  data-freshness.tsx                 # Header badge — reads latest collection_runs
  detail-drawer.tsx                  # 'use client' — drawer with localStorage persistence
  health-score-gauge.tsx             # 'use client' — count-up gauge animation
  monthly-pulse.tsx                  # Drawer: 12-month YoY bars
  narrative-display.tsx              # Template-based sentence
  player-lifecycle.tsx               # Drawer: returning/churned/new waterfall
  projected-gauge.tsx                # Server component gauge for forecast score
  sparkline.tsx                      # Custom SVG sparkline (no chart lib)
  theme-toggle.tsx                   # 'use client' — dark/light toggle
  year-table.tsx                     # Drawer: year-by-year table
  ui/                                # shadcn primitives (tooltip, separator)

lib/
  supabase.ts                        # Two client factories (anon + service role)
  ifpa-client.ts                     # Typed IFPA API v2 wrapper (field-name fixes baked in)
  health-score.ts                    # V2 three-pillar scorer (pure function)
  projected-score.ts                 # Scorer applied to forecast output
  forecast.ts                        # Seasonal-ratio projection + CI math
  narrative.ts                       # Deterministic template sentence engine
  utils.ts                           # cn() + misc
  collectors/                        # 6 collectors — see Data Flow
    daily-collector.ts
    annual-collector.ts
    monthly-collector.ts
    country-collector.ts
    health-scorer.ts
    forecaster.ts
  __tests__/                         # Vitest — 4 pure-function test files
    health-score.test.ts
    projected-score.test.ts
    forecast.test.ts
    narrative.test.ts

supabase/
  migrations/                        # Cumulative, not squashed (2 files)
    001_initial_schema.sql
    002_forecast_player_columns.sql

scripts/                             # One-off ops, run via `npx tsx`
  backfill.ts                        # Seed historical data from IFPA
  recompute-v2-score.ts              # Rewrite latest health_scores row
  recompute-forecast.ts              # Rewrite latest forecasts row
  migrate-002.cjs                    # CJS helper for migration 002
```

Component note: `components/` contains 12 files plus `components/ui/` (shadcn primitives — excluded from the "12 components" count in CLAUDE.md).

## Data Flow

End-to-end path for any metric on the dashboard:

1. **Vercel cron** fires `GET /api/cron/{daily,weekly}` with `Authorization: Bearer $CRON_SECRET`.
2. **Route handler** (`app/api/cron/.../route.ts`) auth-checks the bearer, inserts a `collection_runs` row with `status = 'running'`, then awaits its collectors.
3. **Collector** (in `lib/collectors/`) calls the typed IFPA wrapper (`lib/ifpa-client.ts`), which patches known response-shape mismatches (response key `stats`, singular `tournament_count`, etc. — see `docs/patterns-and-conventions.md` for the full list).
4. **Collector upserts** one or two Supabase tables via the service-role client. Every collector returns `{ records_affected, details }` — it never throws silently.
5. **Route handler** aggregates all collector results and updates the `collection_runs` row to `success`, `error`, or `partial` (weekly only), with a `details` JSON blob.
6. **`app/page.tsx`** — the Server Component — runs six parallel `supabase.from(...).select(...)` queries via the anon client (wrapped in `Promise.all`), derives page-local state (sparkline arrays, lifecycle waterfall, country growth), and renders React.
7. **Vercel Edge** serves the rendered HTML. `revalidate = 3600` means the page is regenerated at most once an hour.

## Cron Architecture

Defined in `vercel.json`:

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

**Daily** (`app/api/cron/daily/route.ts`) runs three collectors **in sequence**: `runDailyCollection` → `runHealthScorer` → `runForecaster`. Any thrown error fails the whole run; the `collection_runs` row flips to `status='error'` with `error_message`.

**Weekly** (`app/api/cron/weekly/route.ts`) runs `runAnnualCollection`, `runMonthlyCollection`, `runCountryCollection` **independently** with `.catch()` wrappers. Status is `success` (0 failures), `partial` (1–2 failures), or `error` (all 3 failed). This is the only place the `partial` status is used.

**Auth.** Both routes check `request.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\`` with a plain `===` compare. No `crypto.timingSafeEqual` — tracked as tech debt in `CLAUDE.md`.

**Status tracking pattern.** Every cron invocation writes one row to `collection_runs`:

```
INSERT (run_type, status='running', started_at)
-> run collectors
-> UPDATE (status, completed_at, records_affected, details, [error_message])
```

This row is the entire observability story. The dashboard header badge reads the latest `started_at` as "data freshness."

**Manual trigger:** `curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/daily`.

## Compute Layer

Both computers live in `lib/` as pure functions and are invoked by dedicated collectors in `lib/collectors/`. They run inside the daily cron after `runDailyCollection` completes.

**`lib/health-score.ts` (via `lib/collectors/health-scorer.ts`).** V2 three-pillar composite score. The scorer reads the two most recent **complete** years from `annual_snapshots` (filter `year < currentYear`), derives a player YoY %, retention rate, and tournament YoY %, and runs them through breakpoints: players/tournaments `[-10→0, 0→50, 15→100]`, retention `[25→0, 35→50, 50→100]`. The three pillars are equally weighted. Output is `{ composite_score (0–100), band, components, methodology_version }`, upserted into `health_scores` keyed by `score_date`. Replaced the v1 six-component weighted score in the Feb 2026 redesign (see NOTES.md session 5).

**`lib/forecast.ts` (via `lib/collectors/forecaster.ts`).** Seasonal-ratio projection for the current year. Reads `annual_snapshots` (all years) and `monthly_event_counts` (all months) via the service client, computes monthly weights from reference years `[2019, 2022, 2023, 2024, 2025]`, then projects tournaments, entries, unique players, and returning players with 68% and 95% confidence intervals. Also computes a linear trend line as a reference point. Output is upserted into `forecasts` keyed by `(forecast_date, target_year)`. This is the only path in the codebase that surfaces the partial current year.

## Rendering Architecture

- **`export const revalidate = 3600`** on `app/page.tsx` — ISR with a one-hour window. First request after the hour triggers regeneration; stale HTML is served in the meantime.
- **Server Components by default.** `app/page.tsx` runs on the server, opens a public (anon) Supabase client, runs six parallel queries, and computes all derivations locally (sparklines, lifecycle waterfall, country growth map, trend helpers).
- **No client data fetching.** The browser never talks to Supabase. All data is embedded in the initial HTML payload.
- **`"use client"` leaves (3 custom components):**
  - `components/theme-toggle.tsx` — reads/writes `localStorage` for dark/light preference.
  - `components/detail-drawer.tsx` — persists drawer open/closed state to `localStorage`.
  - `components/health-score-gauge.tsx` — count-up animation (800ms easeOutCubic) using `useEffect` + `useRef`.
- **Server components (notable):** `projected-gauge.tsx` is NOT a client component — it renders statically from props. `narrative-display.tsx`, `answer-card.tsx`, `sparkline.tsx`, and the drawer's content children (`monthly-pulse.tsx`, `year-table.tsx`, `country-growth.tsx`, `player-lifecycle.tsx`) are all server-rendered.
- **shadcn primitives** in `components/ui/` (`tooltip`, `separator`) carry their own `"use client"` directives — upstream pattern, unchanged.

## Supabase Clients

Defined in `lib/supabase.ts`. This is the entire auth story — no user sessions, no RLS beyond "anon read, service write."

| Factory | Key | Bypasses RLS | Used by |
|---|---|---|---|
| `createPublicClient()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | `app/page.tsx` (Server Component reads). Browser-safe. |
| `createServiceClient()` | `SUPABASE_SERVICE_ROLE_KEY` | Yes | `app/api/cron/*`, `app/api/admin/*`, all collectors, all `scripts/*`. Server-only. |

The service client is instantiated with `{ auth: { persistSession: false } }` since cron jobs are stateless. The anon client is instantiated with defaults — the Server Component on the root page is its only caller.

## External Services

Three. That's the whole list.

| Service | Role |
|---|---|
| IFPA API v2 (`api.ifpapinball.com/v2`) | Sole data source. Queried by `lib/ifpa-client.ts`. |
| Supabase | Postgres, RLS, pooler. Single project, no branches. |
| Vercel | Hosting + cron. |

No webhooks. No third-party analytics (no GA, no Plausible). No error tracking (no Sentry). No queues, no Redis, no CDN beyond Vercel's own. If errors start mattering, add Sentry — listed as tech debt in `CLAUDE.md`.

## Deployment Topology

```
git push origin main  ──►  Vercel build  ──►  ifpa-health.vercel.app  ──►  Supabase (ryteszuvasrfppgecnwe, us-west-1)
                                                     │
                                                     └──►  cron hits /api/cron/{daily,weekly}
                                                            with Authorization: Bearer $CRON_SECRET
```

- **Single environment.** No staging, no preview DB. `main` is production.
- **Auto-deploy** on push to `main`. PRs get Vercel preview URLs that read from the same Supabase project (so a bad PR could theoretically write via service-role — mitigated only by the fact that cron doesn't run on preview deploys).
- **Supabase pooler** at `aws-0-us-west-1.pooler.supabase.com:6543`. Migrations flow via `supabase db push --linked`; DDL that would hit pooler statement timeouts is run via the Dashboard SQL Editor.
- **No rollback tooling** beyond Vercel's built-in deployment history and re-applying a prior migration manually.

## Cross-References

- Features rendered by this architecture → `docs/features.md`
- Coding patterns that back it up → `docs/patterns-and-conventions.md`
- Env vars and setup → `docs/setup-and-config.md`
- Table-level reference → `docs/schema-reference.md`
- Tests and ops runbook → `docs/testing-and-ops.md`
- Why things are the way they are → `NOTES.md`
