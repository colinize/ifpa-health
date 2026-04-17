# Pass 3: Dependency Hygiene

**Date:** 2026-04-17
**Prior passes:** `739aa6c` (dead code), `c4f4164` (duplication)

## Baseline Health

- `npx tsc --noEmit` — clean
- `npm run lint` — 1 error (Date.now purity in `components/data-freshness.tsx:14` — Pass 4 scope)
- `npx vitest run` — 29/29 passing
- `npm run build` — clean, 6 routes (1 static, 5 dynamic)

Baseline matches the spec handoff. No regressions carried into this pass.

## Inventory

### Dependencies (before)

| Package | Version | Used? | Where |
|---|---|---|---|
| `@supabase/supabase-js` | ^2.95.1 | ✅ used | `lib/supabase.ts`, `scripts/backfill.ts`, `scripts/recompute-v2-score.ts` |
| `class-variance-authority` | ^0.7.1 | ✅ used | `components/ui/badge.tsx` (`cva`, `VariantProps`) |
| `clsx` | ^2.1.1 | ✅ used | `lib/utils.ts` |
| `date-fns` | ^4.1.0 | ✅ used | `components/data-freshness.tsx` (`formatDistanceToNow`) |
| `dotenv` | ^17.2.3 | ✅ used (scripts only) | `scripts/backfill.ts`, `recompute-v2-score.ts`, `recompute-forecast.ts` |
| `lucide-react` | ^0.563.0 | ✅ used | `theme-toggle.tsx`, `answer-card.tsx`, `detail-drawer.tsx` |
| `next` | 16.1.6 | ✅ used | framework |
| `radix-ui` | ^1.4.3 | ✅ used | `components/ui/badge.tsx` (`Slot`) |
| `react` | 19.2.3 | ✅ used | framework |
| `react-dom` | 19.2.3 | ✅ used | framework |
| `tailwind-merge` | ^3.4.0 | ✅ used | `lib/utils.ts` |

### DevDependencies (before)

| Package | Version | Used? | Notes |
|---|---|---|---|
| `@tailwindcss/postcss` | ^4 | ✅ used | `postcss.config.mjs` |
| `@types/node` | ^20 | ✅ used | TypeScript types |
| `@types/react` | ^19 | ✅ used | TypeScript types |
| `@types/react-dom` | ^19 | ✅ used | TypeScript types |
| `eslint` | ^9 | ✅ used | `npm run lint` |
| `eslint-config-next` | 16.1.6 | ✅ used | `eslint.config.mjs` |
| `postgres` | ^3.4.8 | 🔴 **UNUSED** | No imports anywhere. Stale scaffolding. |
| `tailwindcss` | ^4 | ✅ used | `globals.css` |
| `tsx` | ^4.21.0 | ✅ used | `npx tsx scripts/*.ts` |
| `tw-animate-css` | ^1.4.0 | ✅ used | `app/globals.css:2` (`@import "tw-animate-css"`) |
| `typescript` | ^5 | ✅ used | compiler |
| `vitest` | ^4.0.18 | ✅ used | unit tests |

### Scrutinized-per-spec findings

- 🔴 **`postgres`** — zero imports. Napkin history at `.claude/napkin.md:28` confirms: *"`postgres` npm package — no DATABASE_URL in .env.local."* All DB access is through `@supabase/supabase-js`. Remove.
- 🟡 **`dotenv`** — in `dependencies` but only used by `scripts/` (ops scripts run via `npx tsx`). Next.js auto-loads `.env.local` via `@next/env`. Nothing in `app/`, `lib/`, or `components/` imports it. Move to `devDependencies`.
- ✅ **`tw-animate-css`** — imported in `app/globals.css:2`. Keep.
- ✅ **`radix-ui`** — umbrella package. Used via `import { Slot } from "radix-ui"` in `components/ui/badge.tsx:3`. Only one primitive used, but the umbrella package is the shadcn-new-world (post-v1.4) idiom and weighs ~240 KB (tree-shakable). Keep — swapping for `@radix-ui/react-slot` is a migration, not a cleanup.
- ✅ **`class-variance-authority`** — used by `badge.tsx` (`cva`, `VariantProps`). Keep.
- ✅ **`clsx` + `tailwind-merge`** — both used in `lib/utils.ts` for `cn()`. Keep.
- ✅ **`date-fns`** — single use in `components/data-freshness.tsx` (`formatDistanceToNow`). Per frontend Pass 5 note, still only one consumer. Could be replaced by `Intl.RelativeTimeFormat` eventually, but that's a scope call, not dep hygiene. Keep.
- ✅ **`lucide-react`** — used by 3 components. Keep.

### Decision-violating deps check

Per CLAUDE.md "Key Decisions":

- ❌ Recharts — not installed. ✅
- ❌ `@supabase/auth-helpers-*`, `next-auth`, `iron-session` — not installed. ✅
- ❌ Redis / Upstash / ioredis — not installed. ✅
- ❌ Sentry — not installed. ✅ (CLAUDE.md: "not yet added")

No regressions.

### Missing deps check

Cross-ref: every `import X from '<bare>'` in source matches a `package.json` entry (or `node:` built-in):

- `next/*`, `next/font/*`, `next/server` → covered by `next`
- `node:crypto` → built-in, used in `lib/auth.ts` (added in security sweep)
- `react`, `eslint/*`, `eslint-config-next/*`, `vitest`, `lucide-react`, `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`, `radix-ui`, `dotenv`, `@supabase/supabase-js` — all declared

No phantom deps. No missing deps.

## Outdated versions (`npm outdated`, top of list)

| Package | Current | Latest | Delta | Risk |
|---|---|---|---|---|
| `@supabase/supabase-js` | 2.95.1 | 2.103.3 | minor | safe bump, defer |
| `@tailwindcss/postcss` | 4.1.18 | 4.2.2 | minor | safe bump, defer |
| `@types/node` | 20.19.32 | 25.6.0 | **major** | tied to Node 20 LTS in `engines` — keep at 20 |
| `eslint` | 9.39.2 | 10.2.0 | **major** | ESLint 10 changes flat config semantics — defer |
| `lucide-react` | 0.563.0 | 1.8.0 | **major** | 1.x renamed icons — audit + bump in a standalone pass |
| `typescript` | 5.9.3 | 6.0.3 | **major** | TS 6.0 is brand-new; let ecosystem settle — defer |

Others (`dotenv`, `tailwind-merge`, `vitest`, `react*`) are all patch-level gaps. Per spec, no upgrades in this pass.

## `npm audit --production`

| Severity | Count | Notes |
|---|---|---|
| high | 1 | `next` 16.0.0-beta.0 — 16.2.2 (multiple CVEs: HTTP request smuggling in rewrites, DoS, CSRF bypass, image cache). Fixed in 16.2.4 — defer to a follow-up Next minor bump so we can test the cron routes and HMR after. |

## `npm audit` (all, dev included)

| Severity | Count | Notes |
|---|---|---|
| high | 6 | `next` (same as above), `rollup` 4.0-4.58 (file-write via path traversal, transitive via vitest/vite), `vite` 7.0-7.3.1 (path traversal, fs.deny bypass), `picomatch` (ReDoS + glob injection) |
| moderate | 2 | transitive picomatch |

All dev-only transitives fix cleanly with `npm audit fix` (non-force). Leaving them for a follow-up commit so the fix is isolated and testable — this pass is deliberately scoped to removal, not upgrades (per the spec).

## Fixes applied

### 1. Removed `postgres` (devDep)

```
npm uninstall postgres
```

Rationale: zero imports across `app/`, `lib/`, `components/`, `scripts/`. Stale scaffolding from early Supabase exploration. All DB access is via `@supabase/supabase-js`. Napkin note at `.claude/napkin.md:28` flags it as no-DATABASE_URL-in-env.

**Lock delta:** 1 package removed (`postgres@3.4.8`).

### 2. Moved `dotenv` → devDependencies

```
npm uninstall dotenv && npm install --save-dev dotenv
```

Rationale: `dotenv` is only imported by `scripts/backfill.ts`, `scripts/recompute-v2-score.ts`, `scripts/recompute-forecast.ts` — all manually-run ops scripts (not the server runtime). Next.js 16 auto-loads `.env.local` via `@next/env`, so nothing in the deployed runtime needs `dotenv`. Moving it out of `dependencies` keeps it available to `npx tsx` (which resolves from `node_modules` regardless of dep group) but avoids shipping it as a runtime cost.

**Side effect:** npm resolved dotenv to `^17.4.2` (was `^17.2.3`) since that's the newest within the existing caret range. Patch-level bump, no behavior change.

## Verification

```bash
npx tsc --noEmit        # clean
npm run lint            # 1 error (Pass 4 territory, unchanged)
npx vitest run          # 29/29 passing
npm run build           # clean, same route map
```

All four pass. Build output matches the pre-pass snapshot — removing `postgres` had zero effect on the shipped bundle (confirming it was dead), and moving `dotenv` left bundling untouched (it wasn't in any server-runtime path to begin with).

## Deferred upgrades (not done in this pass)

1. **`npm audit fix`** to clear transitive `rollup` / `vite` / `picomatch` advisories (dev-only). Low-risk, but pairs well with the `vitest` patch bump — do both together.
2. **`next` 16.1.6 → 16.2.4** for the high-severity production advisory. Needs a deploy-window where the cron routes and ISR revalidate can be verified post-bump.
3. **`lucide-react` 0.x → 1.x** — major rename. Needs a component-by-component sweep.
4. **`@supabase/supabase-js` 2.95 → 2.103** — minor. Safe in isolation but worth bundling with the Next bump so there's one release-testing pass, not two.

No upgrades in this pass (per spec scope).

## Metrics

| Metric | Before | After | Delta |
|---|---|---|---|
| `dependencies` count | 11 | 10 | −1 (dotenv moved out) |
| `devDependencies` count | 11 | 11 | 0 (postgres removed, dotenv added, net 0) |
| Total top-level packages | 22 | 21 | −1 (postgres) |
| `node_modules` installed packages | 484 | 483 | −1 (postgres tree) |
| Runtime `dependencies` surface | `postgres`-adjacent installable | slimmer | one less production dep |

## Findings by severity

- 🔴 CRITICAL — none
- 🟠 HIGH — `next` production CVE (deferred, see above)
- 🟡 MEDIUM — `dotenv` was in runtime deps despite being scripts-only (fixed)
- 🔵 LOW — `postgres` stale scaffolding (fixed); several transitive dev advisories cleanable with `npm audit fix` (deferred)
- ⚪ INFO — `radix-ui` umbrella vs individual `@radix-ui/*` is a taste call with one primitive in use; leaving as-is

## Output

- File: `/Users/calsheimer/projects/ifpa-health/_refactor/03-dependencies.md`
- Commit: `refactor: pass 3 — dependency hygiene`
