# Code Health & Refactoring Sweep — Multi-Pass Codebase Cleanup

> **What this is:** A structured prompt system that systematically identifies AND fixes dead code, duplication, dependency bloat, type hygiene issues, and structural problems in the ifpa-health codebase. Produces actual code changes, not a report.
>
> **How to use:** Tell Claude Code: "Read docs/process/code-health-sweep.md and run all 5 passes against this codebase." Individual passes: "run Pass 3 of the code health sweep."
>
> **Works with:** Next.js 16 App Router, React 19, TypeScript 5 (strict — verify in `tsconfig.json`), Tailwind v4, Supabase, Vitest 4. No Playwright, no `npm run sentinel` script yet.
>
> **When to run:** After a meaningful set of changes, when the codebase feels crusty, or every 2–3 months. Best run AFTER the documentation swarm.

---

## MASTER INSTRUCTION

Execute **5 sequential passes**. Each has an **audit** phase (find) and a **fix** phase (change). After each pass, write findings to a markdown file in `_refactor/` at the project root, then make the actual code changes.

**Pre-flight — do ALL of this before starting Pass 1:**

1. **Read project context:**
   - Read `CLAUDE.md` — authoritative project overview. Pay particular attention to the **Known Issues & Tech Debt** section. This sweep should address as many of those as possible.
   - Read `NOTES.md` for session history and past decisions.
   - Skim `app/page.tsx` (the page is ~260 lines of render + page-local derivations — Pass 5 will scrutinize it).

2. **Establish baseline — all three must be run and recorded:**
   - `npx tsc --noEmit` — typecheck (note: `strict: true` in `tsconfig.json`)
   - `npm run lint` — ESLint
   - `npx vitest run` — unit tests (forecast, health-score, narrative, projected-score)

   Write a "Baseline Health" section at the top of `_refactor/01-dead-code.md` recording the output of all three. **If any baseline fails, STOP before starting Pass 1 and surface the failure to the user.** Don't begin refactoring on top of broken code.

3. **Check for previous sweep results:**
   - Check `_refactor/` for output from a previous sweep
   - If found, read `_refactor/00-summary.md` (especially "Remaining Tech Debt" and "Recommended Next Steps")
   - Start `_refactor/01-dead-code.md` with a "Changes Since Last Sweep" section diffing against previous findings

**Rules:**
- **Make actual changes.** Each pass results in one commit.
- **Don't break anything.** After each pass, run `npx tsc --noEmit && npm run lint && npx vitest run`. Fix breakage before moving on.
- **Be conservative with deletions.** If uncertain, leave a `// REVIEW: appears unused — confirm before deleting` comment instead.
- **One commit per pass.** Don't squash. Commit boundaries make reverts trivial.
- **Respect `lib/` vs `app/` boundaries.** Per CLAUDE.md: page-local derivations live in `app/page.tsx`; reused or tested logic earns a spot in `lib/`.
- All output files go in `_refactor/` at the project root.

---

## PASS 1: Dead Code Removal

**Output file:** `_refactor/01-dead-code.md`

**Audit phase — Find:**

1. **Unused imports** in every file under `app/`, `components/`, `lib/`, `scripts/`. Prefer `import type` for type-only.

2. **Unused exports.** Functions/types/components exported but never imported. Exceptions: framework exports (`page.tsx`, `layout.tsx`, `route.ts`, `generateMetadata`, `generateStaticParams`, `revalidate`, `dynamic`); `lib/__tests__/` fixtures.

3. **Dead functions.** Helpers in `lib/` that nothing calls. Collector helpers in `lib/collectors/` no longer wired into `app/api/cron/*/route.ts`.

4. **Commented-out code blocks** (3+ lines). Leave single-line docs, `// TODO`, `// FIXME`.

5. **Orphan files.** Nothing imports them. Exceptions: entry points, config files, migration SQL. **Scripts directory:** `scripts/backfill.ts`, `recompute-v2-score.ts`, `recompute-forecast.ts` are manually executed via `npx tsx` — do NOT flag these as orphans. Flag any *other* untriggered scripts for review.

6. **Stale environment variables.** Cross-reference `process.env.*` against CLAUDE.md's five documented vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IFPA_API_KEY`, `CRON_SECRET`. Anything else is suspicious.

7. **Stale collector paths.** 6 collectors in `lib/collectors/`. Every collector should be wired into at least one cron route OR called from a script OR documented as a one-off.

**Useful commands:**

```bash
# List every file in the project (excluding node_modules, .next)
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "./node_modules/*" -not -path "./.next/*"

# Find commented-out code blocks (3+ consecutive lines starting with //)
rg -U '^(\s*//.*\n){3,}' --glob '!node_modules' --glob '!.next' -n

# Check which collectors are imported by cron routes
rg "from ['\"]@/lib/collectors" app/api/cron

# Find all process.env.* references
rg 'process\.env\.' --glob '!node_modules' --glob '!.next' -n
```

**Fix phase — Do:**

- Delete unused imports (`import type` where types-only)
- Delete dead functions and unreachable code
- Delete orphan files (move to `_refactor/_removed/` if you want a safety net)
- Replace large comment blocks with a one-line note or delete outright
- For uncertain items, add `// REVIEW: appears unused` instead of deleting
- Run `npx tsc --noEmit && npm run lint && npx vitest run`. Fix breakage.
- Commit: `refactor: pass 1 — dead code removal`

**Document in output file:**
- Baseline health (tsc, lint, vitest)
- Files deleted + reason
- Lines removed (approximate)
- `// REVIEW:` items
- Final verify-command output

**Severity scale (used across all passes):**

- 🔴 CRITICAL — breaks build, breaks runtime, or ships secrets
- 🟠 HIGH — likely bug, noticeable bloat, or obvious misuse
- 🟡 MEDIUM — tech debt worth fixing this pass
- 🔵 LOW — cosmetic or opportunistic
- ⚪ INFO — observation, no action

---

## PASS 2: Duplication & Consolidation

**Output file:** `_refactor/02-duplication.md`

**Audit phase — Find:**

1. **`parseFloat(String(...))` coercions in `app/page.tsx`.** The single biggest duplication pattern — Supabase returns numerics as strings. Count with `rg 'parseFloat\(String\(' app/page.tsx -c`. Extract a `toNum(v: unknown, fallback = 0): number` helper to `lib/utils.ts` and replace every call. (See Pass 4 for whether the coercion is still needed at all.)

2. **Duplicated page-local derivations.** `app/page.tsx` computes lifecycle waterfall, country growth, sparkline arrays, YoY deltas. Any near-duplicate `reduce`/`map`/`sort` blocks over the same shape?

3. **Duplicate utility functions across `lib/`.** Same function in two places, or two slightly-different implementations of the same thing.

4. **Duplicate type definitions.** Same interface defined in multiple files (e.g., `HealthScore` in both `lib/health-score.ts` and `app/page.tsx`). Near-identical types with 1–2 field deltas = candidates for a shared base.

5. **Duplicate constants.** Per CLAUDE.md, score breakpoints `[-10→0, 0→50, 15→100]` and `[25→0, 35→50, 50→100]` should each appear once, in `lib/health-score.ts`. Narrative spread threshold `< 8` should appear once, in `lib/narrative.ts`.

6. **Duplicate Supabase `.select()` shapes.** Same `.select('a, b, c')` string repeated across collectors or between collectors and `app/page.tsx`. Types should flow from a single source.

7. **Duplicate error handling in cron routes.** Both `app/api/cron/daily/route.ts` and `weekly/route.ts` do: auth-check `CRON_SECRET` → insert `collection_runs` row → run collectors → update row. If copy-pasted, note here and decide whether to extract now or defer to Pass 5.

**Useful commands:**

```bash
# Count parseFloat(String( coercions in app/page.tsx
rg 'parseFloat\(String\(' app/page.tsx -c

# All parseFloat/Number/+ coercion patterns project-wide
rg 'parseFloat\(|Number\(|\+\s*String\(' --glob '!node_modules' --glob '!.next' -n

# Duplicate Supabase .select( shapes
rg "\.select\(['\"]" --glob '!node_modules' -n

# Find identical function signatures across files
rg '^export (async )?function \w+' lib/ -n
```

**Fix phase — Do:**

- Extract `toNum(v: unknown, fallback?: number): number` to `lib/utils.ts`. Replace every `parseFloat(String(...))` call.
- Consolidate duplicate utility functions into `lib/utils.ts` or a domain file (`lib/formatters.ts` if >1 formatter emerges)
- Extract shared types to the collector that owns them, or `lib/types.ts` if truly shared
- Move magic numbers to named constants in the file that owns the concept
- Update all import paths
- Verify: `npx tsc --noEmit && npm run lint && npx vitest run`
- Commit: `refactor: pass 2 — duplication consolidation`

**Document in output file:**
- `parseFloat(String(...))` count: before vs. after
- Each duplication: where it was → where it went
- New shared files created (expect at most 1–2)
- Duplication intentionally left (with reason)

---

## PASS 3: Dependency Hygiene

**Output file:** `_refactor/03-dependencies.md`

**Audit phase — Find:**

1. **Unused dependencies.** Every package must have at least one import or script reference. Scrutinize closely:
   - `postgres` (devDep) — actually used? We use `@supabase/supabase-js`.
   - `dotenv` — Next.js loads `.env.local` automatically. Only needed for standalone `tsx` scripts.
   - `tw-animate-css` — imported in `app/globals.css` or any component?
   - `radix-ui` — verify actual usage in `components/ui/`.
   - `class-variance-authority` — drop if no component uses it.

2. **Redundant dependencies.** `clsx` + `tailwind-merge` are the canonical `cn()` combo — both should be used. Flag any second date lib beyond `date-fns`.

3. **Decision-violating deps** (per CLAUDE.md Key Decisions):
   - **Recharts** — explicitly removed in v2 redesign. Reappearance = regression.
   - **Auth libraries** (`@supabase/auth-helpers-*`, `next-auth`, `iron-session`) — no auth in this project.
   - **Redis / Upstash / ioredis** — not used.
   - **Sentry** — CLAUDE.md says "not yet added." If present without wiring, it's dead.

4. **Misplaced dependencies.** Runtime-only in `devDependencies` breaks production. Build/test-only in `dependencies` bloats the runtime bundle. `vitest`, `tsx`, `@types/*`, `eslint*`, `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `postgres`, `tw-animate-css` should all be devDependencies.

5. **Outdated versions & audit.** Run `npm outdated` (major gaps) and `npm audit` (severity counts). Fix criticals.

6. **Bundle size.** Run `npm run build` and check First Load JS per route. Minimal client JS expected (theme toggle, drawer, gauge animation). Trace any outsized client bundle to its `"use client"` leaf.

**Useful commands:**

```bash
# Find unused dependencies (basic grep-based check)
for dep in $(node -p "Object.keys(require('./package.json').dependencies).join('\n')"); do
  count=$(rg "['\"]$dep" --glob '!node_modules' --glob '!package*.json' -c | wc -l)
  echo "$count $dep"
done | sort -n

# Check npm outdated & audit
npm outdated
npm audit

# Build and note First Load JS sizes
npm run build 2>&1 | tee _refactor/03-build-output.txt
```

**Fix phase — Do:**

- `npm uninstall <package>` for unused deps
- Move misplaced deps between `dependencies` and `devDependencies`
- Patch `npm audit` findings that a drop-in version bump fixes. Defer breaking upgrades to a follow-up.
- `npm install` to regenerate `package-lock.json`
- Verify: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
- Commit: `refactor: pass 3 — dependency hygiene`

**Document in output file:**
- Packages removed + reason
- Packages moved between deps/devDeps
- `npm audit` results: before vs. after
- Dependency count: before vs. after
- First Load JS: before vs. after
- Deferred upgrades with notes

---

## PASS 4: Type Hygiene

**Output file:** `_refactor/04-types.md`

**Audit phase — Find:**

1. **`tsconfig.json` strict mode.** `"strict": true` at time of writing. **Verify each run** — if it's been disabled, that's a regression, not a cleanup.

2. **`as unknown as` double-casts.** CLAUDE.md notes one in `app/page.tsx`. `rg 'as unknown as' -n`. Each is typically a Supabase return-shape workaround; fix by deriving from generated Supabase types or a narrow interface matching what `.select(...).single()` actually returns.

3. **`any` usage.** `rg ':\s*any\b|<any>|as any' -n`. Classify each: lazy (fix), intentional (comment why), or inherited (note as library limitation).

4. **The `parseFloat(String(...))` type question.** Supabase returns `numeric` as strings (no JS arbitrary precision). Decide once:
   - (a) Keep `toNum` helper (from Pass 2) that handles `string | number | null`, AND
   - (b) Generate Supabase types so row shape is `{ col: string | null }` and `toNum` consumes it.

   If types not generated yet:
   ```bash
   npx supabase gen types typescript --project-id ryteszuvasrfppgecnwe > lib/database.types.ts
   ```
   If they exist, dry-run regenerate and diff to catch drift.

5. **Missing return types on exported `lib/` functions.** High-value readability signal. Internal helpers can stay inferred.
   ```bash
   rg '^export (async )?function \w+\([^)]*\)\s*\{' lib/ -n
   ```

6. **Type assertion abuse.** `as SomeType` hiding real errors; non-null `!` without null-check justification; `@ts-ignore` without a comment. Prefer `@ts-expect-error`.

7. **Pattern consistency (folded from the dropped "pattern drift" pass):**
   - **Supabase client usage.** Two clients only (per CLAUDE.md): `createPublicClient()` for server-component reads; `createServiceClient()` for cron + admin + scripts. Flag mismatches.
   - **Collector return shape.** Every collector returns `{ records_affected, details }`. Flag deviations.
   - **Pagination.** Supabase JS client caps at 1000 rows. Any query that could exceed 1000 rows needs `.range()`. Flag unbounded queries against growing tables.

**Fix phase — Do:**

- Eliminate `as unknown as` by deriving proper types (generate Supabase types if helpful)
- Replace lazy `any` with proper types
- Add return type annotations to exported `lib/` functions
- Replace `@ts-ignore` with `@ts-expect-error` where suppression is legit
- Justify remaining `!` non-null assertions with comments
- Normalize any collector not returning `{ records_affected, details }`
- Fix Supabase client mismatches
- Verify: `npx tsc --noEmit && npm run lint && npx vitest run`. Goal: strictly fewer `as unknown as` and fewer `any`s.
- Commit: `refactor: pass 4 — type hygiene`

**Document in output file:**
- `strict` mode status
- `any`, `as unknown as`, `@ts-ignore`/`@ts-expect-error` counts: before vs. after
- Whether Supabase types were generated/regenerated
- Collector return-shape deviations fixed
- Supabase client misuse fixed
- Remaining type issues flagged

---

## PASS 5: Structural Refactors

**Output file:** `_refactor/05-structure.md`

**The highest-leverage pass for this codebase. `app/page.tsx` is the center of gravity; this pass decides what belongs there vs. in `lib/`.**

**Audit phase — Find:**

1. **`app/page.tsx` audit (the big one).** Current ~260 lines. Walk it top-to-bottom and classify each block:
   - **Fetch** — parallel Supabase queries. Keep in the page (Server Component, fine here).
   - **Derive** — lifecycle waterfall, country growth, sparkline arrays, YoY deltas. Any derivation that's (a) >~10 lines, (b) non-obvious, or (c) would benefit from a unit test earns a spot in `lib/`.
   - **Render** — JSX. Stays in the page.

   Rule (CLAUDE.md): "If a derivation is reused or tested, it earns a spot in `lib/`." Candidate extractions:
   - Lifecycle waterfall math → `lib/lifecycle.ts` + Vitest
   - Country growth → `lib/country-growth.ts` (note the "since first snapshot" caveat from CLAUDE.md known issues)
   - Sparkline array builders → `lib/sparkline.ts`
   - YoY delta helpers → `lib/utils.ts` (if small) or `lib/yoy.ts` (if it grows)

2. **Cron route duplication (`daily/route.ts` vs `weekly/route.ts`).** Both do: auth-check → insert `collection_runs` (running) → run collectors → update row → return JSON. If copy-pasted, extract `runCronJob(name, collectors)` to `lib/cron-runner.ts`. Preserve collector order exactly — health-scorer runs after daily collectors; forecaster after health-scorer.

3. **Admin route helpers (`app/api/admin/observations/*`, `calibrate/*`).** Shared plumbing: service-client creation, JSON response shape, error handling. Extract `withServiceClient(handler)` to `lib/admin-handler.ts` if duplicated. **Do NOT add auth in this pass** — that's security-scan scope. Flag for the security doc.

4. **Collector shape consistency.** 6 collectors in `lib/collectors/`: daily, annual, monthly, country, health-scorer, forecaster.
   - All should export `run{Name}Collector()` (or match the dominant pattern — establish and normalize)
   - All return `{ records_affected, details }` (also in Pass 4)
   - All use `createServiceClient()` for writes
   - Flag any collector that mixes responsibilities differently from its peers

5. **Oversized files.** Flag anything non-`page.tsx` over 300 lines. `lib/ifpa-client.ts` may be legitimately large. `lib/health-score.ts` should NOT be — if it is, something migrated in.

6. **Test coverage gaps from extractions.** Every function moved to `lib/` earns a Vitest test (at minimum a smoke test). No extraction without a test.

**Useful commands:**

```bash
# Line counts across the project
find app lib components -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | sort -n | tail -20

# Check cron route similarity (rough dedup)
diff app/api/cron/daily/route.ts app/api/cron/weekly/route.ts

# Verify collector return shapes
rg 'return\s*\{' lib/collectors/ -A 3
```

**Fix phase — Do:**

- Extract page-local derivations that meet the "reused or tested" bar to `lib/`, with Vitest tests
- Extract cron-runner wrapper if duplication is real (~50+ lines duplicated between daily and weekly)
- Extract admin-handler boilerplate if duplicated across 2+ admin routes
- Normalize collector return shape and naming to the dominant pattern
- Update imports
- Verify: `npx tsc --noEmit && npm run lint && npx vitest run`. Every extracted function has a passing test.
- Commit: `refactor: pass 5 — structural refactors`

**Document in output file:**
- `app/page.tsx` line count: before vs. after
- Functions extracted (from → to) + one-line rationale
- Cron route line count: before vs. after
- Collector deviations fixed
- New test files added
- Extractions considered and REJECTED (with reason)

---

## POST-SWEEP: Summary & Documentation Update

After all 5 passes, generate `_refactor/00-summary.md`.

### Overall Health Metrics
- Total files before → after
- Total lines removed (approximate)
- Dependencies before → after
- `any` types before → after
- `as unknown as` before → after
- `parseFloat(String(...))` count before → after
- `app/page.tsx` line count before → after
- Verify-command status: clean / warnings / errors

### Tech Debt Addressed
Map each fix back to an entry in CLAUDE.md's **Known Issues & Tech Debt** section. Mark which items are resolved and which were only partially addressed.

### Remaining Tech Debt
Items flagged but not fixed, organized by priority (CRITICAL → LOW). Format this section so it can be pasted directly into CLAUDE.md's Known Issues section.

### Documentation Updates
After writing the summary:
1. Update CLAUDE.md's **Known Issues & Tech Debt** section — strike resolved items, add any new items discovered
2. Verify the Maintenance Processes table in CLAUDE.md still points to this doc with the correct pass count (5)
3. If any patterns were reinforced (e.g., "all collectors return `{ records_affected, details }`"), make sure that rule is explicit in CLAUDE.md Code Conventions — not buried in this doc

### Final Verification
Run the full verify chain one last time and record the output:
```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```
All four must pass cleanly. If any fails, the sweep is not done.

### Recommended Next Steps
What should be done in the next sweep, or before the next feature sprint. Examples:
- Add a `sentinel` npm script that chains typecheck + lint + vitest + build (currently referenced in CLAUDE.md as a future improvement)
- Generate Supabase types if not done in Pass 4
- Add auth to `/api/admin/*` routes (security-scan scope)
- Squash the two migrations into a baseline before count grows

---

## EXECUTION NOTES

**Run order:** Always 1 → 2 → 3 → 4 → 5. Each builds on prior work.

**Re-sweep awareness:** If `_refactor/` exists, start with a "Changes Since Last Sweep" section in `_refactor/01-dead-code.md`. Diff against the previous summary.

**Verification (no `sentinel` yet):** After every pass:
```bash
npx tsc --noEmit && npm run lint && npx vitest run
```
Add `&& npm run build` for final post-sweep verification.

**Commit strategy:** One commit per pass with the exact message string specified. Makes reverts trivial.

**If the baseline is broken:** Stop. Surface the failure in the Pre-flight section and wait for a green baseline.

**Secrets:** Never include in output files. Note file + line, flag 🔴 CRITICAL.

**Intentional "wrongness":** Check CLAUDE.md Code Conventions and Known Issues first. "IFPA API response mismatches" and "use last COMPLETE year for metric cards" are documented quirks — don't "fix" them.

**Extractions without tests:** Add the test in the same pass. Extractions without tests are how regressions ship.
