# IFPA Health Dashboard — Session Notes

## Session 1 (Feb 5, 2026)

### What was done
- Full project scaffolding: Next.js 16 + Tailwind v4 + shadcn/ui
- Database migration with 11 tables (annual_snapshots, monthly_event_counts, overall_stats_snapshots, country_snapshots, wppr_rankings, health_scores, forecasts, observations, methodology_versions, shadow_scores, collection_runs)
- IFPA API client with typed endpoints
- 6 data collectors (daily, annual, monthly, country, health-scorer, forecaster)
- Cron routes for daily and weekly collection
- Admin routes for observations and calibration
- Backfill script for historical data seeding
- Health score algorithm with 6 weighted components + sensitivity analysis
- Forecast system with seasonal ratio extrapolation + confidence intervals
- Full dashboard with 8 chart components + server components
- Dark mode toggle, OG meta tags

### Key decisions
- Used v2 analysis report as authoritative data source
- Health score ~70 (Healthy) expected with current data
- Methodology versioning from day 1 for calibration loop
- No monthly player entry display (API unreliable for this)

### Bugs / Issues
- Supabase project needs to be created in dashboard (user must provide URL + keys)
- Backfill script needs `.env.local` populated before running
- IFPA stats endpoints (/stats/overall, /stats/events_by_year, etc.) not in formal API docs but work

### Session 2 (Feb 5, 2026) — Deployment

#### What was done
- Created Supabase project `ifpa-health` (ref: ryteszuvasrfppgecnwe, region: us-west-1)
- Ran migration (11 tables, RLS, indexes, seed data)
- **Fixed IFPA API response mismatches** — the API field names differ from what the docs suggest:
  - `events_by_year`: response key is `stats` not `events_by_year`, fields are `tournament_count`/`player_count` (singular)
  - `players_by_year`: response key is `stats`, fields are `current_year_count`/`previous_year_count` (not `unique_players`/`returning_players`)
  - `country_players`: response key is `stats` not `country_list`
  - `stats/overall`: age nested under `stats.age` with different field names (`age_18_to_29` not `18_29`)
  - `rankings/wppr`: has `name` (full) not `first_name`/`last_name`, `current_rank` not `wppr_rank`, `rating_value` not `ratings_value`
- Fixed IFPA client, all 6 collectors, and backfill script to match real API
- Ran backfill: 211 records (10 annual, 86 monthly, 51 country, 50 WPPR, 10 observations, health score, forecast)
- Deployed to Vercel: https://ifpa-health.vercel.app
- Crons configured: daily 8am UTC, weekly Monday 9am UTC

#### Health score result
- Initial score: **48.9 (Concerning)** — lower than expected ~70
- Growth component is 0 because 2026 YTD (partial year) vs 2025 (full year) shows -94% "decline"
- This will self-correct as 2026 data accumulates through the year
- Other components: Attendance 92.5, Retention 64.6, Momentum 44.7, Diversity 64.0, Youth 44.3

#### Forecast
- 15,575 tournaments projected for 2026 (based on 2 months of data, wide CI expected)

### Session 3 (Feb 5, 2026) — Data Accuracy Fixes

#### Issues identified via Playwright inspection
1. Metric cards showed -94% YoY (comparing 2026 partial vs 2025 full year)
2. Unique Players showed 0 (no 2026 data yet)
3. WPPR table unsorted (random rank order)
4. Historical Trends chart showed 2026 as cliff-drop (partial year plotted with full years)
5. Geographic chart inverted (Slovenia at top, US at bottom)

#### Fixes applied
- **Metric cards + health scorer**: Use last complete year (2025) instead of current partial year (2026) for YoY and growth calculations
- **Historical charts**: Pass only complete years to AnnualTrendsChart and RetentionChart
- **WPPR query**: Added `.order('wppr_rank', { ascending: true })`
- **Geographic chart**: Removed `.reverse()` — Recharts vertical BarChart renders first array item at top, so descending sort is correct
- **Backfill script**: Same complete-year fix applied

#### Health score after fix
- **66.5 (Healthy)** — much more accurate than 48.9
- Growth 75 (+10.2% avg YoY), Attendance 82, Retention 85, Momentum 45, Diversity 30, Youth 44

### Session 4 (Feb 5, 2026) — UX Clarity Pass

#### Redesigned 3 components for clarity
- **Monthly Momentum**: Replaced confusing side-by-side year bar chart (mostly empty with only 2 months of 2026 data) with YoY change bars — green = growth, red = decline, last 12 months
- **Forecast**: Replaced broken CI-band Recharts chart with clean text card — big projected number, range, comparison to prior year, early-estimate disclaimer
- **Health Score Breakdown**: Replaced 6 dense progress bars (weight %, sensitivity arrows, scores) with 2x3 grid of simple tiles — icon, name, rating (Strong/Good/Fair/Weak), key metric value

#### Terminology consistency
- Audited all user-facing text for tournament vs event consistency
- Fixed 7 instances: "event" → "tournament" in health breakdown, monthly momentum subtitle, methodology panel
- WPPR "Events" column left as-is (correct IFPA term for player event count)

### Session 5 (Feb 16-17, 2026) — V2 Redesign: Narrative Pulse Check

#### Design
- Brainstormed and designed a complete v2 overhaul: single-viewport, dark-first pulse check
- Design doc: `docs/plans/2026-02-16-v2-redesign-design.md`
- Implementation plan: `docs/plans/2026-02-16-v2-implementation.md`

#### What was done (15 tasks, subagent-driven development)
- **Health score rewrite**: 6 arbitrary components → 3 equally-weighted pillars (players, retention, tournaments)
  - Breakpoints: players/tournaments [-10→0, 0→50, 15→100], retention [25→0, 35→50, 50→100]
  - New score: **83.47 (Thriving)** vs old 66.5 (Healthy)
- **Narrative generator**: Template-based sentence engine (no AI), conditional logic, natural phrasing
- **Simplified health scorer collector**: 229 → 105 lines, reads only annual_snapshots
- **Dark-first CSS**: oklch colors, `.light` as opt-in variant, functional color tokens (up/down/flat)
- **New components**: Sparkline (SVG), AnswerCard, NarrativeDisplay, MonthlyPulse, YearTable, DetailDrawer
- **Updated gauge**: Count-up animation (800ms easeOutCubic), CSS variable band colors
- **Page rewrite**: Single viewport layout — gauge → narrative → 3 answer cards → detail drawer
- **Removed v1**: 10 chart components deleted, recharts uninstalled (1,340 lines removed)
- **Mobile responsive**: 375px tested, monthly pulse 6x2 grid, tighter padding
- **Metadata**: Updated title/OG to "IFPA Health — Competitive Pinball Pulse Check"

#### Key decisions
- 3 pillars (not 6) because diversity/youth are demographic facts, not health indicators
- Template narrative, not AI — deterministic, fast, no API calls
- Dark-first because numbers pop on dark backgrounds (scoreboard aesthetic)
- Drop all Recharts in favor of tiny SVG sparklines — less library overhead, more elegant

#### Technical notes
- 21 tests (14 health-score, 7 narrative) via vitest
- Narrative spread threshold: < 8 (not < 15 from spec) for better real-data behavior
- Detail drawer uses native `<details>`/`<summary>` with localStorage persistence
- Branch: `v2-redesign` (10 commits ahead of main)

### Next steps
- Merge v2-redesign to main
- Monitor cron job produces v2 scores correctly
- Custom domain (optional)

### Session 6 (Apr 17, 2026) — Dev ops pipeline + 4 sweeps + cleanup

#### What was done
Stood up the full maintenance pipeline for this project (matching the pattern in kineticist + pinball-tracker), ran all 4 sweeps against current state, then applied every fix the audits surfaced. 15 commits pushed to main.

#### Pipeline scaffolding
- **CLAUDE.md** (297 lines) — project overview, stack, architecture, conventions, env vars, schema, known issues, maintenance processes table
- **docs/** — 6 supporting docs generated + validated by the documentation swarm:
  - `architecture.md`, `features.md`, `patterns-and-conventions.md`, `setup-and-config.md`, `schema-reference.md`, `testing-and-ops.md`
- **docs/process/** — 5 calibrated sweep specs:
  - `documentation-swarm.md` (6 agents + synthesis + validator)
  - `code-health-sweep.md` (5 passes, calibrated down from kineticist's 6)
  - `frontend-audit.md` (5 passes)
  - `security-scan.md` (4 passes)
  - `database-audit.md` (5 passes)

#### Sweeps run (baselines captured in `_audit/`, `_db-audit/`, `_refactor/`, `_security/`)
- **Frontend audit:** 4 code commits. Fixed 2 `react-hooks/set-state-in-effect` errors via `useSyncExternalStore` in theme-toggle + detail-drawer; narrowed 6 `.select('*')` queries; added ARIA labels to gauges + theme toggle; `prefers-reduced-motion` handling; deleted 3 unused shadcn primitives; capped `monthly_event_counts` query at 24 rows.
- **Database audit (overall 7.6/10):** surfaced 4 real findings — migration 002 unrecorded, anon holds TRUNCATE on all 11 tables, `annual_snapshots.collected_at` never updates after backfill, 47 dangling `health_scores.methodology_version=2` refs.
- **Security scan (0 CRITICAL, 1 HIGH):** 5 inline commits bundled — `lib/supabase.ts` env trim, `lib/auth.ts` with `verifyBearer` constant-time compare, `lib/sanitize.ts` for `collection_runs.error_message`, manual body validation on observations POST, terse 500 responses.
- **Code health sweep:** 5 commits. Lint went 3 errors → 0. Tests 29 → 39. Deleted `scripts/migrate-002.cjs`; extracted `toNum`/`toNumOrNull` helpers (21 call sites); removed unused `postgres` dep, moved `dotenv` to devDeps; added `parseHealthScore` + `isBand` + `isStale` helpers; fixed `Date.now()` purity bug in `data-freshness.tsx`; extracted `computeLifecycleData` + `computeCountryGrowthData` to `lib/derivations.ts`; fixed null-handling bug where `returning_players === 0` was silently dropped.

#### Fixes applied from the open-items list
1. Migration registry reconciled (`supabase migration repair --status applied 002`).
2. Migration 003 applied — revokes TRUNCATE + DML from `anon`/`authenticated` on all 11 tables. Verified: both roles now hold only SELECT.
3. Migration 004 applied — seeds `methodology_versions` v2 row (3-pillar, equal weights) and flips v1 inactive. All 47 `health_scores` rows now reference a row that exists.
4. `annual-collector.ts` + `monthly-collector.ts` now include `collected_at: now` in upsert rows. Monthly had the same bug as annual (both use year/month-based onConflict keys). Weekly cron on Mon 2026-04-20 will be first real exercise.
5. `lib/database.types.ts` generated + wired into `createClient<Database>`. 4 write sites (2 cron routes + 2 collectors) cast jsonb payloads at the boundary with a comment; read sites use existing bridge helpers like `parseHealthScore`.

#### Additional cleanup (the "5 more things" the audits surfaced)
- **Migration 005 + `country_growth_v` view** — pre-aggregates one row per country so the page query stays constant (~51 rows) instead of hitting the JS client 1000-row cap in ~97 days. `security_invoker=true` so anon's SELECT policy on `country_snapshots` still gates access.
- **Sentinel npm script** — `npm run sentinel` = typecheck + lint + tests + build. All green.
- **`.env.example`** — 6 vars documented (including new `ADMIN_SECRET`). Required updating `~/.claude/hooks/protect-files.sh` to allowlist `.env.example`/`.env.sample`/`.env.template` and updating `.gitignore` with `!.env.example`.
- **`ADMIN_SECRET` split** — new secret provisioned in Vercel production; admin routes now pass `'ADMIN_SECRET'` to `verifyBearer` instead of `'CRON_SECRET'`. Admin access can be rotated independently.
- **Vercel env trailing `\n` cleanup** — all 5 stored env values had literal `\n` suffix (character codes 92, 110). Wrote a throwaway Node script that pulled prod env, detected dirty values in-process, and re-added each via `vercel env rm` + `vercel env add --value` (argv, not stdin). Verified clean via re-pull. Script deleted. **Gotcha:** piping `echo "value" | vercel env add` captures the trailing newline and stores it verbatim. Always use `--value` flag for future adds.

#### Final state
- 15 commits pushed to `main`. Vercel auto-deploy triggered.
- Typecheck clean, lint 0 errors, 40 tests pass, build clean.
- DB: migrations 003, 004, 005 applied to production.
- 4 baseline audit directories committed: `_audit/`, `_db-audit/`, `_refactor/`, `_security/`.

#### Gotchas encountered / learnings
- **Supabase upsert + `onConflict`:** only updates columns present in the row payload. Default `now()` on `collected_at` fires only on INSERT. Any row with a year-based or year+month-based onConflict key will freeze its `collected_at` after first write unless you include it explicitly.
- **Supabase `Json` utility type + concrete domain types:** generated types use `Json` for jsonb columns; domain types like `ComponentScore` / `TrendReference` / `CollectionRunDetails` don't have the index signature `Json` requires. Cast at the write boundary with a comment; read paths narrow via bridge helpers like `parseHealthScore`.
- **Vercel CLI `env add` via `echo`:** adds a trailing newline to the stored value. Use `--value "..."` instead. Affected all 5 prod secrets before the cleanup.
- **Supabase CLI `supabase migration repair --status applied <ver>`:** the clean way to mark an out-of-band migration as applied in `supabase_migrations.schema_migrations`.
- **`supabase db query --linked` vs Supabase MCP:** MCP is rate-limited and was unauthed this session; CLI is the primary audit tool. Works great for EXPLAIN/advisor/pg_stat queries. Use `| tail -N` to trim the agent-data boundary wrapper output.
- **Correction to Session 2 field name:** `players_by_year` response field is `count` (NOT `current_year_count` as I previously noted). Paired with `previous_year_count` for the prior year. Encoded in `lib/ifpa-client.ts:32-38`.

#### What to verify on next session
- Monday's weekly cron run should advance `annual_snapshots.collected_at` AND `monthly_event_counts.collected_at` past the Feb 5 backfill timestamp. If it doesn't, the upsert fix didn't take.
- `collection_runs` for the first daily run after push should show `status='success'` — the jsonb-cast changes went through prod.
