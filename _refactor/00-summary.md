# Code Health Sweep — Summary

**Date:** 2026-04-17
**Scope:** Five-pass code health sweep across `app/`, `lib/`, `components/`, `scripts/`.
**Predecessor:** Security scan chore commit `5007085`.

---

## TL;DR

Lint went from **3 errors + 1 warning** to **0 errors + 0 warnings**; test count grew **29 → 39** via a new `lib/derivations.ts` module with regression guards. Several real bugs fell out along the way — most notably a null-handling bug in the lifecycle waterfall (`returning_players === 0` was silently dropped) and a `Date.now()` in a Server Component render body. One strategic win deferred on purpose: `lib/database.types.ts` was generated and evaluated but not wired, because six jsonb-shape mismatches would have been masked by `as unknown as` casts — exactly the anti-pattern Pass 4 was removing.

## Baseline vs Final

| Metric | Baseline | Final | Delta |
|---|---|---|---|
| Typecheck (`npx tsc --noEmit`) | clean | clean | = |
| Lint errors | 3 | 0 | −3 |
| Lint warnings | 1 | 0 | −1 |
| Tests (`npx vitest run`) | 29 | 39 | +10 |
| Build (`npm run build`) | clean | clean | = |

---

## Commits

Five sweep commits, authored sequentially on top of the prior security chore:

| SHA | Pass | Title |
|---|---|---|
| `5007085` | — | chore: security scan (precedes this sweep) |
| `739aa6c` | 1 | refactor: pass 1 — dead code removal |
| `c4f4164` | 2 | refactor: pass 2 — duplication |
| `dd0acf2` | 3 | refactor: pass 3 — dependency hygiene |
| `4899833` | 4 | refactor: pass 4 — type hygiene |
| `56a6c8d` | 5 | refactor: pass 5 — structural |

---

## Fixes applied by pass

### Pass 1 — Dead code (`739aa6c`)

- [x] Deleted orphan `scripts/migrate-002.cjs` (migration already applied; closed 2 lint errors + 1 warning) — `739aa6c`
- [x] Removed dead `DataFreshness.status` prop from `components/data-freshness.tsx` — `739aa6c`
- [x] Removed dead `PlayerLifecycle.returning` prop + caller in `app/page.tsx` — `739aa6c`
- [x] Removed unreachable narrative `default:` branches; narrowed `PillarEvidence.key` to the three-value union — `739aa6c`

### Pass 2 — Duplication (`c4f4164`)

- [x] Added `toNum` + `toNumOrNull` helpers to `lib/utils.ts` — `c4f4164`
- [x] Replaced `parseFloat(String(...))` across **21 call sites** (19 in `app/page.tsx`, 2 in `lib/collectors/health-scorer.ts`) — `c4f4164`
- [x] Narrowed `collection_runs.select('completed_at, status')` → `select('completed_at')` — `c4f4164`

### Pass 3 — Dependencies (`dd0acf2`)

- [x] Removed unused `postgres` package from devDeps — `dd0acf2`
- [x] Moved `dotenv` from `dependencies` → `devDependencies` (scripts-only usage) — `dd0acf2`

### Pass 4 — Type hygiene (`4899833`)

- [x] Introduced `parseHealthScore(row)` + `isBand` narrowing in `lib/health-score.ts` — `4899833`
- [x] Eliminated the sole `as unknown as HealthScoreResult` cast in `app/page.tsx` — `4899833`
- [x] Hoisted `Date.now()` out of `DataFreshness` render body into `isStale()` in `lib/utils.ts` — `4899833`
- [x] Added explicit `: string` return type to `cn()` — `4899833`
- [x] Generated `lib/database.types.ts` (620 lines); evaluated, **not wired** (6 jsonb cascade errors) — `4899833`

### Pass 5 — Structural (`56a6c8d`)

- [x] Extracted `computeLifecycleData()` + `computeCountryGrowthData()` to `lib/derivations.ts` with 10 new tests — `56a6c8d`
- [x] Fixed real null-handling bug: `returning_players === 0` case now produces a valid row instead of being dropped by a truthiness check — `56a6c8d`
- [x] Shrunk `app/page.tsx` from 300 → 267 lines (−11%) — `56a6c8d`
- [x] Rejected (with reasoning): cron-runner wrapper, admin-handler HOF, `getTrend`/`getRetentionTrend` merge, drawer-forecast prop dedup — `56a6c8d`

---

## Remaining tech debt

- **`lib/database.types.ts` wiring (deferred).** Generated at Pass 4, removed before commit. Wiring via `createClient<Database>(...)` surfaced 6 legitimate errors in `collection_runs.details`, `health_scores.components`, and `forecasts.trend_reference` — all `jsonb` write sites where domain types (`Record<string, ComponentScore>`, `{ tournaments: TrendReference, entries: TrendReference }`) don't satisfy the generated `Json` shape. Fix path: define explicit shapes in a new `lib/types.ts`, then wire `createClient<Database>` in `lib/supabase.ts`.
- **`numeric` columns as JSON strings.** PostgREST serializes `numeric` to string. `toNum()` covers it cleanly but the DB could migrate columns that are mathematically integers (e.g. `yoy_change_pct`) to `integer`/`real` to skip the round-trip. DB work, not this sweep.
- **`npm audit` advisories.** 1 high on `next@16.1.6` (deferred — want a dedicated deploy window to test cron + ISR after the bump). Dev-tree full audit: 6 high + 2 moderate transitive via `rollup`/`vite`/`picomatch`. Clean with `npm audit fix` (non-force); paired with the vitest patch bump in a follow-up.
- **`npm outdated`.** `next` 16.1.6 → 16.2.4 (patch, has the CVE fix), `@supabase/supabase-js` 2.95 → 2.103 (minor), `lucide-react` 0.x → 1.x (major, icon renames), `eslint` 9 → 10 (major, flat-config semantics), `typescript` 5.9 → 6.0 (major). Each needs its own regression plan.
- **Cron/admin wrappers.** `lib/cron-runner.ts` + `withAdmin` HOF rejected this sweep (Pass 5 finding 5 + 6). Revisit at third route.
- **JSONB shape typing.** The biggest remaining type hole. Unblocks the `lib/database.types.ts` wiring above.

---

## Recommended next steps

1. **Wire `lib/database.types.ts`** — define `CollectionRunDetails`, `HealthScoreComponents`, `ForecastTrendReference` in `lib/types.ts`, regenerate `lib/database.types.ts`, then `createClient<Database>(...)` in `lib/supabase.ts`. Catches future jsonb drift at compile time.
2. **Rotate the trailing-`\n` Vercel env values** flagged in security scan Pass 1 (`IFPA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`). Root-cause over defensive `.trim()`.
3. **Apply migration 003** (from security scan Pass 4) — revokes `anon` TRUNCATE grants.
4. **Fix the annual collector.** `_db-audit/` found `annual_snapshots.collected_at` never updates post-backfill. Real bug — latest row shows stale collection timestamps.
5. **Seed `methodology_versions` v2 row** (database audit Pass 4). 47 health-score rows reference `methodology_version=2` with no matching row in the lookup table.
6. **Add a `sentinel` npm script** (`tsc --noEmit && eslint && vitest run && next build`) — per CLAUDE.md's Known Issues. No CI gate today beyond `npm run lint`.
7. **`country_snapshots` 1000-row cap mitigation** (frontend audit Pass 2, DB audit Pass 2). Supabase JS client silently caps at 1000. Fix app-side: narrow the select shape or paginate via `.range()`.

---

## Things rejected on principle — for future agents

- **Don't extract a cron route wrapper until a third route lands.** Daily is fail-fast sequential, weekly is per-task `.catch()` with `status='partial'`. A wrapper would need a mode flag + error-list plumbing; call sites would not meaningfully shrink. Two is coincidence, three is a pattern.
- **Don't merge `getTrend` + `getRetentionTrend` until a third trend type appears.** Thresholds and units differ (±2% vs ±1 pp, "%" vs "pts"). Both close over `priorYear?.year`; extracting forces threading it as a param. The closure is the readability.
- **Don't install Zod for a single admin body** (security scan Pass 3 decision). One route, one shape. Hand-roll the validator until a second request body appears.
- **Don't wire generated Supabase types until jsonb shapes are defined.** Wiring prematurely forces `as unknown as Database[...]['Insert']` casts at every write site — re-introducing the exact anti-pattern Pass 4 removed. Do the type shapes first, then wire.
- **Don't extract the `Math.round(toNum(...))` pattern.** Already absorbed by `toNum`; the `Math.round` is a float-vs-int rounding concern, not coercion. Inlining keeps intent local.

---

## Tracking

### Fixed during sweep

- [x] Deleted orphan `scripts/migrate-002.cjs` (Pass 1, `739aa6c`)
- [x] Removed dead `DataFreshness.status` prop (Pass 1, `739aa6c`)
- [x] Removed dead `PlayerLifecycle.returning` prop (Pass 1, `739aa6c`)
- [x] Removed unreachable narrative `default:` branches (Pass 1, `739aa6c`)
- [x] Deduped 21 `parseFloat(String(...))` call sites via `toNum` (Pass 2, `c4f4164`)
- [x] Removed unused `postgres` dependency (Pass 3, `dd0acf2`)
- [x] Moved `dotenv` to devDependencies (Pass 3, `dd0acf2`)
- [x] Removed the one `as unknown as` cast via `parseHealthScore` (Pass 4, `4899833`)
- [x] Hoisted `Date.now()` out of Server Component render body via `isStale` (Pass 4, `4899833`)
- [x] Added `cn()` return type annotation (Pass 4, `4899833`)
- [x] Extracted `computeLifecycleData` + `computeCountryGrowthData` (Pass 5, `56a6c8d`)
- [x] Fixed null-handling bug where `returning_players === 0` was silently dropped (Pass 5, `56a6c8d`)

### Open — Quick wins

- [ ] Add `sentinel` script to `package.json` (`tsc --noEmit && eslint && vitest run && next build`)
- [ ] Apply migration 003 (revoke anon TRUNCATE; from `_security/04-database-rls.md`)
- [ ] Seed `methodology_versions` v2 row (from `_db-audit/` Pass 4)
- [ ] Rotate trailing-`\n` Vercel env values (from `_security/01-secrets.md`)
- [ ] `npm audit fix` for dev-tree transitives (paired with vitest patch bump)

### Open — Structural (needs design)

- [ ] Define jsonb domain types (`lib/types.ts`), then wire `lib/database.types.ts`
- [ ] Fix annual collector `collected_at` update (from `_db-audit/`)
- [ ] `country_snapshots` 1000-row mitigation (from `_audit/` + `_db-audit/` Pass 2)
- [ ] `next` 16.1.6 → 16.2.4 (high-severity CVE, deploy-window bump)
- [ ] Null-guard `returning_players ?? 0` / `unique_players ?? 0` silent coercions in `lib/collectors/health-scorer.ts` + `lib/collectors/forecaster.ts` (Pass 5 called it out; only fixed the user-visible site in `app/page.tsx`)

---

## Cross-references

Findings surfaced by this sweep that overlap earlier audit passes — each is worth de-duping against its source before acting:

- **`_audit/` (frontend audit).**
  - `country_snapshots` row cap (Pass 2) — surfaces again in this sweep and in the DB audit.
  - `date-fns` single-consumer (Pass 5) — noted but kept (swap to `Intl.RelativeTimeFormat` is a scope call, not dep hygiene).
  - Dead-prop callouts (`DataFreshness.status`) — consumed by this sweep's Pass 1.
- **`_security/` (security scan, commit `5007085`).**
  - Trailing-`\n` Vercel env values (Pass 1) — open; defensive `.trim()` on `IFPA_API_KEY` only.
  - Migration 003 (anon TRUNCATE revoke, Pass 4) — file exists, not applied.
  - Zod deferral for admin route (Pass 3) — still the right call (see "rejected on principle").
- **`_db-audit/` (database audit).**
  - `annual_snapshots.collected_at` never updates post-backfill — real bug, open.
  - `methodology_versions` v2 row missing — 47 dangling FK-style references.
  - `country_snapshots` 1000-row cap — same finding as frontend Pass 2.

---

## Files touched (net)

New files:
- `lib/derivations.ts` (+120 LOC) — `computeLifecycleData`, `computeCountryGrowthData`
- `lib/__tests__/derivations.test.ts` (+105 LOC, 10 tests)

Modified:
- `lib/utils.ts` — `toNum`, `toNumOrNull`, `isStale`, `cn()` return type
- `lib/health-score.ts` — `parseHealthScore`, `isBand`
- `lib/supabase.ts` — `TypedSupabaseClient` alias (placeholder for future wiring)
- `lib/collectors/health-scorer.ts` — `toNum` applied
- `lib/narrative.ts` — `PillarKey` union, defaults removed
- `app/page.tsx` — 300 → 267 LOC; `toNum` + `parseHealthScore` + `isStale` + `computeLifecycleData` + `computeCountryGrowthData`
- `components/data-freshness.tsx` — `isStale` prop; purely presentational now
- `components/player-lifecycle.tsx` — dead prop removed
- `package.json` + `package-lock.json` — `-postgres`, `dotenv` dep group move

Deleted:
- `scripts/migrate-002.cjs`
