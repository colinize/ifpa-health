# Pass 1 — Dead Code Removal

**Date:** 2026-04-17
**Scope:** First sweep. Audit unused imports/exports/functions, commented-out blocks, orphan files.
**Inputs:** Spec at `docs/process/code-health-sweep.md`, priors from `_audit/` (frontend audit) and `_security/` (security scan).

---

## Changes Since Last Sweep

**N/A — first code-health sweep.** `_refactor/` did not exist. Prior passes on this codebase were the frontend audit (`_audit/01-inventory.md` through `_audit/05-performance.md`) and the security scan (`_security/01-secrets.md` through `_security/04-database-rls.md`). The security scan's inline code changes were committed in `5007085` just before this pass so the sweep diffs against a clean working tree.

---

## Baseline Health

Commands run from project root.

| Check | Exit | Notes |
|---|---|---|
| `npx tsc --noEmit` | **0** | Clean. No type errors. |
| `npm run lint` | 0 (reports) | **3 errors + 1 warning.** 1 `Date.now()` purity error in `components/data-freshness.tsx:14` (out of scope for Pass 1 — it's a real React-purity rule flag, not dead code). 2 `@typescript-eslint/no-require-imports` errors in `scripts/migrate-002.cjs`. 1 unused-var warning also in `migrate-002.cjs`. |
| `npx vitest run` | **0** | 29/29 tests pass across 4 files (forecast 3, health-score 14, narrative 7, projected-score 5). |

Baseline matches the state recorded in the prompt brief. No regressions — safe to proceed with Pass 1 fixes.

---

## Audit Findings

Severity scale: 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🔵 LOW / ⚪ INFO.

### 🟡 F1 — `scripts/migrate-002.cjs` is dead (orphan, one-off served)

**File:** `scripts/migrate-002.cjs` (35 lines).
**What it does:** Probes `forecasts.projected_unique_players`; if missing, prints the manual SQL the operator should paste into the Supabase Dashboard SQL Editor. Otherwise prints "Columns already exist!"
**Why dead:**
- Migration `002_forecast_player_columns.sql` is present in `supabase/migrations/` (the canonical DDL).
- The database audit (per session notes) confirmed the columns are applied.
- Nothing imports or invokes this script.
- The script is the sole source of the 2 `@typescript-eslint/no-require-imports` lint errors + 1 unused-var warning. Deleting it closes all three without changing production behavior.

**Action:** Delete.

### 🟡 F2 — `DataFreshness.status` prop is dead

**File:** `components/data-freshness.tsx`, interface `DataFreshnessProps`.
**What it is:** The prop interface declares `lastRun: { completed_at: string; status: string } | null`, but the component body destructures only `completed_at`. `status` is never read.
**Caller:** `app/page.tsx:198` passes `latestRun` from `collection_runs.select('completed_at, status')`. The `status` column is fetched but never consumed by the only caller.
**Flagged by:** frontend audit Pass 1 (`_audit/01-inventory.md`).

**Action:** Remove `status` from the prop interface. Left the `.select('completed_at, status')` clause in `app/page.tsx` alone — trimming the query shape is data-layer work more naturally owned by Pass 2 (duplication) / Pass 4 (type hygiene).

### 🟡 F3 — `PlayerLifecycle.returning` prop is dead

**File:** `components/player-lifecycle.tsx`, interface `PlayerLifecycleProps`.
**What it is:** Declares `returning: number`, but `PlayerLifecycle` (line 15-22) only destructures `priorYear, currentYear, priorTotal, churned, newPlayers, currentTotal`. `returning` is never read. Churn rate is computed from `churned / priorTotal`, not from `returning`.
**Caller:** `app/page.tsx:73-83` passes `returning: latestYear.returning_players`.
**Not flagged by previous audits** — discovered in this pass.

**Action:** Remove `returning` from the prop interface and from the caller's `lifecycleData` object.

### 🔵 F4 — `lib/narrative.ts` `default:` branches are unreachable

**File:** `lib/narrative.ts`, functions `formatEvidence` and `formatSecondary`.
**What it is:** Both functions switch on `key: string` with cases for `'tournaments'`, `'players'`, `'retention'` and a `default:` branch that returns `` `${key} at ${rawValue.toFixed(1)}` ``. The only producer of `key` is `computeHealthScore` in `lib/health-score.ts`, which always emits exactly those three component keys. The default branches cannot run.
**Flagged by:** frontend audit Pass 2.
**Subtlety:** TypeScript *requires* a default (or exhaustive switch via a union type) because `key` is typed as `string` (from `Object.entries` of a `Record<string, ComponentScore>`). Naively deleting the defaults would cause `TS7030: Not all code paths return a value`.

**Action:** Narrow `PillarEvidence.key` from `string` to the union `'players' | 'retention' | 'tournaments'`. Cast once at the `Object.entries(...)` boundary with a short justifying comment (the scorer is the sole writer of `components`). Drop both `default:` branches.

### ⚪ F5 — `scripts/{backfill,recompute-v2-score,recompute-forecast}.ts` kept

Per the spec these are manually-invoked ops scripts; not orphans despite having no import-site in the app.

### ⚪ F6 — No unused exports found in `lib/`, `components/`, or `app/`

Every exported function/interface has at least one reachable import (spot-checked 14 suspect names: `interpolate`, `getBand`, `computeHealthScore`, `computeMonthlyWeights`, `computeForecast`, `computeTrendLine`, `computeProjectedScore`, `generateNarrative`, `sanitizeErrorMessage`, `verifyBearer`, `badgeVariants`, `TrendReference`, `TournamentSearchResult`, `ifpaClient`). All wired.

### ⚪ F7 — No commented-out code blocks (≥3 lines)

The ripgrep multiline match across `app/ lib/ components/ scripts/` returned 24 files, but every hit was a header comment block (`// --- Forecaster --- ...`) or a Supabase-type doc comment. No abandoned code paraded as commentary.

### ⚪ F8 — No unused imports

Spot-checked every file under `app/`, `components/`, `lib/`, `scripts/`. Every import is referenced. `lib/utils.ts` is tiny and exports just `cn` (used). `lib/sanitize.ts` / `lib/auth.ts` are new and clean.

### ⚪ F9 — Stale env vars: none

`process.env.*` readers cross-checked against the five documented vars in CLAUDE.md (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, `CRON_SECRET`). All five are in use; no unknown names appear.

### ⚪ F10 — Stale collector paths: none

All 6 collectors wired:
- `daily-collector`, `health-scorer`, `forecaster` → `app/api/cron/daily/route.ts`
- `annual-collector`, `monthly-collector`, `country-collector` → `app/api/cron/weekly/route.ts`

### ⚪ F11 — `supabase/.temp/` untracked scaffolding

Noted in spec; out of scope. Left alone.

---

## Fixes Applied

| # | File | Change |
|---|---|---|
| 1 | `scripts/migrate-002.cjs` | **Deleted.** 35-line orphan whose migration is applied. Closes 2 lint errors + 1 warning. |
| 2 | `components/data-freshness.tsx` | Removed `status: string` from `DataFreshnessProps.lastRun`. Callers still pass the larger shape (structural typing allows it). |
| 3 | `components/player-lifecycle.tsx` | Removed `returning: number` from `PlayerLifecycleProps` (never destructured in the component). |
| 4 | `app/page.tsx` | Removed `returning: latestYear.returning_players` from `lifecycleData` object (consumer no longer reads it). |
| 5 | `lib/narrative.ts` | Added `type PillarKey = 'players' \| 'retention' \| 'tournaments'`. Cast `key as PillarKey` once at the `Object.entries` boundary with a justifying comment. Deleted the unreachable `default:` branches in `formatEvidence` and `formatSecondary` (8 lines). |

No files moved to `_refactor/_removed/` — `migrate-002.cjs` is trivially recoverable from git history.

No `// REVIEW:` comments added — every uncertainty landed a decision.

---

## Verification (Post-Fix)

| Check | Exit | Result vs Baseline |
|---|---|---|
| `npx tsc --noEmit` | **0** | Clean (unchanged). |
| `npm run lint` | 0 (reports) | **1 error, 0 warnings.** Drop of **2 errors + 1 warning** — all from the deleted `scripts/migrate-002.cjs`. Remaining error is the pre-existing `Date.now()` purity rule in `data-freshness.tsx:14` (explicitly out of Pass 1 scope per the brief). |
| `npx vitest run` | **0** | 29/29 tests pass (unchanged). |

Net: lint error count decreased from 3 → 1 as predicted in the brief. Typecheck and tests held steady.

---

## Lines Removed

| Category | Approx Lines |
|---|---|
| `scripts/migrate-002.cjs` deletion | 35 |
| Narrative unreachable defaults | 8 (2 × 4-line `default:` blocks) |
| `returning` prop + usage | 2 |
| `status` prop field | 0 (single-char type field) |
| **Total** | **~45 lines** |

---

## Deferred To Later Passes

- `components/data-freshness.tsx:14` `Date.now()` React purity error — behavioral fix (render should be deterministic; staleness check belongs in effect or on the server). Track in Pass 4 (type/pattern hygiene) or leave for a targeted follow-up.
- `app/page.tsx` Supabase `.select('completed_at, status')` for `collection_runs` still fetches `status` but nothing consumes it post-F2. Query-shape trimming is Pass 2 (duplication) / Pass 4 territory.
- `parseFloat(String(...))` coercion duplication — explicitly Pass 2.
- `as unknown as HealthScoreResult` cast in `app/page.tsx:87` — explicitly Pass 4.

---

## Output

- **File:** `_refactor/01-dead-code.md`
- **Lines:** this file.
- **Commit:** single commit `refactor: pass 1 — dead code removal`. No push, no amend.
