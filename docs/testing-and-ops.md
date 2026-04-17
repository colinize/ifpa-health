# Testing & Operations

Everything you need to verify the code works and run the dashboard in production. This is the companion to [architecture.md](architecture.md) and [setup-and-config.md](setup-and-config.md) — architecture explains what the system *is*; this doc explains how to prove it *works* and keep it running.

---

## Testing Overview

- **Runner:** Vitest 4 (`vitest: ^4.0.18` in `devDependencies`).
- **Scope:** Pure-function unit tests only. Four files in `lib/__tests__/`. 29 tests total.
- **No mocking.** No Supabase stubs, no IFPA HTTP mocks, no fixture database. Every input is a literal in the test file.
- **No E2E.** No Playwright, no Cypress, no headless browser. The UI has no automated coverage.
- **No integration layer.** Collectors, cron routes, and the page component are not tested directly — only the pure compute modules they rely on.
- **No CI gate.** `npm run lint` is the only check today (see [setup-and-config.md — CI](setup-and-config.md)).

The testing philosophy: cover the math that would be expensive to debug in production (scorer breakpoints, forecast CIs, narrative edge cases) and skip the I/O glue that would require heavy mocking to test meaningfully.

---

## Vitest Inventory

### `lib/__tests__/health-score.test.ts` — 14 tests

- **Protects:** `computeHealthScore()`, `interpolate()`, `getBand()` in `lib/health-score.ts`.
- **Covers:**
  - `interpolate`: below lowest breakpoint clamps to 0, above highest clamps to 100, exact-breakpoint match, mid-segment linear interpolation.
  - `getBand`: the 5 band thresholds (`thriving >= 80`, `healthy 65-79`, `stable 50-64`, `concerning 35-49`, `critical 0-34`).
  - `computeHealthScore`: strong-growth scenario lands in `healthy`, severe decline lands in `critical`, all-strong lands in `thriving`, neutral inputs (0% YoY, 35% retention) produce ~50 (proves equal-weight pillar math), `methodology_version` defaults to 2.
- **Edge cases:** equal-pillar weighting is implicit — the neutral-input test is the only assertion that would fail if someone accidentally re-weighted the pillars.

### `lib/__tests__/narrative.test.ts` — 7 tests

- **Protects:** `generateNarrative()` in `lib/narrative.ts`.
- **Covers:**
  - Output always starts with `"Competitive pinball"`.
  - Band-to-phrase mapping: `healthy` band produces `"growing steadily"`, `concerning` band produces `"showing signs of strain"`.
  - Strongest-signal pillar is surfaced in the sentence (tournaments, in the default fixture).
  - Em-dash (`\u2014`) is present — narrative structure contract.
  - Output ends with a period.
  - All-similar scores (within the `< 8` spread threshold) produce the combined `"all three indicators"` phrasing.
- **Edge cases:** the spread-threshold test is the load-bearing one — lowering the threshold below 8 would flip this test.

### `lib/__tests__/forecast.test.ts` — 3 tests

- **Protects:** `computeForecast()` and `computeMonthlyWeights()` in `lib/forecast.ts`.
- **Covers:**
  - Happy-path projection: synthetic 4-year dataset with even monthly distribution, verifies projected players + returning players are positive, players > returning, and 68% CI bounds bracket the point estimate.
  - `completedMonths < 2` short-circuits — projections and CI bounds all return 0 (don't forecast from one month of data).
  - Zero YTD players is handled gracefully — player projections return 0 but tournament/entry projections still work.
- **Edge cases:** the "2-month minimum" gate is the critical one. Without it, a forecast from 1 month of data would hallucinate a full year.

### `lib/__tests__/projected-score.test.ts` — 5 tests

- **Protects:** `computeProjectedScore()` in `lib/projected-score.ts`.
- **Covers:**
  - Happy path: forecast + prior-year anchors produces a score in [0, 100] with a valid band label.
  - CI low/high bracket the projected score.
  - Returns `null` when the forecast has no player projection (`projected_players === 0`).
  - Returns `null` when `months_of_data < 2`.
  - Strong-growth fixture (+15.8% players, 40% retention, +16.7% tournaments) produces a score > 70 in the `thriving` band.
- **Edge cases:** the two `null`-return tests are what prevent the projected gauge from rendering with garbage data.

---

## How to Run Tests

```bash
npx vitest run              # Run all tests once, exit. Use this in CI.
npx vitest                  # Watch mode. Re-runs on file save.
npx vitest run path/to/test # Run a single file
npx vitest run --coverage   # Coverage report (not configured by default)
```

`package.json` has no `test` script. Adding one is a known tech-debt item (see below).

Expected output on a clean run:

```
Test Files  4 passed (4)
     Tests  29 passed (29)
```

---

## Typecheck

```bash
npx tsc --noEmit
```

No npm script wraps this. Next.js type-checks during `npm run build`, so a successful build implies a successful typecheck — but there's no pre-commit or pre-deploy enforcement.

---

## Lint

```bash
npm run lint
```

This is the only command currently eligible to serve as a CI gate. It runs ESLint via `eslint-config-next`.

---

## Cron Observability

`collection_runs` is the entire observability story. There is no Sentry, no external monitoring, no log aggregator, no alerting. If something breaks, you find out by looking at the dashboard's data-freshness badge or by querying the table.

Each cron invocation writes one row:

| Column | Values | Notes |
|---|---|---|
| `run_type` | `daily` \| `weekly` | Which endpoint fired |
| `status` | `running` → `success` \| `error` \| `partial` | Flipped at end of run |
| `started_at` | timestamptz | Set on row insert |
| `completed_at` | timestamptz | Null while running |
| `records_affected` | int | Sum across all collectors in the run |
| `error_message` | text \| null | Populated on failure |
| `details` | jsonb | Per-collector `details` payloads |

**Weekly cron is fault-tolerant:** annual/monthly/country collectors run independently. If one throws, the row is marked `partial` (not `error`) and the other two still write their data. See `app/api/cron/weekly/route.ts` for the pattern.

**Daily cron is fail-fast:** the three collectors (daily → health-scorer → forecaster) run in sequence and the first error bubbles out. The row flips to `error` with the exception message.

### Reading the table

Query the latest 10 runs from Supabase SQL editor:

```sql
select run_type, status, started_at, completed_at,
       records_affected, error_message
from collection_runs
order by started_at desc
limit 10;
```

### If `status` is stuck on `running`

The cron crashed partway through without hitting the `catch` block — usually a Vercel function timeout at 300s. Trigger manually (see below) and watch the response.

---

## Data-Freshness Signal

The badge on the dashboard reads `collection_runs.started_at` for the latest successful run. If that timestamp stops advancing, cron has drifted.

Mental model: no new row in the last 25 hours = daily cron missed a day. No new row in the last 8 days = weekly cron missed a week.

There is no automated alerting on this — the freshness badge is the only surface. Check it when you visit the dashboard.

---

## Triggering Cron Manually

Both endpoints accept a Bearer-auth GET. The header must exactly match `Bearer ${CRON_SECRET}`.

```bash
# Daily: runs daily-collector + health-scorer + forecaster
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://ifpa-health.vercel.app/api/cron/daily

# Weekly: runs annual + monthly + country collectors (independently)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://ifpa-health.vercel.app/api/cron/weekly
```

Both write a `collection_runs` row the same way Vercel cron does. Use this for manual backfill runs, post-deploy smoke checks, or to force a score recompute.

Local equivalent (against the dev server): replace the URL with `http://localhost:3000/...`.

---

## Ops Scripts

Three scripts in `scripts/`. No README — each self-describes in its top comment. All three load `.env.local` via dotenv before importing anything that reads env vars.

### `scripts/backfill.ts` — seed historical data

```bash
npx tsx scripts/backfill.ts
```

**When to run:**
- Fresh Supabase project (first-time setup)
- After truncating a snapshot table
- When IFPA historical fields change and you need to rewrite everything

**What it does:** pulls 2016-present from the IFPA API and writes to all snapshot tables, then computes an initial `health_scores` + `forecasts` row. Safe to run repeatedly — existing rows get upserted.

### `scripts/recompute-v2-score.ts` — rewrite latest health score

```bash
npx tsx scripts/recompute-v2-score.ts
```

**When to run:** after editing breakpoints, weights, or band thresholds in `lib/health-score.ts` and you don't want to wait for the next daily cron.

**What it does:** reads the latest two complete years from `annual_snapshots`, feeds them into `computeHealthScore()`, writes a new row to `health_scores` dated today.

### `scripts/recompute-forecast.ts` — rewrite latest forecast

```bash
npx tsx scripts/recompute-forecast.ts
```

**When to run:** after editing seasonal-ratio logic or CI math in `lib/forecast.ts`.

**What it does:** delegates to `runForecaster()` — the same function the daily cron calls. Identical behavior; this is just a shortcut to trigger it without hitting the cron endpoint.

---

## Admin Endpoints as Ops

Two admin routes exist under `/api/admin/`. They aren't UI — they're JSON endpoints you call with curl when calibrating the methodology.

| Endpoint | Purpose |
|---|---|
| `/api/admin/observations` | CRUD for ground-truth labels (`observations` table). Used when tagging a historical year as "this is what healthy looked like." |
| `/api/admin/calibrate` | Runs methodology calibration — backtests alternative scorer versions against observations, writes results to `shadow_scores`. |

Both auth via `Bearer ${CRON_SECRET}` — the same secret the cron uses. This is tech debt:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://ifpa-health.vercel.app/api/admin/observations
```

See "Tech Debt" below for the split-to-`ADMIN_SECRET` and `timingSafeEqual` notes.

---

## Known Ops Gaps / Tech Debt

Honest list — all surfaced elsewhere (`CLAUDE.md`, `NOTES.md`) but consolidated here:

- **No CI test gate.** `npm run lint` is the only check eligible to block a deploy today. Vitest runs only on demand. A `sentinel`-style script (`tsc --noEmit && eslint && vitest run && next build`) would fix this in ~10 lines of `package.json`.
- **No `test` script in `package.json`.** Tests run via `npx vitest run`. Adding `"test": "vitest run"` is trivial and overdue.
- **Admin routes share `CRON_SECRET`.** `/api/admin/observations` and `/api/admin/calibrate` authenticate against the same bearer token as `/api/cron/*`. Split to `ADMIN_SECRET` before exposing admin URLs to anyone besides the operator.
- **Bearer check uses `!==` not `crypto.timingSafeEqual`.** Timing-attack surface exists in both cron and admin routes. Low severity while the endpoints are obscure, non-zero severity otherwise.
- **No error tracking.** No Sentry, no Logtail, no Axiom. If cron errors stop mattering to watch manually, add one.
- **Country growth compares first snapshot to latest** — not a true rolling N-day window. Document when a real window is requested (requires a migration to track country diffs per snapshot).
- **No squash/baseline migration.** Only 2 migrations exist today (`001_initial_schema.sql`, `002_forecast_player_columns.sql`), so this is fine. Will become painful at 20+ — squash before then.
- **No seed/fixture for local dev.** The dashboard reads whatever's in Supabase; there's no `scripts/seed-dev.ts`. Running `backfill.ts` against the live IFPA API is the current local-setup step. If IFPA rate-limits or goes down, dev is blocked.
- **Freshness badge has no alert.** If cron drifts, you only notice when you visit the site.

---

## Cross-References

- **Running locally, env vars, Vercel cron config:** [setup-and-config.md](setup-and-config.md).
- **Which tables cron writes to and what generated columns mean:** [schema-reference.md](schema-reference.md).
- **Collector return-shape pattern, complete-year filtering:** [patterns-and-conventions.md](patterns-and-conventions.md).
- **Process docs (doc swarm, security scan, frontend audit, etc.):** `docs/process/`.
