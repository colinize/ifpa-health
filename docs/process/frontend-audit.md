# Frontend Audit — IFPA Health

> **What this is:** A structured prompt system for Claude Code that systematically audits the ifpa-health single-page dashboard, maps UI against data sources, and produces an actionable report. Inline fixes are applied for objectively broken things (dead code, missing a11y labels, broken handlers). Layout, IA, and feature changes are reported for human judgment.
>
> **How to use:** Tell Claude Code: "Run all 5 passes of the frontend audit." You can also run individual passes: "Pass 3 of the frontend audit."
>
> **Works with:** Next.js 16 App Router, React 19 Server Components, Tailwind CSS v4 (dark-first oklch tokens), Supabase PostgreSQL.
>
> **When to run:** After a design tweak, after adding a new metric card or drawer section, after any collector change that moves data, before sharing the dashboard publicly, or quarterly.

---

## MASTER INSTRUCTION

You are performing a comprehensive frontend audit of the ifpa-health codebase. Execute 5 sequential passes. After each pass, write findings to `_audit/{NN}-{name}.md` at the project root. End with `_audit/00-summary.md`.

This project is small: **one public route (`/`), 12 components, no auth UI, no forms, no user-generated content, all data loaded server-side with `revalidate = 3600`.** Scope your audit accordingly. Do not pad findings. A 300–400 line audit is appropriate for this scope.

### Fix-vs-report rule

- **Fix directly:** Dead code, unused imports, missing `alt` / `aria-label`, obviously broken handlers, stale TODOs for completed work, null-safety gaps that crash render, hardcoded hex where an oklch token exists, missing `rel="noopener noreferrer"` on external links.
- **Report only:** Layout changes, new sections, IA restructuring, adding/removing data surfaces, redesigning the gauge, changing what the detail drawer contains, changing copy. These require product judgment.

**Rule of thumb:** "Would this change surprise the project owner?" If yes, report it. If no, fix it.

### Severity scale

Use circle emojis for severity in every finding:

- 🔴 **CRITICAL** — broken for users today (crash, wrong number, unreadable)
- 🟠 **HIGH** — visible defect, misleading data, or a11y blocker
- 🟡 **MEDIUM** — quality issue, mild confusion, tech debt with user impact
- 🔵 **LOW** — polish, minor inconsistency, nice-to-have
- ⚪ **INFO** — observation, no action required

### Pre-flight (do all of this before Pass 1)

1. Read `CLAUDE.md` — project context, conventions, known partial-year gotcha, v2 scorer, template narrative.
2. Read `NOTES.md` (if present) for the latest session state.
3. Read `app/globals.css` (first ~80 lines) — capture the oklch token set:
   - `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`
   - Functional: `--up`, `--down`, `--flat`
   - Bands: `--band-thriving`, `--band-healthy`, `--band-stable`, `--band-concerning`, `--band-critical`
   - Light opt-in via `.light` class (dark-first)
4. Check `_audit/` for prior runs. If found, begin each pass with a **"Changes Since Last Audit"** section.
5. Verify the site runs locally: `npm run dev` → hit `http://localhost:3000` → confirm the gauge renders a number and a band label. If it errors on boot, stop and fix before auditing.
6. Run `npm run lint` and `npx vitest run` to record a baseline (there is no `sentinel` script in this project).
7. Write a brief "Pre-Flight Summary" at the top of `_audit/01-inventory.md` — tokens loaded, lint clean? tests green? prior audit present?

### Rules

- Be concrete. Don't say "shows health data." Say: "renders `healthScore.composite_score` as a 0–100 count-up inside `HealthScoreGauge`, with `healthScore.band` controlling the arc color via `--band-{variant}`."
- Reference files by absolute-from-root path (`app/page.tsx`, `components/health-score-gauge.tsx`).
- After each pass with fixes: re-run `npm run lint` and `npx vitest run`. If either breaks, fix it before moving on.
- One commit per pass that touches code. Suggested format: `audit: pass N — {short label}`.
- All output files in `_audit/`.

---

## PASS 1: Route & Component Inventory

**Output file:** `_audit/01-inventory.md`

### Instructions

1. Confirm the route tree. `app/` should contain:
   - `page.tsx` (the dashboard, Server Component, `revalidate = 3600`)
   - `layout.tsx` (root + theme script)
   - `globals.css`
   - `api/cron/daily/route.ts`, `api/cron/weekly/route.ts`
   - `api/admin/observations/*`, `api/admin/calibrate/*`
   - Flag anything else (orphan routes, test pages, leftover scaffolding).

2. For the `/` route, document:
   - **File:** `app/page.tsx`
   - **Rendering:** Server Component, `revalidate = 3600`
   - **Data:** the 6 `Promise.all()` queries (health_scores, annual_snapshots, monthly_event_counts, forecasts, collection_runs, country_snapshots)
   - **Derivations done in the page:** `completeYears` filter, `lifecycleData`, `countryGrowthData`, sparkline arrays, trend helpers
   - **Components rendered top-to-bottom**

3. Component inventory — for each component in `components/` (12 project components + `components/ui/` shadcn primitives), document:
   - **File path**
   - **RSC or `"use client"`** — note which leaves are client. Theme toggle, detail drawer animations, and the gauge count-up are the expected client leaves.
   - **Props received** (type shape, not full TypeScript)
   - **What it renders** (one sentence, concrete)
   - **Where it's used** (`app/page.tsx`, `DetailDrawer`, etc.)

   Target components:
   - `health-score-gauge.tsx` — the primary gauge, reads `score` + `band`
   - `projected-gauge.tsx` — secondary gauge, reads projected score + CI + year
   - `narrative-display.tsx` — renders the template sentence
   - `answer-card.tsx` — question / value / trend / sparkline
   - `detail-drawer.tsx` — native `<details>` wrapper with localStorage persistence
   - `data-freshness.tsx` — badge from `collection_runs`
   - `theme-toggle.tsx` — class-based `.light` opt-in
   - `monthly-pulse.tsx` — 12-month YoY bars
   - `year-table.tsx` — year-by-year data table
   - `country-growth.tsx` — sorted list
   - `player-lifecycle.tsx` — returning/churned/new waterfall
   - `sparkline.tsx` — custom SVG

4. Build a component dependency tree (ASCII is fine):
   ```
   app/page.tsx
   ├─ ThemeToggle (client)
   ├─ DataFreshness (server)
   ├─ HealthScoreGauge (client — count-up)
   ├─ ProjectedGauge (client or server?)
   ├─ NarrativeDisplay
   ├─ AnswerCard × 3
   │  └─ Sparkline
   └─ DetailDrawer (client — localStorage)
      ├─ YearTable
      ├─ MonthlyPulse
      ├─ CountryGrowth
      └─ PlayerLifecycle
   ```

5. Orphans and unused: grep for components that are exported but not imported anywhere.

### Inline fixes for Pass 1

- **Remove unused exports/imports** on `app/page.tsx` and the 12 components.
- **Delete route files that are empty or boilerplate-only** with no real behavior.
- **Fix broken internal links** (any `<a href>` pointing to a route that doesn't exist).
- **Add missing `rel="noopener noreferrer"`** to any `target="_blank"` anchor. (The IFPA footer link already has this — verify nothing regressed.)

After fixes: `npm run lint && npx vitest run`. Commit: `audit: pass 1 — inventory + cleanup`.

---

## PASS 2: Data Binding Audit

**Output file:** `_audit/02-data-binding.md`

### Instructions

This is the most valuable pass for this project. Trace every visible number, label, sparkline point, and drawer cell back to its Supabase row, collector, and IFPA endpoint.

1. Build a binding table. One row per rendered data point:

   | UI element | File:line | Value source | Supabase table / column | Collector | IFPA endpoint |
   |---|---|---|---|---|---|
   | Gauge score | `app/page.tsx:180` | `healthScore.composite_score` | `health_scores.composite_score` | `health-scorer.ts` (derived) | N/A (computed) |
   | Gauge band | `app/page.tsx:180` | `healthScore.band` | `health_scores.band` | `health-scorer.ts` | N/A |
   | Narrative | `app/page.tsx:190` | `generateNarrative(healthScore)` | template (`lib/narrative.ts`) | — | — |
   | Players answer value | `app/page.tsx:202` | `latestYear.unique_players` | `annual_snapshots.unique_players` | `annual-collector.ts` | `players_by_year` |
   | Players sparkline | `app/page.tsx:204` | `completeYears.map(unique_players)` | `annual_snapshots` | `annual-collector.ts` | `players_by_year` |
   | Retention value | `app/page.tsx:208` | `latestYear.retention_rate` (generated col) | `annual_snapshots.retention_rate` | — | `players_by_year` (derived) |
   | Tournaments value | `app/page.tsx:214` | `latestYear.tournaments` | `annual_snapshots.tournaments` | `annual-collector.ts` | `events_by_year` |
   | Projected score | `ProjectedGauge` | `projectedScoreResult.projected_score` | `forecasts.*` (computed) | `forecaster.ts` | — |
   | Forecast months-of-data | `DetailDrawer` | `forecast.months_of_data` | `forecasts.months_of_data` | `forecaster.ts` | `events_by_year` (monthly) |
   | Year table rows | `DetailDrawer > YearTable` | `completeYears` | `annual_snapshots` | `annual-collector.ts` | — |
   | Monthly pulse | `DetailDrawer > MonthlyPulse` | `monthlyData` | `monthly_event_counts` | `monthly-collector.ts` | — |
   | Country growth | `DetailDrawer > CountryGrowth` | `countryGrowthData` | `country_snapshots` | `country-collector.ts` | `country_players` |
   | Lifecycle waterfall | `DetailDrawer > PlayerLifecycle` | `lifecycleData` | `annual_snapshots.returning_players` | `annual-collector.ts` | — |
   | Data freshness | `DataFreshness` | `latestRun.started_at` | `collection_runs.started_at` | (cron route writes it) | — |

2. **Flag each of the following explicitly:**

   - 🔴 **Partial-year leakage.** Any spot that uses `currentYear`/`new Date().getFullYear()` as the "latest" year in a metric card or sparkline is wrong — it will read a partial year and look like a 90% crash. The correct pattern is `completeYears[completeYears.length - 1]`. Grep for `.getFullYear()`, `currentYear`, and any `.filter(s => s.year ===` usage and classify each.
   - 🟠 **Null-handling gaps.** Trace every `?.` and default (`?? 0`, `?? '\u2014'`). If `healthScore` is null, does the gauge render 0 with band `stable`? If `latestYear` is null (fresh DB), do all three answer cards render `—`? What about `forecast === null` — does the drawer hide the forecast card?
   - 🟠 **Fetched-but-unrendered.** For each Supabase query, list which columns are `select('*')`-fetched but never read. Recommend tightening the select list (low-effort ISR win).
   - 🟠 **Rendered-but-unsourced.** Any hardcoded number, year, or label in JSX that should be data-driven but isn't.
   - 🟡 **Derivation placement.** Any page-local derivation (in `app/page.tsx`) that is reused in tests, in scripts, or in another component belongs in `lib/`. Per CLAUDE.md: page-local is OK unless it's reused or tested.
   - 🟡 **Generated columns.** `annual_snapshots.retention_rate` and `avg_attendance` are DB-generated. Verify the UI reads them as-is (never recomputes them client-side).
   - 🟡 **String-number round-trips.** `parseFloat(String(forecast.projected_tournaments))` patterns suggest numeric columns are being returned as strings. Document the pattern and whether it's necessary (PostgREST numeric → string for precision).

3. **Narrative audit.** Read `lib/narrative.ts`. For each template branch, name the state that triggers it and verify an `annual_snapshots` row configuration exists in the test fixtures that exercises it. Call out any unreachable branch.

4. **Band audit.** Read `lib/health-score.ts`. Confirm the 5 bands map to `thriving / healthy / stable / concerning / declining`. Then grep the UI for each string — flag any band value hardcoded in JSX or CSS that doesn't match the scorer's output (e.g., if the CSS token is `--band-critical` but the scorer emits `declining`, that's a mismatch — document it).

### Inline fixes for Pass 2

- **Tighten `.select('*')`** to explicit column lists where straightforward. Don't refactor query shape, just trim unused columns.
- **Fix `new Date().getFullYear()` misuse** if found outside the documented partial-year filter.
- **Add `?? null` / `?? 0` guards** where a null DB row would crash render.
- **Delete dead derivations** — any local `const x = ...` that isn't read.

Do NOT: change the set of surfaced metrics, add new drawer sections, or move derivations to `lib/` without a test to anchor them.

After fixes: `npm run lint && npx vitest run`. Commit: `audit: pass 2 — data binding`.

---

## PASS 3: Visual & Interaction Quality

**Output file:** `_audit/03-visual-interaction.md`

### Instructions

1. **Design system consistency.** Grep every component for:
   - Hardcoded hex (`#rrggbb`, `#rgb`) → replace with an oklch token where one exists.
   - Hardcoded `rgb()` / `rgba()` — same.
   - Tailwind arbitrary values (`bg-[#...]`, `text-[...]`) — replace with theme tokens (`bg-background`, `text-muted-foreground`, `text-up`, `text-down`, `text-flat`, `bg-band-{variant}`).
   - Missing `.light` variants — any token styled for dark that breaks on light theme.

2. **Typography hierarchy.** One `<h1>` per page (the IFPA Health wordmark). Everything in `DetailDrawer` should use `<h2>` / `<h3>` appropriately. Grep for `<h` tags and build a hierarchy map. Flag level skips.

3. **Spacing rhythm.** The page uses `gap-4` / `gap-6` / `gap-8`. Document the spacing scale in use and flag outliers (anything using `mt-[13px]`-style arbitrary pixels).

4. **Gauge quality checks** (`components/health-score-gauge.tsx` and `projected-gauge.tsx`):
   - Does the count-up animation start from 0 or from a previous render's value? Cache-busted hydration can cause a flash.
   - Is the arc sweep tied to `score` or to an internal animated state? Verify the final frame matches the prop.
   - Does `band` drive the arc color via CSS variable or inline style? Either is fine — flag hardcoded arc colors.
   - What happens when `score === 0` (fresh DB, no data)? The gauge should render a zero state, not animate from 0 → 0.
   - What happens when `score === 100`? Does the arc reach its terminus cleanly?
   - Does the `ProjectedGauge` CI band render when `ciLow === ciHigh` (no uncertainty)?

5. **Detail drawer behavior** (`components/detail-drawer.tsx`):
   - It uses native `<details>` / `<summary>` with localStorage persistence. **Verify SSR compatibility**: localStorage access MUST be inside `useEffect` or guarded with `typeof window !== 'undefined'`, otherwise the component crashes during server render. Flag this as 🔴 if found.
   - Default open state: closed on first visit, persists on reopen.
   - Animation: does opening cause layout shift on the rest of the page? Should be at the bottom, which makes this safe.
   - Keyboard: Enter / Space toggle the drawer (native behavior).

6. **Sparkline edge cases** (`components/sparkline.tsx`):
   - Empty array: render a placeholder line / nothing (must not crash).
   - Single value: render a dot or flat line, not NaN path.
   - All zeros: render a flat line at y = baseline, not a divide-by-zero path.
   - Monotonically decreasing vs increasing: both should render cleanly.
   - Large values (1M+): axis scale handles it.

7. **Answer card trend label readability.** Each card ends with `"+X.X% vs YYYY"` or `"Flat vs YYYY"`. Check:
   - Does the ± glyph render correctly? (The page uses `\u2014` for em-dash.)
   - Is `priorYear?.year` always defined when a trend label is shown? If `priorYear` is null, the label reads `"+5.2% vs "` (empty). Guard it.
   - Color: `direction: 'up'` uses `--up`, `'down'` uses `--down`. Verify both resolve in light mode.

8. **Mobile layout at 375px.** Open Chrome DevTools at 375×667. Document:
   - Does the header (wordmark + freshness + theme toggle) wrap ugly?
   - Gauge size — does it overflow or dominate?
   - Answer cards stack (they should, `md:grid-cols-3` collapses to 1 col).
   - Detail drawer: does the content inside respect the mobile width?
   - Footer: single line or wrap?

9. **Theme toggle.** Click it, verify `<html>` gains/loses `.light` class. Verify no FOUC (flash of unstyled content) on first load — the inline theme script in `layout.tsx` should set the class before paint.

### Inline fixes for Pass 3

- **Replace hardcoded hex** with oklch tokens where a direct mapping exists (don't invent new tokens; report if the token is missing).
- **Fix localStorage SSR crash** if found — wrap in `useEffect` or `typeof window` guard.
- **Guard empty/single/zero sparkline arrays** with an early return.
- **Guard trend labels** when `priorYear` is null.
- **Fix heading skips** (e.g., `<h1>` → `<h3>` with no `<h2>`).

Do NOT: redesign the gauge, restyle the drawer, reorder page sections, change copy, adjust spacing beyond fixing obvious outliers.

After fixes: `npm run lint && npx vitest run`. Commit: `audit: pass 3 — visual & interaction polish`.

---

## PASS 4: Accessibility & Semantic HTML

**Output file:** `_audit/04-accessibility.md`

### Instructions

1. **Landmark regions.** The page has `<header>`, `<main>`, `<footer>`. Confirm. Flag any `<div>` that should be a landmark.

2. **Heading hierarchy.** Already captured in Pass 3. Copy the map here and confirm no skips.

3. **Gauge a11y.** The gauge is SVG-based. It must be announceable:
   - `role="img"` on the root SVG.
   - `aria-label="Pinball health score: 67 out of 100, band: Healthy"` (dynamic, includes score + band).
   - `<title>` element inside the SVG as fallback for some AT.
   - The projected gauge needs its own distinct label including the year and CI range.

4. **Sparkline a11y.** Each sparkline is SVG:
   - `role="img"` + `aria-label` describing the trend in words: `"Unique players: 5 years, 12,450 to 18,720, trending up."`
   - If purely decorative because the value and trend label are already adjacent, `aria-hidden="true"` is also acceptable. Pick one pattern and apply consistently.

5. **Button labels.** The theme toggle is icon-only:
   - Must have `aria-label="Toggle theme"` (or similar) and update based on state (`"Switch to light theme"` / `"Switch to dark theme"`).
   - Must have a visible focus ring (`focus-visible:ring`).

6. **Drawer a11y.** Native `<details>` / `<summary>` is accessible by default:
   - `<summary>` is focusable and Enter/Space toggle it.
   - Verify the summary content is meaningful ("Show detail" is lazy; "Show full breakdown" or "Year-by-year data" is better — report, don't auto-fix the copy).

7. **Color contrast.** Run both themes through a checker (axe, or manual ratio check):
   - `--foreground` on `--background` — both themes, 4.5:1 minimum for body text.
   - `--muted-foreground` on `--background` — 3:1 minimum for large text, 4.5:1 for body.
   - Band colors against the card background — each of 5 bands, both themes.
   - `--up` and `--down` on card backgrounds — trend labels must be legible without relying on color alone (add icon or word prefix like "+" / "−").

8. **Keyboard-only walkthrough.** Tab through the page. Document the tab order:
   1. Theme toggle
   2. (anything in the header?)
   3. Detail drawer summary
   4. IFPA footer link
   Does the order match visual order? Is there a skip-link? (Not required for a single-page app this small, but note the absence.)

9. **Reduced motion.** `prefers-reduced-motion: reduce` should disable the gauge count-up and any drawer animations. Verify by toggling the OS-level setting or via DevTools emulation.

10. **Screen reader spot check.** Run VoiceOver (Cmd+F5) on the dashboard. Write a transcript of what gets announced top-to-bottom. Flag anything confusing ("button, button, button" with no labels).

### Inline fixes for Pass 4

- **Add missing `aria-label` / `role`** on SVG gauges and sparklines.
- **Add `aria-label`** on the icon-only theme toggle.
- **Add `<title>` inside gauges** for AT fallback.
- **Add `aria-hidden="true"`** to decorative sparklines if that's the chosen pattern.
- **Add `prefers-reduced-motion` media query** to disable the count-up animation.
- **Add visible `focus-visible:ring`** to any interactive element missing one.

Do NOT: change button text/labels (copy change), restructure the heading hierarchy (that's an IA change), change color tokens to meet contrast (that's a design decision — report and let the owner call it).

After fixes: `npm run lint && npx vitest run`. Commit: `audit: pass 4 — accessibility`.

---

## PASS 5: Performance & Rendering

**Output file:** `_audit/05-performance.md`

### Instructions

1. **ISR verification.** `export const revalidate = 3600` is on `app/page.tsx`. Confirm:
   - Hitting `/` twice in a row serves from cache (check `X-Vercel-Cache: HIT` on production or dev cache headers locally).
   - The page does NOT have `export const dynamic = 'force-dynamic'` anywhere.
   - No cookie reads / auth checks that would opt the page into dynamic rendering.

2. **ISR invalidation story.** After a cron run writes fresh data, when does the dashboard actually update?
   - Current behavior: up to 3600s (1 hour) stale window.
   - Is this acceptable for a daily-updating dashboard? Document, and flag if a `revalidateTag` or webhook-driven invalidation path should exist. **This is a report item, not a fix** — it's an architecture decision.

3. **Server vs client split.** For each component, verify the RSC/client boundary is correct:
   - Data-loading happens in `app/page.tsx` (server). ✓
   - Count-up animation, localStorage, and theme toggle are client leaves. ✓
   - Flag any component that is `"use client"` but does no client-only work (those can be promoted to server and shrink the client bundle).

4. **Client bundle size.** Run `npm run build` and check the `.next/` build output. Record:
   - Total First Load JS for `/`
   - Largest client chunk contributor
   - Any surprise imports (e.g., is `date-fns` tree-shaken, or is the whole library in the bundle?)

5. **Tailwind bundle.** `app/globals.css` compiled output size. Tailwind v4 should be lean by default. Flag if the CSS is > 50KB — likely unused token bloat.

6. **Font strategy.** `app/layout.tsx` — is it using `next/font` for Geist Sans / Geist Mono? Confirm `display: swap` behavior and that fonts are self-hosted (no runtime Google Fetch). Document.

7. **Images.** Does the page use any `<img>` or `next/image`? If none (which seems likely — gauges are SVG), note "no raster images on the dashboard." If there's an OG image for sharing, verify it exists and resolves.

8. **Query performance.** The `Promise.all()` does 6 queries. For each:
   - Are there indexes on the order-by columns? (`score_date`, `year`, `started_at`, etc.) Reference `supabase/migrations/001_initial_schema.sql`.
   - `annual_snapshots.select('*').order('year')` — if this table is small (< 20 rows), no concern. Document the row count.
   - `monthly_event_counts` — could grow. Document row count and note if a `.limit(24)` (last 2 years of monthly) would be safer.
   - `country_snapshots` — could grow fast (N countries × M snapshots). Document row count and flag if a window filter should be applied.

9. **Layout shift.** Load the page with throttled network. Does the gauge render at final size immediately, or does it pop in after data arrives? Should be zero CLS since it's SSR with data.

10. **Third-party scripts.** Grep for any external `<script>` tags, analytics, telemetry. Per CLAUDE.md: "no third-party analytics, no error tracking." Verify that's still true.

### Inline fixes for Pass 5

- **Remove `"use client"`** on components that don't actually need it.
- **Tighten `.select('*')`** to needed columns (already flagged in Pass 2 — apply here if not already done).
- **Add `.limit()`** to queries on growing tables (monthly_event_counts, country_snapshots) where the UI only needs a window.
- **Add missing `display: swap`** on `next/font` loaders if absent.

Do NOT: change the ISR strategy (architecture decision), add error tracking (Sentry is an infra choice), implement webhook invalidation (architecture decision).

After fixes: `npm run lint && npx vitest run && npm run build`. Commit: `audit: pass 5 — performance`.

---

## SUMMARY: `_audit/00-summary.md`

After all 5 passes, write the summary file. This is the one the project owner will actually read first.

### Sections

1. **TL;DR** — 3 sentences. What's the overall health of the frontend? What are the 1–3 things that matter most?

2. **Severity rollup** — counts by 🔴/🟠/🟡/🔵/⚪ across all passes. One line each.

3. **Fixed during this audit** — checkboxes, one line each, with `(Pass N)` suffix. This is the audit's changelog.

4. **Top 5 report items (prioritized)** — the non-fix recommendations that would produce the most user value. For each:
   ```
   ### [Short title] — 🟠 HIGH
   - **What:** [one sentence]
   - **Why it matters:** [user impact]
   - **Effort:** S / M / L
   - **Files:** [paths]
   - **Approach:** [3–5 line sketch]
   ```

5. **Anti-recommendations** — tempting ideas that would actually be bad here:
   - Don't add client-side data fetching. The ISR model works.
   - Don't add a charting library. The custom sparklines are fine and intentional (Recharts was removed in v2).
   - Don't add auth to the public dashboard. The admin routes are a separate problem.
   - Don't pile on new drawer sections. Detail drawer is opt-in for a reason.

6. **Open questions for the owner** — product-judgment calls the audit surfaced but didn't make:
   - Should ISR be cron-invalidated or left at 1-hour?
   - Should the "declining" band relabel to "critical" (or vice versa) to match the CSS token name?
   - Is the country-growth "since we started tracking" semantic acceptable, or should it be a rolling window?

### Checklist appendix

End the summary with a tracking checklist:

```markdown
## Tracking

### Fixed during audit
- [x] [thing] (Pass N)
...

### Open — Quick wins (< 1h)
- [ ] [thing]
...

### Open — Higher impact (1–4h)
- [ ] [thing]
...

### Open — Architecture decisions (owner)
- [ ] [thing]
```

---

## EXECUTION NOTES

- **Run order:** 1 → 2 → 3 → 4 → 5 → summary. Each builds on the prior.
- **Re-audit awareness:** If `_audit/` already exists, open each pass with a "Changes Since Last Audit" section that cites the prior findings it resolves or re-opens.
- **Never include secret values** in audit files. `.env.local` has `IFPA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` — note presence, redact value.
- **If you can't verify a claim**, say so. Better than a confident wrong finding.
- **Keep it to ~300–400 lines total across all files.** This is a single-page dashboard with 12 components. A 1,000-line audit is a smell.
- **Verification:** After any pass with fixes, run `npm run lint && npx vitest run`. If there's a future `sentinel` script (`tsc --noEmit && eslint && vitest run && next build`), use that instead.
- **Commit strategy:** One commit per pass that made changes. Makes it trivial to revert a pass if a fix was wrong.

---

## Calibration notes specific to ifpa-health

A few things this project's owner cares about that generic audits miss:

- **Partial-year handling is load-bearing.** The CLAUDE.md is blunt about it: "Use last COMPLETE year for metric cards." Any UI that reads `currentYear` directly without the complete-year filter is a 🔴 bug, not a style issue. The dashboard is meant to communicate trend — reading a partial year presents a real-looking 90% drop.
- **Band string contract.** Bands are `Thriving / Healthy / Stable / Concerning / Declining`. The CSS token for the fifth is `--band-critical`. Mismatches between the scorer's output string and the CSS variable name are a real bug — document and either rename the scorer output OR rename the token; don't silently map.
- **Template narrative, not AI.** Don't suggest "make the narrative more dynamic" or "add an LLM rewrite." Deterministic narratives are a feature, not a limitation. Any recommendation involving an API call for copy is out of scope.
- **No user features.** Don't recommend comments, ratings, reactions, favorites, or any UGC surface. The product scope is public read-only.
- **Single viewport.** The dashboard is designed to fit desktop viewport without scrolling. Detail drawer is the opt-in surface for everything else. Don't recommend adding sections to the main viewport.
- **Admin routes are known-unauthed tech debt.** CLAUDE.md acknowledges this. Don't flag it as a frontend audit finding — it's a security-scan finding. Note and move on.
- **`scripts/` is ops-only.** Don't audit it as frontend. `backfill.ts`, `recompute-*.ts` are out of scope.

---

## Companion checklist (auto-generated)

The final step of `_audit/00-summary.md` is a tracking checklist (see the Summary section above). Pre-check items that were already fixed inline during the 5 passes. This gives the project owner a single document to work from post-audit.
