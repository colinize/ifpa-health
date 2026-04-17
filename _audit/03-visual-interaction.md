# Pass 3 — Visual & Interaction Quality

## Changes Since Last Audit

- Pass 1 deferred 2 `react-hooks/set-state-in-effect` errors (`theme-toggle.tsx:11`, `detail-drawer.tsx:69`). **Both resolved this pass** (root-causes below).
- Pass 2 tightened `select('*')` queries. No rework to those.
- New lint finding surfaced this pass: `react-hooks/purity` error on `Date.now()` call during render in `data-freshness.tsx:14`. **Not fixed this pass** (scope creep — reported for Pass 4 or a dedicated purity sweep).

## Summary

- **Fixes applied:** 2 set-state-in-effect errors rewritten to `useSyncExternalStore`. No hex tokens found to migrate; design system is clean.
- **Lint:** 5 errors → 3 errors (2 remaining are `scripts/migrate-002.cjs` ops code; 1 is the newly-surfaced `Date.now()` purity in `data-freshness`).
- **Tests:** 29/29 passing.
- **Severity counts:** 🔴 0 · 🟠 2 · 🟡 4 · 🔵 3 · ⚪ 6.

## 1. Design System Consistency

Grepped for hardcoded color values (`#rrggbb`, `rgb()`, `bg-[#...]`, `text-[...]`) across `app/` + `components/`. Results:

| Pattern | Hits | Notes |
|---|---|---|
| `#rrggbb` / `#rgb` hex literals | **0** | Clean. |
| `rgb()` / `rgba()` literals | **0** | Clean. |
| Arbitrary Tailwind color values (`bg-[#…]`, `text-[#…]`) | **0** | Clean. |
| Arbitrary non-color Tailwind values | **4** | `border-l-[3px]` in `monthly-pulse.tsx:47`, `text-[10px]` twice in `year-table.tsx:67,91`, `min-w-[120px]` in `country-growth.tsx:41,65`. Non-color, purely sizing — no token exists for these values. |

All 38 color usages go through CSS tokens: `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`, `text-up`, `text-down`, `text-flat`, `bg-up`, `bg-down`, `border-up`, `border-down`, `border-flat`, `bg-band-*`. Gauges and sparkline resolve `var(--band-*)` / `var(--flat)` / `var(--muted-foreground)` via inline `style` or `stroke`/`fill` with `currentColor`.

`.light` variants: every token in `:root` is mirrored in `.light` in `app/globals.css:80-111`. Functional (`--up/--down/--flat`) and band colors are intentionally identical across themes (documented in the CSS). No token is styled for one theme only.

⚪ **INFO** — Design system is consistent end-to-end.

## 2. Typography Hierarchy

Page heading map (top to bottom, including drawer contents):

```
<h1>  app/page.tsx:194          "IFPA Health"                (page wordmark, once)
<h3>  detail-drawer.tsx:107     "Player Flow"                (uppercase label)
<h3>  detail-drawer.tsx:117     "{year} Forecast"            (card title)
<h3>  detail-drawer.tsx:145     "Monthly Pulse"              (uppercase label)
<h3>  detail-drawer.tsx:154     "Players by Country"         (uppercase label)
<h3>  detail-drawer.tsx:163     "Year-over-Year"             (uppercase label)
```

🟡 **MEDIUM** — **Heading skip.** The page jumps `<h1>` → `<h3>` with no `<h2>` in between. Per the audit spec, this is a flag. The drawer's five section titles are conceptually "level 2" groupings of the drawer itself. **Not auto-fixed** because the visual hierarchy was deliberately chosen (all five sections have equal visual weight as small uppercase labels, and one of them — the Forecast title — is a larger `text-lg font-semibold` that already looks like the "primary" h2 in its group). Report: either (a) promote all five drawer section titles to `<h2>` and leave the inner Forecast title at `<h3>`, or (b) add a single `<h2 class="sr-only">Detail breakdown</h2>` inside the drawer to satisfy the hierarchy without visual change. Owner call.

Other text:
- Headline uses `text-lg font-semibold tracking-tight` (smaller than card values — intentional minimalism).
- Card question uses `text-sm text-muted-foreground`.
- Card value uses `text-3xl font-bold` — the largest text on the page, which is correct.
- Narrative uses `text-lg text-muted-foreground` — visibly distinct from both headline and card values.
- Gauge score: `44px` inline SVG `<text>` (bold 700). Projected: `36px` (bold 700). Band label: `text-base font-bold`.

⚪ **INFO** — Typography hierarchy is otherwise coherent; skip is the only flag.

## 3. Spacing Rhythm

Scale in use across page + components:

| Token | Count | Context |
|---|---|---|
| `gap-1.5`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-8` | 20+ | card rows, section stacks, answer grid |
| `space-y-2`, `space-y-3`, `space-y-8` | 8 | drawer sections, CountryGrowth rows, PlayerLifecycle rows |
| `py-4`, `py-8`, `py-1.5`, `py-2` | ~15 | headers, footers, table cells |
| `px-2`, `px-4`, `md:px-6`, `px-5` | ~15 | cards, table cells, header |
| `pb-8`, `pt-1` | 2 | drawer inner + lifecycle summary |
| `mt-1`, `mt-3`, `mt-8`, `-mt-1`, `-mt-2` | 6 | header/card micro-nudges |
| `mb-2` (`-mb-2`) | 1 | year label pull-up |
| `ml-auto`, `ml-1` | 2 | lifecycle summary, est. suffix |

**Arbitrary pixel values:** `border-l-[3px]` (monthly pulse accent, intentional non-token thickness), `text-[10px]` (legend footnotes, smaller than the `text-xs` token), `min-w-[120px]` (country change column). All three are intentional micro-choices, not token drift.

⚪ **INFO** — Spacing is a consistent multiple-of-4 rhythm with 3 intentional outliers. No action.

## 4. Gauge Quality

### `components/health-score-gauge.tsx`

- **Count-up start.** `useState(0)` → `useEffect` runs RAF from 0 to `clampedScore`. On each prop change the effect re-runs (dep `[clampedScore]`) and resets `startTime`. ✅ Count-up starts at 0 every time; no stale-value flash because the initial state is deterministically `0`. Note: on a re-render where only `band` changes but `score` does not, the RAF loop does not restart (dep array excludes `band`), which is correct.
- **Arc sweep final frame.** `dashOffset = circumference - progress` is computed from the **prop** `score`, not from `displayValue`. So the arc sweeps smoothly via CSS `transition: stroke-dashoffset 0.6s ease-out`, and the final frame is always `circumference - (score / 100) * circumference`. ✅ Prop-correct final state.
- **Mild dissonance:** the number count-up runs 800ms with JS ease-out, but the arc uses a 600ms CSS ease-out. They start and end at the same frame but travel at different speeds. 🔵 **LOW** — visual polish nit. Not fixed (out of scope — pass-3 rule forbids gauge redesign).
- **`band` → color.** Via inline `style={{ color }}` on the band label and `stroke={color}` on the arc, both resolving `var(--band-*)`. ✅ Token-driven, not hardcoded.
- **`score === 0` edge case.** `clampedScore = 0` → `progress = 0` → `dashOffset = circumference` (full arc hidden). `displayValue` animates 0 → 0 (no-op). Band label renders whatever `band` is (defaults to `'stable'` in `app/page.tsx:205`). ✅ Zero state renders cleanly — just a grey track and a `0`.
- **`score === 100` edge case.** `clampedScore = 100` → `progress = circumference` → `dashOffset = 0`. The arc reaches its terminus at exactly `endX = cx + r = 180, endY = 100`. The `strokeLinecap="round"` caps are drawn at both ends regardless; they do not exceed the viewBox because `overflow-visible` is set. ✅ Clean terminus.

### `components/projected-gauge.tsx`

- **No animation** (Server Component). Dashoffset is applied statically — render-perfect.
- **Arc + color** — same `bandColors` map, identical `var(--band-*)` behaviour.
- **`ciLow === ciHigh` edge case.** `ciLength = ciHighPos - ciLowPos = 0`. The CI range arc is inside `{ciLength > 0 && …}` (L58), so it is **not rendered at all** when `ciLow === ciHigh`. ✅ Intentional early-out; no zero-width stroke artefact.
- **`score === 0` / `score === 100`.** Same clamp logic as the primary gauge. ✅ Clean.
- **Range label.** Shows `{ciLow}–{ciHigh}`, e.g. `55–55` when collapsed. Visually fine; reads as "tight confidence."

⚪ **INFO** — Both gauges are structurally sound. No hydration flash, no hardcoded arc colors, no NaN edge paths.

## 5. Detail Drawer

### Previous state — 🔴 resolved

The effect at `components/detail-drawer.tsx:66-74` read `localStorage.getItem(STORAGE_KEY)` and called `setIsOpen(true)` synchronously, which was the `react-hooks/set-state-in-effect` error and caused a client-only re-render after hydration.

**SSR safety check:** `localStorage` was only accessed inside `useEffect`, so **no SSR crash risk** (this claim from Pass 1 verified on re-read). The bug was purely a React purity-rules violation, not an SSR crash.

### Root cause

The effect was using `localStorage` as a one-shot initialization source. The correct React 19 pattern for "read external mutable state into React" is `useSyncExternalStore`, which gives React a typed, SSR-safe way to:
1. Return a deterministic server snapshot (closed).
2. Subscribe to real future changes (cross-tab `storage` event).
3. Re-read on hydration without a setState cascade.

### Fix applied

`components/detail-drawer.tsx:51-78`:
- Replaced `useState + useEffect` with `useSyncExternalStore(subscribeStorage, getStoredOpen, getStoredOpenServer)`.
- `getStoredOpen()` guards `typeof window === 'undefined'` defensively even though the hook only runs client-side.
- Kept a `sessionOpen` state (nullable) for user interactions so that after a toggle in-session, the drawer respects the user's most recent click rather than racing against the storage event.
- Added `open={isOpen}` as a prop on the `<details>` element so React controls the DOM attribute (previously `detailsRef.current.open = true` was manually assigned — replaced by declarative control).

### Other drawer checks

- **Default state closed on first visit.** `getStoredOpen()` returns `false` when `STORAGE_KEY` is unset. ✅
- **Persists after reopen.** `handleToggle` writes to `localStorage`. Next load, the `useSyncExternalStore` hook reads it. ✅
- **Keyboard.** Still a native `<details>`/`<summary>` — Enter/Space toggle it (browser default). Nothing changed about the element type. ✅
- **Layout shift.** Drawer is the last element before the footer. Opening it pushes only the footer down; main content above is stable. ✅

## 6. Sparkline Edge Cases

`components/sparkline.tsx` walkthrough:

| Case | Behaviour | Verdict |
|---|---|---|
| Empty array (`length === 0`) | `data.length < 2` early-returns `null` (L14). | ✅ No crash, no NaN, renders nothing. |
| Single value (`length === 1`) | Same early return (`< 2` covers 1). | ✅ Renders nothing rather than a single dot. |
| Two values, identical (all-equal subset) | `min === max` → `range = max - min || 1` (L18) falls back to `1`. Points compute to identical y; polyline is flat at `paddingY + plotHeight` (bottom). | ✅ No divide-by-zero; renders a flat line at the bottom edge. |
| All zeros (`[0, 0, 0]`) | `min = max = 0`, `range = 1` (fallback). Every point computes y = `paddingY + plotHeight - (0/1)*plotHeight = paddingY + plotHeight`. Flat line at the bottom. | ✅ Clean flat line. |
| Monotonic increasing | Last value = max; last y = `paddingY` (top). Smooth diagonal up. | ✅ |
| Monotonic decreasing | First value = max; last y = `paddingY + plotHeight` (bottom). Smooth diagonal down. | ✅ |
| Large values (1M+) | All math is relative (min/max normalized). 1M vs 1.1M renders identically to 10 vs 11. | ✅ |

🔵 **LOW** — **Single-value case renders nothing.** The audit spec flags this explicitly: "Single value: render a dot or flat line, not NaN path." Current code returns `null`. This is not a crash but a slight UX gap (brand-new data year shows no sparkline). Not fixed inline — changing it from `null` to a flat-line+dot would add ~10 lines and is a visual decision better made by the owner. Report only. All-zeros and monotonic cases are already correct.

## 7. Answer Card Trend Label

`components/answer-card.tsx`:

- **Em-dash (`\u2014`).** The page passes `'\u2014'` as the fallback value string (`app/page.tsx:227, 233, 239`). React renders it correctly as U+2014 EM DASH. ✅
- **`priorYear?.year` guard.** In `app/page.tsx:140-145` and `:182-187`, the `getTrend` / `getRetentionTrend` helpers build strings like `` `+${x}% vs ${priorYear?.year ?? ''}` ``. When `priorYear` is undefined, this yields `"+5.2% vs "` with a trailing space and empty year. Visually poor.

  🟠 **HIGH pre-fix** — flagged by Pass 3 spec as a guard gap. However, tracing the upstream condition: `playerYoyPct`, `retentionDelta`, `tournamentYoyPct` all require `priorYear` to be defined to produce a non-null value (see `app/page.tsx:122-132`). So every time the label string is built with a non-null delta, `priorYear` is defined. And when the delta is `null`, the `getTrend(null)` branch returns `{ direction: 'flat', label: 'No data' }` — no year in the string at all.

  **Net:** The `?? ''` fallback is dead code in practice. No visible `"vs "` empty-year label can reach the UI. Downgraded to 🔵 **LOW** — the fallback could be removed as dead code for clarity, but it's also a reasonable belt-and-suspenders. No fix applied.

- **Colors.** `text-up` / `text-down` / `text-flat` resolve via `@theme inline { --color-up: var(--up); … }` in both themes. `--up`, `--down`, `--flat` have identical oklch values in `:root` and `.light`, so both themes render the trend label in the same functional color. ✅

## 8. Mobile 375px (simulated)

Walking the class strings end-to-end for viewport width 375px (below `md:` breakpoint at 768px):

| Surface | Class chain | At 375px |
|---|---|---|
| Header | `flex items-center justify-between px-4 md:px-6 py-4 max-w-4xl mx-auto w-full` | Single row. Wordmark + freshness badge on the left (wordmark has `whitespace-nowrap`, badge is `text-xs`), theme toggle on right. Fits comfortably. |
| Main | `flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full px-4 md:px-6 pb-8 gap-6 md:gap-8` | 16px horizontal padding. Gap shrinks to 24px on mobile. |
| Gauge | `width="200" height="120"` fixed SVG | 200px fits inside 375 − 32 = 343px of content width with room. ✅ |
| Projected gauge | `width="120" height="72"` | Fits easily. ✅ |
| Answer grid | `grid grid-cols-1 md:grid-cols-3 gap-4` | **Collapses to 1 column at 375px.** ✅ Each card renders full-width. |
| Drawer contents | `max-w-4xl mx-auto px-4 md:px-6 space-y-8` | 16px padding inside drawer. |
| `MonthlyPulse` grid | `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2` | 3 columns at 375px (375−32−16 ≈ 109px per cell). Two-digit year + 4-digit count fits in `font-mono` at `text-lg`. Tight but works. |
| `CountryGrowth` row | `grid-cols-[1fr_auto_auto] gap-x-4` | Country name truncates (`truncate` class, L60), player count + change fit. `min-w-[120px]` on change column may push overflow at very narrow widths. Acceptable. |
| `YearTable` | wrapped in `overflow-x-auto` | Horizontal scroll if needed. ✅ |
| `PlayerLifecycle` | `w-36 shrink-0` label, `w-20 shrink-0` value | 144 + 80 + gap = ~240px reserved. Bar gets remaining 100px+. Fits. |
| Footer | `text-center text-xs py-4` | Single line: "Data from IFPA API. Not affiliated." — fits at 375px. |

🔵 **LOW** — `MonthlyPulse` at 375×3 cols is tight. At `sm:` (640px) it jumps to 4 cols. Not a bug.

⚪ **INFO** — Mobile layout is sound without code changes. The dashboard is explicitly desktop-first per CLAUDE.md; mobile is a secondary surface that still works.

## 9. Theme Toggle

### Previous state — 🔴 resolved

`components/theme-toggle.tsx:11` used `setIsLight(document.documentElement.classList.contains('light'))` inside an effect. Same anti-pattern as the drawer — reading external state into React state via a setState-in-effect.

### Root cause

The `<html>.light` class is set pre-paint by the inline script in `app/layout.tsx:43-47` based on `localStorage.getItem('theme')`. React has no way to know this at render without reading the DOM. The lazy approach (setState in effect after hydration) causes a cascading render that the `react-hooks/set-state-in-effect` rule flags.

### Fix applied

`components/theme-toggle.tsx:1-30`:
- Replaced `useState + useEffect` with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`.
- `subscribe` uses a `MutationObserver` on `<html>` to react to class changes (bonus: if something else toggles `.light`, the icon stays in sync).
- `getServerSnapshot` returns `false` (matches the default dark theme and the pre-paint script's inaction when `localStorage` is empty).
- Icon toggle, class mutation, and localStorage write/remove logic preserved unchanged.

### Other theme checks

- **Class toggle on `<html>`.** `document.documentElement.classList.toggle('light', goLight)` works. ✅
- **FOUC prevention.** `app/layout.tsx:43-47` inline script reads `localStorage.getItem('theme')` and applies `.light` before React hydrates. It's inside `<head>` and runs synchronously before `<body>` renders. ✅ No flash.
- **`suppressHydrationWarning`** is set on `<html>` (`app/layout.tsx:41`), which suppresses the expected mismatch between SSR (`<html>`) and client-after-script (`<html class="light">`). Correct.

## Inline Fixes Applied

1. **`components/theme-toggle.tsx`** — rewrote `useState + useEffect` to `useSyncExternalStore` with MutationObserver subscription. Removed `useState` / `useEffect` imports. Resolves `react-hooks/set-state-in-effect` at L11.
2. **`components/detail-drawer.tsx`** — rewrote `useEffect` localStorage read to `useSyncExternalStore` with `storage` event subscription. Added nullable `sessionOpen` state for in-session user toggles. Added declarative `open={isOpen}` to `<details>`. Resolves `react-hooks/set-state-in-effect` at L69.

No other inline fixes were eligible:
- No hardcoded hex / `rgb()` / arbitrary Tailwind color values exist.
- No SSR localStorage crash found (both hits were already inside effects / hooks).
- Sparkline empty / single / zero / large cases all handled correctly (no guard needed).
- Trend label `priorYear?.year ?? ''` fallback is dead in practice (delta only non-null when `priorYear` exists).
- No heading skip fix applied (h1→h3 is a deliberate design choice; owner should decide between h2-promotion vs sr-only h2).

## Findings Rollup

- 🟠 **HIGH** (2): heading skip (h1→h3), `Date.now()` purity in `data-freshness.tsx` (pre-existing, now lint-visible).
- 🟡 **MEDIUM** (4): heading skip needs owner call, gauge animation-speed dissonance (arc 600ms / number 800ms), `priorYear?.year ?? ''` dead fallback, `detail-drawer` sessionOpen vs storedOpen interaction (works but adds one state-read layer).
- 🔵 **LOW** (3): single-value sparkline renders nothing, `MonthlyPulse` 3-col layout tight at 375px, `min-w-[120px]` arbitrary value in CountryGrowth.
- ⚪ **INFO** (6): design system clean, typography hierarchy otherwise coherent, spacing rhythm consistent, gauge edge cases all render correctly, theme script prevents FOUC, mobile layout sound.

## Verification

- **`npm run lint`:** 5 errors (pre-pass) → 3 errors (post-pass).
  - ✅ `react-hooks/set-state-in-effect` (theme-toggle.tsx:11) — **FIXED**.
  - ✅ `react-hooks/set-state-in-effect` (detail-drawer.tsx:69) — **FIXED**.
  - ⬜ `react-hooks/purity` (data-freshness.tsx:14 — `Date.now()` during render) — pre-existing, not in Pass 3 scope.
  - ⬜ 2× `@typescript-eslint/no-require-imports` in `scripts/migrate-002.cjs` — ops code, out of scope.
- **`npx vitest run`:** 29/29 passing (health-score 14, narrative 7, projected-score 5, forecast 3). Unchanged from baseline.
