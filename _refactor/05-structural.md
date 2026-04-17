# Pass 5 — Structural Refactors

## Baseline Health

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (0 errors)
- `npx vitest run` — 29 / 29 passing
- `npm run build` — clean

## Prior Passes

- Pass 1 (`739aa6c`) — dead code removal
- Pass 2 (`c4f4164`) — `toNum` / `toNumOrNull` extracted to `lib/utils.ts`
- Pass 3 (`dd0acf2`) — removed `postgres`, moved `dotenv` to devDeps
- Pass 4 (`4899833`) — `parseHealthScore` helper, `isBand` narrowing, `isStale` helper; generated `lib/database.types.ts` evaluated but NOT wired (6 cascading jsonb / null-handling issues surfaced — Pass 5's job)

## Findings

| # | Severity | Finding | Action |
|---|---|---|---|
| 1 | 🟠 HIGH | **Null-handling bug in `app/page.tsx` lifecycle waterfall math.** `latestYear.returning_players > 0` coerces `null → false` (returns `null` — correct by accident), but also drops the legitimate case `returning_players === 0` ("everyone is new this year"). The truthiness check conflates two different outcomes. Generated Supabase types in Pass 4 correctly type this column as `number \| null`. | Fixed — extracted to `computeLifecycleData()` in `lib/derivations.ts` with an explicit `=== null` check. Zero-returning now produces a real lifecycle row. Regression test added. |
| 2 | 🟡 MEDIUM | **30-line country-growth IIFE in `app/page.tsx`** — non-trivial `reduce` + `sort` + null-safe arithmetic, untested. | Fixed — extracted to `computeCountryGrowthData()` in `lib/derivations.ts`, with 4 Vitest tests including a divide-by-zero guard. |
| 3 | 🔵 LOW | **`getTrend` / `getRetentionTrend` near-duplicates in `app/page.tsx`** — 5 lines each, both close over `priorYear?.year`, only 3 call sites total, only difference is the unit label ("%" vs "pts") and threshold. | **Rejected.** Extracting would force threading `priorYear` as a param, widening the surface for no clear win. The closure is the clarity. Keep inline. |
| 4 | 🔵 LOW | **Drawer-forecast prop object** (lines 259–266 of `app/page.tsx`) rebuilds a subset of `forecast` with `Math.round(toNum(...))` coercions. Same `Math.round(toNum(...))` pattern appears in the `computeProjectedScore` arg block 8 lines higher. | **Rejected.** The two call sites want *different* subsets of the forecast — the drawer version drops the 95% CIs and player projections. A unified helper would need to expose both shapes and ends up longer than the inline code. Low-value extraction. |
| 5 | 🟡 MEDIUM | **Cron route duplication — `app/api/cron/daily/route.ts` vs `weekly/route.ts`.** Both do: `verifyBearer` → insert `collection_runs('running')` → run collectors → update row → return JSON. Superficially similar. | **Rejected.** The two routes differ meaningfully in failure semantics — daily is *fail-fast sequential* (one throw → whole run errors), weekly is *per-task `.catch()` with partial status* (some OK, some err → `status='partial'`, errors stored). A `runCronJob(name, collectors)` wrapper would have to express both modes via a flag AND handle `errors: string[]` plumbing → call sites would not meaningfully shrink. Flagged, not forced. Fine to revisit if a *third* cron route lands. |
| 6 | 🔵 LOW | **Admin handler boilerplate** — `verifyBearer(request, 'CRON_SECRET')` + `createServiceClient()` duplicated across 2 admin routes. | **Rejected.** Two lines. A `withAdmin(handler)` HOF adds an indirection for 4 lines of savings total. The routes also differ (GET+POST in observations, POST only in calibrate, different error-handling shapes) — a HOF would leak those mode decisions into option bags. Defer until a third admin route shows up. |
| 7 | 🟡 MEDIUM | **JSONB shape drift — Pass 4 carryover.** `collection_runs.details`, `health_scores.components`, `forecasts.trend_reference` are all `Json` in generated types, but writers use domain types (`Record<string, ComponentScore>`, `{ tournaments: TrendReference, entries: TrendReference }`, ad-hoc `Record<string, unknown>`). Wiring generated types surfaces 6 errors. | **Deferred.** Two viable paths: (a) define `CollectionRunDetails` / `HealthScoreComponents` shapes in `lib/types.ts` and cast at write sites; (b) add index signatures to `ComponentScore` / `TrendReference`. Both touch multiple collectors and would unblock wiring `lib/database.types.ts`. Too big for this pass's "surgical" scope — split into its own focused PR. |
| 8 | ⚪ INFO | **Collector return-shape consistency.** All 6 collectors return `{ records_affected: number, details: Record<string, unknown> }`. Pass 4 already confirmed this. No drift. |
| 9 | ⚪ INFO | **Oversized files.** Nothing in `lib/` exceeds 477 lines (`lib/forecast.ts`, legitimately mathematical). `app/page.tsx` was 300 → 267 after this pass (−33 lines). |
| 10 | ⚪ INFO | **`app/page.tsx` per-block classification (fetch vs derive vs render):** fetch (lines 18–62) — Server Component is fine; derive (lines 64–147) — reduced; render (lines 167–267) — unchanged. |

## Extractions Made

### `lib/derivations.ts` (new, 120 lines)

Two exported functions plus their input/output types.

```
lib/derivations.ts
├─ LifecycleYearRow           type
├─ LifecycleData              type
├─ computeLifecycleData()     21 LOC — null-guarded lifecycle math
├─ CountrySnapshotRow         type
├─ CountryGrowthRow           type
└─ computeCountryGrowthData() 29 LOC — group by country, compute deltas
```

### `lib/__tests__/derivations.test.ts` (new, 105 lines, 10 tests)

Covers:

**`computeLifecycleData` (5 tests)**
- Happy path: churn + new-player arithmetic
- Prior year missing → `null`
- Latest year missing → `null`
- `returning_players === null` → `null` (the bug fix)
- `returning_players === 0` → valid row (regression guard — the old truthiness check would have swallowed this legitimate "everyone new" case)

**`computeCountryGrowthData` (5 tests)**
- null / undefined / empty input → `[]`
- Multi-snapshot-per-country path: sorted desc, change + change_pct computed
- Single-snapshot country → `change: null`, `change_pct: null`
- `country_code === null` → falls back to `''`
- Divide-by-zero guard: first snapshot has 0 active players → `change_pct: null`

### `app/page.tsx` callers

Before (lifecycle — 11 lines inline):

```ts
const lifecycleData = latestYear && priorYear && latestYear.returning_players > 0
  ? {
      priorYear: priorYear.year,
      currentYear: latestYear.year,
      priorTotal: priorYear.unique_players,
      churned: priorYear.unique_players - latestYear.returning_players,
      newPlayers: latestYear.unique_players - latestYear.returning_players,
      currentTotal: latestYear.unique_players,
    }
  : null
```

After (4 lines including a comment pointing at the bug fix):

```ts
// Player lifecycle waterfall: flow between the two most recent complete years.
// The helper in `lib/derivations.ts` handles the `returning_players === null`
// case explicitly — an earlier `> 0` truthiness check hid the null gap.
const lifecycleData = computeLifecycleData(priorYear, latestYear)
```

Country growth went from a 30-line IIFE to:

```ts
// Country growth: compare latest snapshot to earliest per country.
// See `computeCountryGrowthData` for the single-snapshot null-handling.
const countryGrowthData = computeCountryGrowthData(countrySnapshots)
```

## Null-handling Bug — Confirmed Fixed

The original code in `app/page.tsx`:

```ts
latestYear.returning_players > 0 ? { …math… } : null
```

collapsed three different outcomes into one "return null":
1. Latest year missing → null (correct)
2. Prior year missing → null (correct)
3. `returning_players === null` → null (correct by coincidence — `null > 0` is `false`)
4. `returning_players === 0` → null (**wrong** — "everyone new" is real data)

After the extraction:

```ts
if (!priorYear || !latestYear) return null
if (latestYear.returning_players === null) return null
// …math with `returning_players` (narrowed to number, can be 0)…
```

- Case 3 still returns `null` — for the right reason, not by accident
- Case 4 now returns a correct lifecycle row with `newPlayers === currentTotal` and `churned === priorTotal`
- Regression covered by `'treats returning_players === 0 as a legitimate value'` in the test suite

Additionally: the scorer (`health-scorer.ts:45`) and forecaster (`forecaster.ts:96`) coerce `returning_players ?? 0` / `unique_players ?? 0` silently — not fixed here (out of scope), but flagged as a follow-up since the same null path exists in compute. The page is the highest-visibility surface for this bug; fixing it there yields the most user-visible correctness.

## Cron / Admin Wrappers — Deferred

Both were considered and rejected for the reasons in findings 5 and 6. In plain English: the two cron routes differ in how they handle partial failures, and the two admin routes differ in HTTP method shapes. A wrapper would either lose that expressive difference or end up as a 3-argument option bag that's harder to read than the current 10 lines of boilerplate.

Heuristic applied: **if the post-extraction call site is still 15+ lines, the wrapper didn't earn itself.** Both candidates fail that test.

When to revisit:
- **Cron runner:** If a third cron route lands. Two is a coincidence, three is a pattern.
- **Admin handler:** Also at the third admin route — or sooner, if `ADMIN_SECRET` replaces `CRON_SECRET` for admin routes (then the `verifyBearer` arg changes and a wrapper centralizes that choice).

## JSONB Type Shapes — Deferred

Pass 4 left 6 downstream type errors when wiring generated types. Two pragmatic paths forward:

1. **Define `Json`-compatible domain types** in a new `lib/types.ts`: `CollectionRunDaily`, `CollectionRunWeekly`, `HealthScoreComponents`, `ForecastTrendReference`. Each is a `Record<string, …>` with a permissive index signature. Writers build them; readers cast once at the top of the consumer. Explicit > implicit.
2. **Give `ComponentScore` and `TrendReference` an index signature** (`& { [k: string]: number }` or equivalent) so they satisfy `Json` structurally.

Option 1 is cleaner but touches more files. Option 2 is a 2-line change per type but leaks weak typing into the domain.

Either way: **out of scope for a structural pass focused on `app/page.tsx`.** Recommended as the first task of the next sweep — it unblocks `lib/database.types.ts` wiring, which in turn would catch future jsonb drift at compile time.

Per the spec's explicit instruction: `lib/database.types.ts` was NOT wired this pass.

## Collector Shape Consistency

Re-verified: all 6 collectors return `{ records_affected: number, details: Record<string, unknown> }`. `daily`, `annual`, `monthly`, `country`, `health-scorer`, `forecaster` all match. No drift, no rewrites needed.

One stylistic variation worth noting (non-blocking): some collectors build `details` inline at the `return` statement (`daily-collector.ts`, `country-collector.ts`), others accumulate into a block of named fields (`health-scorer.ts`, `forecaster.ts`). Both are readable; normalizing would be cosmetic. Left as-is.

## Extractions Considered and Rejected

| Candidate | Reason Rejected |
|---|---|
| `getTrend` / `getRetentionTrend` → `lib/trend.ts` | Only 3 call sites; helpers close over `priorYear?.year`; extracting forces threading that as a param. The closure IS the readability. |
| Drawer-forecast prop object | Two call sites want different subsets of `forecast`. A unified helper would expose both shapes and end up longer than the inline code. |
| `runCronJob(name, collectors)` → `lib/cron-runner.ts` | Daily fail-fast vs weekly per-task-catch-with-partial-status — wrapper would need a mode flag and `errors: string[]` plumbing. Call sites would not meaningfully shrink. |
| `withAdmin(handler)` → `lib/admin-handler.ts` | Two lines of boilerplate × 2 routes; routes have different HTTP method shapes. Adds more indirection than it saves. |
| `Math.round(toNum(...))` pattern (~8 call sites in page) | Already absorbed by Pass 2's `toNum` — the `Math.round` wrapping is a PostgREST-float-vs-int rounding concern, not a coercion concern. Inlining keeps the intent local. |

## Counts — Before vs. After

| Metric | Before | After |
|---|---|---|
| `app/page.tsx` LOC | 300 | **267** (−33) |
| `lib/` files | 8 | **9** (+derivations.ts) |
| `lib/__tests__/` files | 4 | **5** (+derivations.test.ts) |
| Vitest count | 29 | **39** (+10) |
| TypeScript errors | 0 | 0 |
| ESLint errors | 0 | 0 |
| `as unknown as` | 0 | 0 |
| `: any` / `as any` | 0 | 0 |
| Collectors with non-standard return shape | 0 | 0 |

## Verification

```
$ npx tsc --noEmit
(clean)

$ npm run lint
(clean)

$ npx vitest run
Test Files  5 passed (5)
     Tests  39 passed (39)

$ npm run build
✓ Compiled successfully in 2.5s
✓ Generating static pages (8/8)
Route (app)                  Revalidate  Expire
┌ ○ /                                1h      1y
├ ○ /_not-found
├ ƒ /api/admin/calibrate
├ ƒ /api/admin/observations
├ ƒ /api/cron/daily
└ ƒ /api/cron/weekly
```

All four verify commands green.

## Summary

Pass 5 made two surgical extractions from `app/page.tsx` — lifecycle and country-growth math — into a new `lib/derivations.ts` with 10 unit tests. The lifecycle extraction fixed a real null-handling bug that Pass 4's generated Supabase types had correctly flagged: the `returning_players > 0` check dropped legitimate zero-returning-player years. The extraction also establishes the project's pattern for future page-local derivations that earn a `lib/` spot: explicit input types, return types, JSDoc, a matching test file with regression guards.

Cron-runner and admin-handler wrappers were considered and rejected on the grounds that they would abstract away meaningful structural differences (fail-fast vs per-task-catch; GET+POST vs POST-only) without shrinking call sites enough to justify the indirection. Flagged for revisit at the third route.

The JSONB shape work needed to wire `lib/database.types.ts` was deferred per the spec — it's a structural refactor of its own, not a page-centric one.

`app/page.tsx` dropped 33 lines (−11%), test count grew 29 → 39 (+34%), baseline verify chain stays clean end-to-end.
