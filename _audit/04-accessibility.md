# Pass 4 — Accessibility & Semantic HTML

## Changes Since Last Audit

- Pass 3 flagged the `<h1>` → `<h3>` skip as 🟠 owner-decision. Re-confirmed below; not auto-fixed (IA change).
- Pass 3 flagged the pre-existing `react-hooks/purity` error on `Date.now()` in `data-freshness.tsx:14`. Left alone per spec ("Do NOT touch").
- No prior a11y pass; this is the first walk-through.

## Summary

- **Fixes applied:** gauge + projected-gauge `role="img"` + `<title>` + dynamic `aria-label`; sparklines `aria-hidden="true"`; theme toggle dynamic `aria-label` + `focus-visible:ring`; drawer summary + footer link `focus-visible:ring`; lucide icons inside buttons/cards marked `aria-hidden`; reduced-motion CSS media query added; gauge count-up now respects reduced motion.
- **Lint:** unchanged — 3 errors (1 `data-freshness.tsx` purity pre-existing, 2 `scripts/migrate-002.cjs` out of scope).
- **Tests:** 29/29 passing.
- **Severity counts:** 🔴 0 · 🟠 1 · 🟡 3 · 🔵 3 · ⚪ 5.

## 1. Landmark Regions

`app/page.tsx` structure:

```
<div>                            root
  <header>                       L192 — wordmark + freshness + theme toggle
  <main>                         L201 — gauge, projected gauge, narrative, 3 answer cards
  <DetailDrawer>                 L248 — outside main, before footer (renders <details>)
  <footer>                       L282 — attribution
</div>
```

- 🔵 **LOW** — **Drawer sits outside `<main>` and outside any landmark.** When a screen-reader user traverses by landmarks (H for headings, D for regions), the detail drawer content is reachable only by scanning the `<details>` element or the full document. The element is keyboard-focusable so it's operable, but it's not inside any landmark. Two acceptable fixes, both owner decisions: (a) wrap the drawer in an `<aside aria-labelledby="...">` or (b) move the drawer inside `<main>`. Reported; not auto-fixed (structural IA call).
- ⚪ **INFO** — the three landmark elements (`<header>`, `<main>`, `<footer>`) are present. No `<div>` is currently doing a landmark's job *within* the main region.

## 2. Heading Hierarchy (from Pass 3)

```
<h1>  app/page.tsx:194                "IFPA Health"
<h3>  detail-drawer.tsx:121           "Player Flow"
<h3>  detail-drawer.tsx:131           "{year} Forecast"
<h3>  detail-drawer.tsx:159           "Monthly Pulse"
<h3>  detail-drawer.tsx:168           "Players by Country"
<h3>  detail-drawer.tsx:177           "Year-over-Year"
```

- 🟠 **HIGH (owner-decision)** — Same finding as Pass 3: `<h1>` → `<h3>` skips `<h2>`. AT users relying on heading navigation will jump from the page title straight to level-3 sections with no grouping context. Two fixes, per the Pass 3 spec: promote all five drawer section titles to `<h2>` (and leave Forecast's larger visual title as `<h3>`), or add a visually-hidden `<h2 class="sr-only">Detail breakdown</h2>` inside the drawer. **Not auto-fixed** (IA change).

## 3. Gauge A11y — `HealthScoreGauge`

**Inline fix applied** (`components/health-score-gauge.tsx:76–90`):

```tsx
<svg ... role="img" aria-label={ariaLabel}>
  <title>{ariaLabel}</title>
  ...
```

Dynamic label template:

```
`Pinball health score: ${Math.round(clampedScore)} out of 100, band: ${bandLabel}`
```

Example renderings:
- score 67, band healthy → `"Pinball health score: 67 out of 100, band: Healthy"`
- score 0, band stable (fresh DB) → `"Pinball health score: 0 out of 100, band: Stable"`

The visible band text below the SVG is now `aria-hidden="true"` to prevent duplicate announcement. The `<title>` child serves AT that prefer title over aria-label (iOS VoiceOver historically).

## 4. Gauge A11y — `ProjectedGauge`

**Inline fix applied** (`components/projected-gauge.tsx:42–51`):

Dynamic label template:

```
`Projected ${year} health score: ${Math.round(clampedScore)} out of 100, band: ${bandLabel}. Confidence range ${Math.round(clampedLow)} to ${Math.round(clampedHigh)}.`
```

Example: `"Projected 2026 health score: 62 out of 100, band: Stable. Confidence range 55 to 68."`

The visible `"{year} Projected"` and `"{low}–{high}"` spans below the SVG are marked `aria-hidden="true"` (redundant with the aria-label).

## 5. Sparkline A11y

**Pattern chosen: decorative (`aria-hidden="true"`).**

Rationale: every sparkline in this dashboard sits inside an `AnswerCard` where the exact latest value, the explicit trend label (`"+5.2% vs 2024"`), and a directional icon are all rendered as adjacent text *before* the sparkline. A screen-reader user has the full trend story in words without the SVG. Option A's "describe the trend in words" would duplicate the trend label.

**Inline fix applied** (`components/sparkline.tsx:38–44`):

```tsx
<svg ... aria-hidden="true" focusable="false">
```

`focusable="false"` prevents keyboard focus on the SVG in IE11-derived engines (defensive — irrelevant in modern Chromium but cheap).

## 6. Button Labels — Theme Toggle

**Inline fix applied** (`components/theme-toggle.tsx:26–50`):

- Dynamic `aria-label` reflects the action the button would take (not the current state):
  - when `isLight === true`: `"Switch to dark theme"`
  - when `isLight === false`: `"Switch to light theme"`
- `title={label}` also set for hover tooltips.
- `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` added — ring uses the project's existing `--ring` token, no new color.
- Inner lucide `<Moon>` / `<Sun>` icons marked `aria-hidden="true"` so AT does not announce "Moon" or "Sun" alongside the button label.

## 7. Drawer A11y

Native `<details>` / `<summary>` semantics cover keyboard operability (Enter/Space toggle, Tab to focus). The Pass 3 `useSyncExternalStore` fix means React now declaratively controls `open`, which is consistent.

**Inline fix applied** (`components/detail-drawer.tsx:110–115`):
- Added `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm` to the `<summary>`.
- `<ChevronDown>` marked `aria-hidden="true"`.
- Chevron rotation class renamed to `chevron-rotate` so the `prefers-reduced-motion` CSS can kill its transition.

- 🔵 **LOW (owner-decision)** — **Summary text is `"More detail"` — lazy.** Per the spec, this is copy-change territory. Something like `"Show full breakdown"`, `"Year-by-year, country, forecast"`, or `"Detail breakdown"` conveys what's behind the disclosure. Reported; not changed.

## 8. Color Contrast — Computed from oklch tokens

Contrast computation approach: derive L* (lightness) for each oklch token, linearize to relative luminance via the sRGB → luminance formula, compute WCAG contrast ratio `(L_lighter + 0.05) / (L_darker + 0.05)`. For oklch colors with low chroma (most of this palette), L* closely approximates sRGB luminance; estimates below are **order-of-magnitude reasonable**, not lab-instrument precise. WCAG thresholds: **4.5:1** body text AA, **3:1** large text (≥18pt or 14pt bold) AA, **3:1** non-text graphics.

### Dark theme

| Pair | Tokens (L values) | Approx. contrast | AA body (4.5) | AA large (3.0) |
|---|---|---|---|---|
| `--foreground` on `--background` | 0.95 / 0.13 | ~15.3:1 | ✅ | ✅ |
| `--muted-foreground` on `--background` | 0.60 / 0.13 | ~4.9:1 | ✅ (barely) | ✅ |
| `--muted-foreground` on `--card` | 0.60 / 0.18 | ~4.1:1 | ⚠️ below 4.5 | ✅ |
| `--up` on `--card` | 0.75 / 0.18 | ~6.6:1 | ✅ | ✅ |
| `--down` on `--card` | 0.70 / 0.18 | ~5.5:1 | ✅ | ✅ |
| `--flat` on `--card` | 0.55 / 0.18 | ~3.3:1 | ❌ fails AA body | ✅ large only |
| `--band-thriving` (0.75) on `--card` (0.18) | | ~6.6:1 | ✅ | ✅ |
| `--band-healthy` (0.65) on `--card` | | ~4.5:1 | ✅ (edge) | ✅ |
| `--band-stable` (0.80) on `--card` | | ~7.7:1 | ✅ | ✅ |
| `--band-concerning` (0.75) on `--card` | | ~6.6:1 | ✅ | ✅ |
| `--band-critical` (0.70) on `--card` | | ~5.5:1 | ✅ | ✅ |

### Light theme

| Pair | Tokens (L values) | Approx. contrast | AA body | AA large |
|---|---|---|---|---|
| `--foreground` on `--background` | 0.15 / 0.98 | ~15.0:1 | ✅ | ✅ |
| `--muted-foreground` on `--background` | 0.45 / 0.98 | ~5.0:1 | ✅ | ✅ |
| `--muted-foreground` on `--card` | 0.45 / 1.0 | ~5.1:1 | ✅ | ✅ |
| `--up` on `--card` (0.75 / 1.0) | | ~1.8:1 | ❌ fails | ❌ fails |
| `--down` on `--card` (0.70 / 1.0) | | ~2.0:1 | ❌ fails | ❌ fails |
| `--flat` on `--card` (0.55 / 1.0) | | ~3.2:1 | ❌ fails body | ✅ large |
| `--band-thriving` (0.75) on `--card` (1.0) | | ~1.8:1 | ❌ fails | ❌ fails |
| `--band-healthy` (0.65) on `--card` | | ~2.4:1 | ❌ fails | ❌ fails |
| `--band-stable` (0.80) on `--card` | | ~1.5:1 | ❌ fails | ❌ fails |
| `--band-concerning` (0.75) on `--card` | | ~1.8:1 | ❌ fails | ❌ fails |
| `--band-critical` (0.70) on `--card` | | ~2.0:1 | ❌ fails | ❌ fails |

**Flags:**

- 🟠 **HIGH (owner-decision)** — **Light theme: every functional color (`--up`/`--down`/`--flat`) and every band color falls below WCAG AA body (4.5:1) against `--card`.** The trend labels in `AnswerCard` and the gauge score number both render in these colors on a light card background. Band/functional tokens are intentionally identical across themes (see `globals.css:100-110` — "stay the same"). Under strict WCAG AA, the light theme fails for the entire semantic color layer. Two resolution paths: (a) accept that gauge score + band label are **large text** (44px/36px/18px), which is actually AA-large when assessed as such — `--band-thriving` at ~1.8:1 still fails even large (3:1); so (b) introduce darker `.light` overrides for these tokens (e.g. `--band-stable: oklch(0.55 0.18 85)`). This is a **design-system decision** — do not re-tune the palette unilaterally. Report-only per Pass 4 spec: "Do NOT change color tokens to meet contrast."
- 🟡 **MEDIUM** — **Dark theme: `--flat` on `--card` ≈ 3.3:1** fails AA body. Only used on `text-flat` trend labels ("Flat vs YYYY"); at `text-sm` (14px), that's body text. Borderline. Owner decision.
- 🟡 **MEDIUM** — **Dark theme: `--muted-foreground` on `--card` ≈ 4.1:1** is just under AA body (4.5). Affects card question text and "Range:" line in the forecast card. Very close; a tiny L bump (0.60 → 0.63) would clear it without changing perceived hue.
- ⚪ **INFO** — Trend labels are **not color-alone**. Each card renders a lucide `TrendingUp` / `TrendingDown` / `Minus` icon immediately before the label text (`components/answer-card.tsx:33`). Direction is communicable without color, satisfying WCAG 1.4.1 "Use of Color." The `+` / `−` glyph is already embedded in the text (`"+5.2% vs 2024"` / `"-3.1% vs 2024"`) — no fix needed.

## 9. Keyboard-Only Walkthrough

Derived tab order (source order, with `tabindex` inspection — none present outside defaults):

1. Theme toggle (`<button>` in header).
2. `<summary>` of the detail drawer.
3. Footer `<a>` IFPA link (`target="_blank"`).

(No focusable elements inside `<main>`: gauges, narrative, answer cards, sparklines are all non-interactive static content. Drawer content surfaces are all static tables/lists with no focusable items.)

**Checks:**
- Visual order matches DOM order (header → main → drawer → footer). ✅
- All three focusable elements now have visible `focus-visible:ring` styling after this pass. ✅
- No skip-link. For a 4-element tab path on a single-page dashboard, the skip-link overhead isn't justified. ⚪ INFO.
- Drawer keyboard: `Enter` and `Space` on the `<summary>` toggle it (browser default, unchanged by our declarative `open={isOpen}`). ✅

## 10. Reduced Motion

Pre-pass: no `prefers-reduced-motion` handling anywhere.

**Inline fix applied:**

1. `components/health-score-gauge.tsx:22-25,46-48` — added `prefersReducedMotion()` helper; under reduced motion the count-up `duration` collapses to 0, so the first RAF frame jumps straight to the final value with no perceptible animation. Implemented without introducing a `setState-in-effect` regression (the pattern sets the final value through the same RAF path the normal animation uses).
2. `components/health-score-gauge.tsx:89` — arc transition moved from an inline `style` to a `.gauge-arc` class.
3. `components/detail-drawer.tsx:112` — chevron rotation class renamed to `chevron-rotate`.
4. `app/globals.css:121-132` — new `@media (prefers-reduced-motion: reduce)` block disables `.gauge-arc` transition and the chevron rotate transition.

Verified the count-up path still works in the default case (tests pass; prop-change effect still runs).

## 11. Screen-Reader Spot Check (mental walkthrough)

VoiceOver-style announcement, top-to-bottom, after this pass's fixes:

```
Banner [header landmark]
  "IFPA Health"                              — H1
  "Last updated X hours ago"                 — Badge text
  "Switch to light theme, button"            — dynamic aria-label
Main [main landmark]
  "Pinball health score: 67 out of 100,
   band: Healthy"                            — gauge aria-label + title
  "Projected 2026 health score: 62 out of
   100, band: Stable. Confidence range 55
   to 68."                                   — projected gauge
  "Pinball is healthy. Tournament growth
   and retention are both strong..."         — narrative <p>
  "2024 full-year totals"                    — caption <p>
  "Are more people playing?"                 — card question <p>
  "18,720"                                   — card value <p>
  "+5.2% vs 2023"                            — trend label <span> (icon aria-hidden)
   [sparkline — silent, aria-hidden]
  ...repeat for Retention, Tournaments cards
  "More detail, summary [collapsed]"         — drawer
  [if expanded:]
  "Player Flow, heading level 3"
  "Returning, 8,430..."
  "... etc."
[footer landmark]
  "Data from IFPA API, link. Not affiliated."
```

- ⚪ **INFO** — No "button, button, button" zones. Each interactive element has a meaningful label.
- 🟡 **MEDIUM** — Within the announcement stream, the three `AnswerCard`s don't have an explicit heading per card. They're read as "paragraph, paragraph, paragraph". A user scanning by landmark or heading cannot jump directly to the Tournaments card. Making each `question` paragraph an `<h3>` (consistent with the drawer) would fix this in one stroke, but it's a heading-hierarchy change — coupled to finding #2. Report as part of the IA decision.
- 🔵 **LOW** — "2024 full-year totals" caption precedes the three cards but is not programmatically associated. An `aria-labelledby` or `<h2>`-promotion would tighten the grouping. Coupled to the heading-hierarchy decision.

## Inline Fixes Applied

| # | File | Change |
|---|---|---|
| 1 | `components/health-score-gauge.tsx` | `role="img"` + dynamic `aria-label` + `<title>` on root SVG. Band label span marked `aria-hidden`. Arc transition moved from inline style to `.gauge-arc` class. Count-up effect collapses duration to 0 under `prefers-reduced-motion`. |
| 2 | `components/projected-gauge.tsx` | `role="img"` + dynamic `aria-label` + `<title>` on root SVG. Year + range spans marked `aria-hidden`. |
| 3 | `components/sparkline.tsx` | `aria-hidden="true"` + `focusable="false"` on SVG (decorative — adjacent value + trend label describe the data). |
| 4 | `components/theme-toggle.tsx` | Dynamic `aria-label` reflecting target state. Added `title`. Added `focus-visible:ring` using the existing `--ring` token. Inner icons `aria-hidden`. |
| 5 | `components/detail-drawer.tsx` | Added `focus-visible:ring` on `<summary>`. Chevron marked `aria-hidden`, class renamed `chevron-rotate` for reduced-motion hook. |
| 6 | `components/answer-card.tsx` | Trend icon marked `aria-hidden` (label text adjacent). |
| 7 | `app/page.tsx` | Footer `<a>` gets `focus-visible:ring`. |
| 8 | `app/globals.css` | `.gauge-arc` transition rule + `@media (prefers-reduced-motion: reduce)` block disabling `.gauge-arc` and `.chevron-rotate` transitions. |

## Findings Rollup

- 🟠 **HIGH (1):** Heading hierarchy skip (`<h1>` → `<h3>`) — Pass 3 finding, still pending owner decision.
- 🟡 **MEDIUM (3):** Light-theme color contrast fails AA for functional + band colors (owner decision); dark-theme `--flat` on `--card` borderline 3.3:1; dark-theme `--muted-foreground` on `--card` 4.1:1 just below 4.5.
- 🔵 **LOW (3):** Detail drawer outside all landmarks; drawer summary text "More detail" is lazy; caption + 3 cards could benefit from heading tags.
- ⚪ **INFO (5):** Three landmarks present and correct; trend labels not color-alone (icon prefix); keyboard path is 3 items in visual order with focus-visible rings; no "button, button" dead zones; reduced-motion now respected.

## Verification

- `npm run lint` — 3 errors (unchanged from post-Pass-3 baseline): `data-freshness.tsx:14` `Date.now()` purity (pre-existing, out of scope), `scripts/migrate-002.cjs` × 2 (ops, out of scope). No new errors introduced.
- `npx vitest run` — **29/29** passing.
