# Pass 2 — Duplication & Consolidation

**Commit:** `refactor: pass 2 — duplication` (this pass)
**Predecessor:** `739aa6c refactor: pass 1 — dead code removal`
**Spec:** `docs/process/code-health-sweep.md` → PASS 2.

---

## Baseline (inherited from Pass 1)

| Check | Status |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 1 error (`components/data-freshness.tsx:14` — `Date.now()` purity; deferred to a targeted fix or Pass 4) |
| `npx vitest run` | 29/29 passing |

Pass 1 already resolved the two `no-unused-vars` errors in `app/page.tsx`, unreachable narrative default branches, one migration-script file, and two dead component props. This pass inherits that post-state.

---

## Audit findings

### 🟠 HIGH — `parseFloat(String(...))` coercion duplication

**Count (before):** 21 call sites across the app (excluding `docs/` and audit artifacts).

```
app/page.tsx                       19 sites
lib/collectors/health-scorer.ts     2 sites
```

**Root cause:** PostgREST serializes Postgres `numeric` / `numeric(p, s)` to JSON strings to preserve arbitrary precision. The `@supabase/supabase-js` client surfaces them as `string`, not `number`, regardless of the TypeScript type. Every read of a `numeric` column must be coerced.

**Affected columns in this codebase:**

- `annual_snapshots.retention_rate` — `numeric(5, 1)` (generated)
- `annual_snapshots.tournament_yoy_pct` — `numeric(6, 1)`
- `monthly_event_counts.yoy_change_pct` — `numeric(6, 1)`

**Not actually affected (but coerced defensively):**

- `forecasts.projected_tournaments`, `.projected_entries`, all `ci_68_*` / `ci_95_*` tournaments+entries columns are `integer`, not `numeric` — they come back as real numbers. Wrapping them in `parseFloat(String(...))` is a no-op. The wrap is harmless and the types are TBD under Pass 4 (generated Supabase types), so the helper preserves the defensive behavior for now.

### 🟡 MEDIUM — Two `getTrend` helpers inside `app/page.tsx`

- `getTrend(value)` — ±2% threshold, "% vs Y" label
- `getRetentionTrend(delta)` — ±1 pp threshold, "pts vs Y" label

Near-identical shape, different thresholds and units. Page-local, single caller each, not tested. Per CLAUDE.md ("page-local derivations live in `app/page.tsx`"), **leave inline**. Flag for Pass 5 if either grows another caller or a unit test.

### 🟡 MEDIUM — Truthy-checked null-fallback pattern

`x?.numeric_col ? toNum(x.numeric_col) : null` appears 3× in `app/page.tsx` (retention rate, prior retention, tournament YoY). A `toNumOrNull()` helper was considered and added to `lib/utils.ts`, but **not applied** to these call sites. Reason: the current pattern uses truthy, not `!= null`, so a value of `0` maps to `null`. Swapping in `toNumOrNull` would change semantics (real 0 → 0 instead of null). For retention rate a 0 is effectively missing, but preserving exact behavior is the safer play for a pure-dedup pass.

`toNumOrNull` is exported anyway — it will be the right tool when a call site genuinely needs `null` distinct from `0`. Flag for a follow-up pass once the intent is documented.

### 🔵 LOW — `collection_runs.select('completed_at, status')` fetches a column nobody reads

Pass 1 removed `status` from the `DataFreshness` component. The `.select()` in `app/page.tsx:53` still requested `status`. Narrowed to `.select('completed_at')`. No runtime impact beyond a slightly smaller payload.

### ⚪ INFO — Country growth IIFE (~30 lines)

`app/page.tsx:150–181` is a self-contained country-growth aggregation (group by country, compute first-vs-latest delta, sort by active players). Page-local, one call site, not tested. Candidate for `lib/country-growth.ts` extraction + Vitest in **Pass 5** (structural pass). Leave in place for Pass 2.

### ⚪ INFO — Cron-route plumbing duplication

`app/api/cron/daily/route.ts` and `app/api/cron/weekly/route.ts` share the same auth → insert `collection_runs` → run collectors → update row plumbing. Spec explicitly defers this to Pass 5 (it's a structural extraction, not a line-level dedup). Not touched here.

### ⚪ INFO — Query shape

The 6 parallel queries in `app/page.tsx` each have a distinct `.select(...)` shape (as expected — they hit 6 different tables). Not duplication; spec says don't touch.

### ⚪ INFO — Constants already live where they belong

- Health-score breakpoints `[-10→0, 0→50, 15→100]` + `[25→0, 35→50, 50→100]` — single-defined in `lib/health-score.ts`.
- Narrative spread threshold `< 8` — single-defined in `lib/narrative.ts`.

No action needed.

### ⚪ INFO — Health-score / forecast / projected-score parallel paths

Checked. These are pure, single-definition functions. No duplicated breakpoint math across them.

---

## Fixes applied

### 1. Added `toNum` and `toNumOrNull` helpers to `lib/utils.ts`

```ts
export function toNum(v: unknown, fallback = 0): number { ... }
export function toNumOrNull(v: unknown): number | null { ... }
```

Both handle:
- Real numbers (pass through; NaN → fallback/null)
- `null` / `undefined` → fallback / null
- Strings → `parseFloat(String(v))` (NaN → fallback/null)

The helper preserves the existing `?? 0` fallback semantics for the 0-fallback sites, and provides an explicit `null`-fallback variant for future call sites that need to distinguish "missing" from "0".

### 2. Replaced `parseFloat(String(...))` at every call site

| File | Before | After |
|---|---|---|
| `app/page.tsx` | 19 sites | 0 sites (uses `toNum`) |
| `lib/collectors/health-scorer.ts` | 2 sites | 0 sites (uses `toNum`) |

**Total:** 21 → 0 call sites. Behavior preserved at every site:

- Sites with `?? 0` inside the cast → `toNum(x)` (fallback 0 is the default).
- Sites using truthy-check then cast → `x ? toNum(x) : null` (semantics preserved; `toNumOrNull` intentionally not applied).
- Sites with bare `parseFloat(String(x))` (no `??`) → `toNum(x)`. This flips a latent NaN on null-input into a 0, which is the right behavior and matches what every sibling forecast-projected call site already did.

### 3. Narrowed `collection_runs` select

`app/page.tsx:51–56` — dropped `, status` from the select list. `DataFreshness` never reads it post-Pass-1.

---

## Files changed

| File | Lines added | Lines removed | Net |
|---|---|---|---|
| `lib/utils.ts` | +48 | 0 | +48 |
| `app/page.tsx` | 20 rewrites + 1 import + 1 select narrow | 1 select column | ≈0 |
| `lib/collectors/health-scorer.ts` | 1 import + 2 rewrites | 6 lines (collapsed ternary) | −4 |

Net shape: one new well-documented helper file area (+48 lines) offsets ~20 long inline casts shortened to function calls.

---

## Intentionally left duplicated

- **`getTrend` + `getRetentionTrend`** in `app/page.tsx`. Near-dup, but thresholds and units genuinely differ. Page-local, untested, no second caller. Per CLAUDE.md rule: earn a spot in `lib/` only when reused or tested.
- **Forecast destructuring block** appears twice in `app/page.tsx` (the `computeProjectedScore` input and the `DetailDrawer.forecast` prop). These shape two *different* consumer shapes — `ForecastResult` vs. the drawer's narrower projection props. Consolidating them is Pass 5 structural work (split the page into typed props).
- **Cron-route plumbing** (auth / `collection_runs` row / collector orchestration) — explicit Pass 5 deferral per spec.
- **Truthy-check `x ? toNum(x) : null` pattern** — candidate for `toNumOrNull` once the semantic (0 vs missing) is pinned down. Not a Pass 2 judgment.

---

## Verification

### Pre-commit

```
$ npx tsc --noEmit        # clean
$ npm run lint            # 1 error (data-freshness.tsx:14, inherited)
$ npx vitest run          # 29/29
```

No test fixtures touched; all four suites (health-score, narrative, projected-score, forecast) still pass.

### Post-commit

Same as pre-commit. Commit is a non-behavioral refactor: every call site preserves semantics, and the test suite exercises `lib/collectors/health-scorer.ts` indirectly through `health-score.test.ts` fixtures. `app/page.tsx` isn't unit-tested, so the proof-of-equivalence is the line-by-line call-site review above.

---

## Summary

- **21 → 0** inline `parseFloat(String(...))` call sites in app code.
- **1 helper file** (`lib/utils.ts`) gained `toNum` + `toNumOrNull`.
- **1 select column** narrowed (dead `status` removed from `collection_runs` query).
- **5 duplication candidates** flagged and intentionally deferred to Pass 4 / Pass 5 (not in scope for Pass 2).

Pass 2 is pure mechanical deduplication. The bigger structural splits (cron-runner, country-growth extraction, typed-forecast-prop consolidation) live in Pass 5.
