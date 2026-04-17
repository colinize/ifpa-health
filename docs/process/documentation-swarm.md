# Documentation Swarm

Run this prompt to generate or update the project documentation using a multi-agent approach. Output is a maintained `CLAUDE.md` plus supporting docs in `docs/`.

This project is small (single dashboard, 2 cron routes, 11 tables, ~12 components). The swarm is calibrated for that — 6 discovery agents, 1 synthesis pass, 1 validation pass. Don't expand it.

## Run Modes

### Full Run (default)

All agents scan the entire codebase. Use for the first run, after a major rewrite (e.g. another v2-style redesign), or when `CLAUDE.md` has drifted significantly (>60 days since last swarm).

### Delta Run

Triggered by: "Run the doc swarm in delta mode" or "Refresh the docs."

Scoped to files changed since the last swarm run. Uses `git diff --stat` against the `<!-- swarm-last-run: YYYY-MM-DD -->` date in `CLAUDE.md`. Each agent receives the changed-file list and focuses analysis there. Agents still READ unchanged context (existing docs, `NOTES.md`) but only WRITE about what changed. Phase 2 merges delta findings into existing `CLAUDE.md` sections rather than rewriting from scratch. Phase 3 still validates the full `CLAUDE.md`.

### Single Agent Re-Run

Triggered by: "Re-run Agent 3 of the doc swarm."

Runs one agent, updates its output file, then re-synthesizes only that agent's corresponding `CLAUDE.md` section. Phase 3 still validates the full doc.

---

## Pre-Flight

Before Phase 1, the orchestrator must:

1. **Read `CLAUDE.md`.** It's the source of truth for what's already documented. Preserve accurate content — the existing file is already well-calibrated; don't nuke it.
2. **Read `NOTES.md`.** Session history explains the "why" behind every quirk (v2 redesign, IFPA field-name fixes, 3-pillar score rewrite). Agents must not contradict it.
3. **Check staleness.** Look for `<!-- swarm-last-run: YYYY-MM-DD -->` near the top of `CLAUDE.md`. Record the date. If absent, treat as first run.
4. **Delta scoping.** If running in delta mode, run `git diff --stat $(git log -1 --before="<swarm-last-run-date>" --format=%H)..HEAD` to build the changed-file list. Pass it to each agent as `CHANGED_FILES`.
5. **Process doc inventory.** `ls docs/process/*.md` and record the list. This feeds the Maintenance Processes table in Phase 2.
6. **Size check.** If `CLAUDE.md` exceeds 450 lines, flag sections to extract to `docs/` files. Current doc is ~280 lines — well inside budget.

**What this project does NOT have** (skip these checks — don't waste time looking):

- No `SYNC-CONTRACT.md` (no cross-project syncs)
- No Zod env validation (plain `process.env.*`)
- No Playwright, no E2E tests
- No Directus, no CMS, no M2M junctions
- No Supabase Edge Functions (all cron runs on Vercel)
- No auth, no user sessions, no RLS policies beyond "anon read, service write"

Agents MUST NOT fabricate any of the above. If a template from another project mentions them, omit the section.

---

## Phase 1: Discovery Swarm

Spawn all 6 sub-agents IN PARALLEL using the Agent tool. Each gets a focused mission and writes to a specific file in `docs/`.

### Agent 1: Architecture Mapper → `docs/architecture.md`

- Tech stack (Next.js 16 App Router, React 19 RSC, Tailwind v4, Supabase, Vitest). Version-specific.
- Directory map: `app/`, `lib/`, `lib/collectors/`, `components/`, `supabase/migrations/`, `scripts/`.
- Data flow as a numbered list: IFPA API → `ifpa-client.ts` → collector → Supabase table → `app/page.tsx` (Server Component) → HTML.
- Cron architecture: Vercel cron in `vercel.json`, two endpoints (`/api/cron/daily`, `/api/cron/weekly`), `CRON_SECRET` bearer auth, `collection_runs` status tracking.
- Compute layer: `health-scorer.ts` (v2 three-pillar score) and `forecaster.ts` (seasonal-ratio projection) run as part of the daily cron.
- Rendering: `revalidate = 3600` ISR on root page. No client data fetching. `"use client"` only on interactive leaves (ThemeToggle, DetailDrawer, Gauge count-up).
- **Two Supabase client types** in `lib/supabase.ts`: `createPublicClient()` (anon, browser-safe, used by Server Components) and `createServiceClient()` (service role, bypasses RLS, used by cron + admin + scripts). This is the entire auth story.
- External services: IFPA API v2, Supabase, Vercel. That's it. No webhooks, no third-party analytics, no error tracking.
- In delta mode: focus on new routes, new integrations, changed data flows. Verify existing architecture claims still hold.

### Agent 2: Feature Auditor → `docs/features.md`

Catalog everything the dashboard shows, top to bottom:

- **Health gauge (0–100)** with 5-band label (Thriving / Healthy / Stable / Concerning / Declining), count-up animation.
- **Projected gauge** — same score applied to forecast data. Rendered only when a projection exists.
- **Narrative sentence** — template-based (`lib/narrative.ts`), deterministic, no AI calls.
- **Three answer cards** with SVG sparklines: Players (YoY unique_players), Retention (retention_rate pp delta), Tournaments (YoY tournament count).
- **Detail drawer** (native `<details>`/`<summary>` with localStorage persistence): year-by-year table, monthly pulse (12-month YoY bars), country growth list, player lifecycle waterfall, forecast card (CIs + prior-year comparison).
- **Data freshness badge** sourced from latest `collection_runs` row.
- **Theme toggle** — dark-first with class-based `.light` opt-in variant.
- **Admin routes** (`/api/admin/observations`, `/api/admin/calibrate`) — obscure paths, currently unauthed. Note the tech-debt item from `CLAUDE.md`.

For each feature: file path, "what the user sees," current status (shipped / stale / broken). Don't invent features that don't exist in the current code.

In delta mode: catalog new/changed features only. Verify existing status claims.

### Agent 3: Pattern Analyst → `docs/patterns-and-conventions.md`

- **Server Components by default.** `"use client"` only on interactive leaves. No client data fetching anywhere.
- **Page-local derivations live in `app/page.tsx`.** Small enough that splitting into `lib/queries/*` would be premature. If a derivation is reused or tested, it earns a spot in `lib/`.
- **Collectors return `{ records_affected, details }`.** Cron routes aggregate these into the `collection_runs` row. Never throw quietly — surface errors so the row flips to `error` with a message.
- **IFPA API field-name fixes.** The real API response shape differs from published docs. All known deltas are encoded in `lib/ifpa-client.ts`:
  - `events_by_year`: response key `stats` (not `events_by_year`), fields `tournament_count` / `player_count` (singular)
  - `players_by_year`: response key `stats`, fields `current_year_count` / `previous_year_count`
  - `country_players`: response key `stats` (not `country_list`), field `player_count` (not `count`)
  - `stats/overall`: age nested under `stats.age`, keys like `age_18_to_29`
  - `rankings/wppr`: `name`, `current_rank`, `rating_value`
- **Complete-year filtering.** Current year is partial; YoY against it looks like a 90% crash. Everywhere that uses `latestYear`, filter with `year < currentYear` first. Only the forecast path surfaces the partial year.
- **Dark-first CSS.** `globals.css` uses oklch tokens, `.light` is opt-in. Functional color tokens (`--up`, `--down`, `--flat`) over hard-coded hex.
- **ISR.** `export const revalidate = 3600` on the root page.
- **DB conventions.** `snake_case` columns, `bigint generated always as identity` PKs, `timestamptz` everywhere, `created_at`/`collected_at` on every table. Generated columns for `retention_rate` and `avg_attendance`.
- **Testing pattern.** Vitest in `lib/__tests__/`. Four files: `health-score.test.ts`, `projected-score.test.ts`, `forecast.test.ts`, `narrative.test.ts`. Pure-function tests — no DB or network mocking.
- Name the **canonical file** for each pattern (e.g. `lib/health-score.ts` for breakpoint-based scoring, `lib/collectors/daily-collector.ts` for the return-shape pattern).

In delta mode: flag new deviations from these patterns.

### Agent 4: Config & Environment → `docs/setup-and-config.md`

- **Five required env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, `CRON_SECRET`. All accessed via `process.env.*` directly — no Zod layer.
- **Trailing `\n` gotcha.** `.env.local` has trailing newline characters on several values. Strip if anything fails unexpectedly.
- **Vercel cron config.** `vercel.json` declares two jobs. Daily at 08:00 UTC (`/api/cron/daily`), weekly Mondays at 09:00 UTC (`/api/cron/weekly`). Both `maxDuration: 300`.
- **Supabase project.** Ref `ryteszuvasrfppgecnwe`, region `us-west-1`. Pooler at `aws-0-us-west-1.pooler.supabase.com:6543`. Only one environment — no staging.
- **Local dev.** `npm install`, populate `.env.local`, `npm run dev` → localhost:3000. No seed step — dashboard reads whatever's in Supabase. For a fresh DB, run `npx tsx scripts/backfill.ts`.
- **npm scripts.** `dev`, `build`, `lint`. No `typecheck` or `test` script in `package.json` as of this writing — tests run via `npx vitest run`. Known tech debt: no `sentinel` gate.
- **Manual cron trigger.** `curl -H "Authorization: Bearer $CRON_SECRET" https://ifpa-health.vercel.app/api/cron/daily`.
- **Backfill runbook.** Truncate target tables → `npx tsx scripts/backfill.ts` → trigger `/api/cron/daily` once to recompute scores and forecast.
- **Migration flow.** Write `supabase/migrations/NNN_description.sql` → `supabase db push --linked --dry-run` → `supabase db push --linked`. If a DDL would hit the pooler timeout, run it in the Dashboard SQL Editor instead.

In delta mode: check for new env vars in changed files. Verify docs are current.

### Agent 5: Schema Reference → `docs/schema-reference.md`

Build a reference doc, not an audit. Read `supabase/migrations/001_initial_schema.sql` and `002_forecast_player_columns.sql` and `lib/database.types.ts` (if generated).

Group the 11 tables by purpose:

- **Snapshots (4):** `annual_snapshots`, `monthly_event_counts`, `overall_stats_snapshots`, `country_snapshots`
- **Rankings (1):** `wppr_rankings`
- **Outputs (2):** `health_scores`, `forecasts`
- **Calibration (3):** `observations`, `methodology_versions`, `shadow_scores`
- **Ops (1):** `collection_runs`

For each table: columns + types, generated columns, indexes, which collector owns writes, row-count category (small <1K / medium 1–50K — nothing is large in this project).

**Generated columns** (document both):
- `annual_snapshots.avg_attendance` = `player_entries / tournaments`
- `annual_snapshots.retention_rate` = `returning_players / unique_players * 100`

**RLS:** enabled on all tables. Policy is "permissive anon read, service-role write." Don't promise more policy nuance than exists.

**Collector → table ownership map.** Each of the 6 collectors owns one or two tables. Document which.

**IFPA field-name fixes referenced.** The schema was written expecting the documented API shape; the client patches the response before insert. Cross-reference the Pattern doc section so readers see both sides.

No pg_cron jobs, no RPCs, no triggers beyond what the migrations define. No junction tables. Say so explicitly — readers coming from Kineticist will expect them.

In delta mode: only document tables/columns added or changed in new migrations.

### Agent 6: Testing & Ops → `docs/testing-and-ops.md`

- **Vitest inventory.** Four test files in `lib/__tests__/`:
  - `health-score.test.ts` — protects the 3-pillar scorer (breakpoints, pillar weights, band labels). 14 tests per `NOTES.md` — verify the current count.
  - `narrative.test.ts` — protects the template sentence engine. 7 tests per `NOTES.md` — verify.
  - `forecast.test.ts` — protects the seasonal-ratio projection math and CI computation.
  - `projected-score.test.ts` — protects the scoring of projected data.
- **No E2E, no integration tests.** Pure-function tests only. All inputs are in-memory.
- **How to run.** `npx vitest run` (single) or `npx vitest` (watch).
- **Cron observability.** Each cron run writes a row to `collection_runs` with `status` (`running` → `success` | `error`), `started_at`, `completed_at`, `details` JSON. This is the entire observability story — no Sentry, no external monitoring.
- **Monitoring the dashboard.** The data freshness badge on the site reflects `collection_runs.started_at` for the latest successful run. If that stops updating, cron has drifted.
- **Scripts directory.** Three ops scripts in `scripts/`:
  - `backfill.ts` — seed historical data from IFPA.
  - `recompute-v2-score.ts` — rewrite latest `health_scores` row using current scorer (no cron wait).
  - `recompute-forecast.ts` — rewrite latest `forecasts` row from stored data.
  Each script is self-describing in its top comment; no README.
- **Known ops debt.**
  - No CI test gate. `npm run lint` is the only CI-eligible check.
  - Admin routes unauthed.
  - No error tracking. If errors start mattering, add Sentry.
  - Country growth compares first snapshot to latest — not a true "last N days" window.

In delta mode: flag new tests or scripts. Verify counts above.

---

## Phase 2: Synthesis

After all 6 agents complete, READ every output file in `docs/`. Then update the master `CLAUDE.md`.

### Size Rules

`CLAUDE.md` is a scannable reference, not a novel. This project's current doc is ~280 lines — aim to stay in the **250–350 range**. If you exceed 400, extract to `docs/` and link.

- **Summary + link pattern.** Sections with a backing `docs/` file get a 3–8 line summary plus a link. Not a reproduction of the detail.
- **Process docs are self-contained.** Never copy rules or checklists from a process doc into `CLAUDE.md`. The process doc is the source of truth.

Per-section budgets (tuned for this project's scale):

| Section | Budget | Notes |
|---|---|---|
| What This Project Is | 3–5 | One paragraph |
| Tech Stack | 10–20 | Bullets, no prose |
| Architecture Overview | 15–25 | Mental model + 3-step data flow. Link `docs/architecture.md` |
| Key Features | 15–25 | Feature list with 1-line summaries. Link `docs/features.md` |
| Project Structure | 30–45 | Annotated tree |
| How to Run Locally | 5–15 | Numbered steps |
| CLI Commands | 15–25 | Code block |
| Code Conventions | 20–35 | Key patterns. Link `docs/patterns-and-conventions.md` |
| Common Tasks | 20–40 | 4–6 how-tos with file paths |
| Environment Variables | 10–15 | Table. Link `docs/setup-and-config.md` |
| Database Schema | 10–15 | Entity summary. Link `docs/schema-reference.md` |
| Deployment | 10–15 | Environment map, cron config |
| Key Decisions | 8–12 | Bullets |
| Known Issues & Tech Debt | 8–15 | Honest list |
| External Dependencies & Integrations | 5–10 | Summary table |
| Maintenance Processes | 5–10 | Auto-generated table |
| Session Notes | 3–5 | Pointer to `NOTES.md` |
| Key Files | 5–10 | Bullets with 1-line descriptions |

### Merge Behavior

The existing `CLAUDE.md` was written carefully. Treat it as the starting point:

- Keep accurate sections verbatim unless an agent found a factual delta.
- If an agent's doc contradicts `CLAUDE.md`, the agent's doc wins (it read the current code). But verify by re-reading the source file before changing `CLAUDE.md`.
- Update the `<!-- swarm-last-run: YYYY-MM-DD -->` comment to today's date. Mandatory every run.
- Regenerate the Maintenance Processes table from `ls docs/process/*.md`.

### Sections to Omit

This project doesn't have cross-project syncs, Directus, Edge Functions, or a Zod env layer. Omit the corresponding sections that appear in the Kineticist template. Don't leave placeholders saying "N/A."

---

## Phase 3: Self-Validation

Spawn one final agent:

### Agent 7: Documentation Reviewer

**Structural checks:**

- `CLAUDE.md` under 400 lines (450 hard cap).
- Every section in the Phase 2 budget table exists (minus the explicitly-omitted ones).
- `<!-- swarm-last-run: YYYY-MM-DD -->` is present and set to today's date.
- No process doc section inlines rules, checklists, or anti-patterns.

**Accuracy checks — environment variables:**

- Grep for `process.env.` across `lib/`, `app/`, `scripts/`.
- Every var found must appear in the Environment Variables table.
- Every var in the table must appear in code.

**Accuracy checks — database:**

- List table names from `supabase/migrations/001_initial_schema.sql` (and `002_*`).
- Every table name mentioned in `CLAUDE.md` must exist. No ghost tables.
- Table count in the schema summary must match reality (currently 11).

**Accuracy checks — file paths:**

- Every file path in `CLAUDE.md` must exist on disk (glob check).
- Every `docs/` link must resolve.
- Every process doc link must resolve.

**Accuracy checks — known issues:**

- For each Known Issue, verify it's still unresolved. If fixed, delete it.
- Examples of issues to re-check: `.env.local` trailing `\n`, unauthed admin routes, missing sentinel script, no squash/baseline migration.

**Accuracy checks — counts:**

- "11 tables" — verify against migrations.
- "6 collectors" — verify against `lib/collectors/` listing.
- "4 test files" — verify against `lib/__tests__/` listing.
- "2 migrations" — verify against `supabase/migrations/` listing.
- "12 components" — verify against `components/` listing (exclude `components/ui/`).
- Test counts in the Testing doc (14 health-score, 7 narrative from `NOTES.md`) — run `npx vitest run` and update if drifted.

**Readability check:**

- Read `CLAUDE.md` as if you just cloned the repo. Flag anything confusing or contradictory.
- Verify the "How to Run Locally" steps would actually work from a clean state.
- Make corrections directly; don't just report them.

---

## Rules

- **Be honest about scope.** This is a lean single-page dashboard with a small cron + database backend. Don't inflate it. If a section would be empty, omit it.
- **No fabrication.** Every claim traceable to actual code. If you can't figure out what something does, say so.
- **Preserve `NOTES.md` context.** The session log is the authoritative "why is it like this" source. Never contradict it without evidence.
- **Process docs are self-contained.** This doc is the source of truth for running the swarm. `CLAUDE.md` references it via the Maintenance Processes table — it does not inline any of it.
- **Auto-generate the Maintenance Processes section.** Read `docs/process/` directory listing in Phase 2. Do not maintain this section manually.
- **Common Tasks must be concrete.** Each entry references specific files. Not "update the scorer" but "1. Edit breakpoints in `lib/health-score.ts`, 2. Update fixtures in `lib/__tests__/health-score.test.ts`, 3. Run `npx tsx scripts/recompute-v2-score.ts`."
- **Staleness tracking is mandatory.** Every run updates the `swarm-last-run` HTML comment in `CLAUDE.md`.
- **When in doubt, match the existing `CLAUDE.md`.** It was calibrated to this project's size; don't expand it for the sake of it.
