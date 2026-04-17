# Frontend Audit Summary — IFPA Health

## TL;DR

The frontend is in good shape — a lean, server-rendered single-page dashboard with a clean design-system story, zero third-party scripts, and a correct RSC/client split. The audit fixed everything it was eligible to fix (2 React purity errors, 6 overbroad selects, 3 dead shadcn primitives, a missing a11y layer on the gauges, reduced-motion, an unbounded monthly query). What's left is mostly product/design judgment: one pre-existing `Date.now()` purity error in `data-freshness.tsx`, a heading hierarchy skip, and light-theme color tokens that fail WCAG AA — none are blocking, all need owner input.

## Severity Rollup

- 🔴 CRITICAL — 0
- 🟠 HIGH — 4 (heading hierarchy skip, light-theme contrast, `Date.now()` purity, `country_snapshots` unbounded+unindexed)
- 🟡 MEDIUM — 8 (narrative test coverage, ISR invalidation, OG image, `--flat`/`--muted-foreground` dark contrast near-miss, string-number round-trip, drawer session-state layering, derivation placement risk, card headings for SR nav)
- 🔵 LOW — 6 (single-value sparkline, drawer outside landmark, lazy "More detail" copy, gauge animation dissonance, 409 KB baseline, dead `?? ''` fallback)
- ⚪ INFO — ~25 (clean design system, tokens consistent, tree-shake verified, no FOUC, fonts self-hosted, CSS 31 KB, etc.)

## Fixed During This Audit

- [x] Narrowed 6 `.select('*')` queries to explicit column lists in `app/page.tsx` (Pass 2)
- [x] Rewrote `theme-toggle.tsx` `useState + useEffect` to `useSyncExternalStore` — resolves `react-hooks/set-state-in-effect` (Pass 3)
- [x] Rewrote `detail-drawer.tsx` localStorage read to `useSyncExternalStore` — resolves `react-hooks/set-state-in-effect` (Pass 3)
- [x] Added `role="img"` + dynamic `aria-label` + `<title>` to both gauges (Pass 4)
- [x] Marked decorative sparklines `aria-hidden="true"` + `focusable="false"` (Pass 4)
- [x] Added dynamic state-reflecting `aria-label` + `focus-visible:ring` to theme toggle (Pass 4)
- [x] Added `focus-visible:ring` to drawer summary and footer link; marked inner icons `aria-hidden` (Pass 4)
- [x] Added `prefers-reduced-motion: reduce` handling for gauge count-up and chevron rotation (Pass 4)
- [x] Deleted 3 unused shadcn primitives — `card.tsx`, `separator.tsx`, `tooltip.tsx` (−117 LOC) (Pass 5)
- [x] Bounded `monthly_event_counts` query with `.limit(24)` + flipped sort to desc-then-reascend (Pass 5)

## Top 5 Report Items (Prioritized)

### 1. `Date.now()` in render — `data-freshness.tsx:14` — 🟠 HIGH
- **What:** `DataFreshness` computes `isStale = Date.now() - new Date(completed_at).getTime() > 48*3600*1000` at render time. This is a real React purity violation and currently a lint error.
- **Why it matters:** Under React 19 strict purity semantics the check's result can drift between server render and client hydration; on long-lived ISR cache hits the "stale" badge is computed against the build's `Date.now()`, not the visitor's, so the 48h threshold slides by up to 60 min.
- **Effort:** S
- **Files:** `components/data-freshness.tsx`
- **Approach:** Promote `DataFreshness` to a client leaf that reads `Date.now()` in a `useSyncExternalStore` snapshot (ticking once per minute), OR pass a `now` prop computed in the page (still drifts with ISR). Cleanest: make it client, subscribe to a 60 s interval. Lint error clears, badge re-evaluates freshness per visitor.

### 2. Heading hierarchy skip `<h1>` → `<h3>` — 🟠 HIGH
- **What:** Page jumps from the `<h1>` wordmark to five `<h3>` drawer section titles with no `<h2>` in between; the three answer cards use `<p>` for their questions.
- **Why it matters:** AT users navigating by heading (the most common SR pattern) skip past the card grid entirely and jump from "IFPA Health" straight into drawer subsections. The card stack — the dashboard's core content — is invisible to heading nav.
- **Effort:** S
- **Files:** `components/answer-card.tsx`, `components/detail-drawer.tsx`, `app/page.tsx`
- **Approach:** Promote card questions to `<h2>`; either promote the 5 drawer titles to `<h2>` (and leave Forecast's larger visual as `<h3>`) or add a single sr-only `<h2>Detail breakdown</h2>` inside the drawer. Owner picks; both work.

### 3. Light-theme functional + band colors fail WCAG AA — 🟠 HIGH
- **What:** `--up`, `--down`, `--flat`, and all five `--band-*` tokens are intentionally identical across dark and light themes; against the near-white `--card` on light they range from ~1.5:1 to ~3.2:1 — all below 4.5:1 body and most below 3:1 large-text AA.
- **Why it matters:** Trend labels and the gauge score itself become hard to read in light mode. Dark mode is fine; the policy "functional colors stay the same in both themes" was the cause.
- **Effort:** S–M (palette work)
- **Files:** `app/globals.css` `.light` block (L80–111)
- **Approach:** Add darker `.light` overrides for the 8 tokens — drop L by ~0.25 while holding chroma and hue. Keep dark values untouched. Re-verify against card + background. Owner call because it breaks the "same in both themes" design intent.

### 4. `country_snapshots` unbounded query + missing index — 🟠 HIGH (latent)
- **What:** `country_snapshots` query reads all rows ordered by `snapshot_date` with no `.limit()` and no index on `snapshot_date`. Table grows ~120 rows per weekly cron forever.
- **Why it matters:** Today ~500 rows, fine. In 18–24 months it's ~10K+ and the page render does a full table scan. The `first vs latest per country` semantic makes naïve slicing unsafe, so this needs design work, not a one-liner.
- **Effort:** M
- **Files:** `app/page.tsx` (query), `supabase/migrations/NNN_*.sql` (new migration), possibly `lib/` for a helper
- **Approach:** Add `CREATE INDEX idx_country_snapshots_snapshot_date ON country_snapshots (snapshot_date);` in a new migration. Create a Postgres view or RPC that returns one row per country with `min(snapshot_date)`, `max(snapshot_date)`, earliest `active_players`, latest `active_players`. Swap the page to read that view. Query cost becomes O(countries) forever.

### 5. No OG image for share previews — 🟡 MEDIUM
- **What:** `app/layout.tsx` declares `twitter.card = "summary_large_image"` and `openGraph` metadata but ships no image. Discord/Slack/X link previews render as a text card or broken preview.
- **Why it matters:** Dashboard is shareable by design. A missing preview tanks click-through and credibility when someone drops the URL in a pinball Discord.
- **Effort:** S (static) or M (dynamic)
- **Files:** `app/opengraph-image.png` (new) or `app/opengraph-image.tsx` (new)
- **Approach:** Cheapest: drop a 1200×630 PNG at `app/opengraph-image.png` — Next auto-wires it. Better: `opengraph-image.tsx` that renders the live score + band via Next's ImageResponse so shares reflect current state. Either is zero-config after the file lands.

## Anti-Recommendations

- **Don't add client-side data fetching.** ISR + server components is the right model for this data shape.
- **Don't add a charting library.** Custom SVG sparklines are intentional (Recharts was removed in v2, ~1,340 LOC).
- **Don't add auth to the public dashboard.** Admin routes are a separate concern.
- **Don't pile on new drawer sections.** The drawer is opt-in specifically so the main viewport stays single-screen.
- **Don't add AI rewrites to the template narrative.** Determinism and zero-cost rendering are the point.

## Open Questions for the Owner

- **ISR invalidation:** leave at 1 h, or add `revalidateTag('dashboard')` to `/api/cron/daily` for sub-minute freshness? Cost is ~5 lines; worst-case stale window drops from 60 min to <1 min.
- **Light-theme colors:** darken functional/band tokens in `.light` to meet AA, or keep them identical to dark for consistency (and accept the AA failure)?
- **Heading hierarchy:** promote card questions + drawer titles to `<h2>` (visible change), or add sr-only `<h2>`s for AT only (no visible change)?
- **Drawer summary copy:** "More detail" is lazy — rename to something like "Year-by-year, country, forecast" or "Show full breakdown"?
- **Narrative coverage:** ~12 template branches in `lib/narrative.ts` are untested (`thriving` and `critical` band phrases have zero coverage, players-as-primary-pillar never exercised, retention bucket branches untested). Add fixtures to cover them, or confirm they're unreachable in production data and delete the dead ones?
- **Single-value sparkline:** currently renders nothing (`length < 2` early return). Render a flat line + dot for new-data-year cases, or keep as-is?

## Tracking

### Fixed during audit

- [x] Narrow 6 `.select('*')` queries in `app/page.tsx` (Pass 2)
- [x] `theme-toggle.tsx` rewritten to `useSyncExternalStore` (Pass 3)
- [x] `detail-drawer.tsx` rewritten to `useSyncExternalStore` (Pass 3)
- [x] Gauges: `role="img"` + dynamic `aria-label` + `<title>` (Pass 4)
- [x] Sparklines marked `aria-hidden="true"` (Pass 4)
- [x] Theme toggle dynamic `aria-label` + `focus-visible:ring` (Pass 4)
- [x] Drawer summary + footer link `focus-visible:ring`; icons `aria-hidden` (Pass 4)
- [x] `prefers-reduced-motion` handling for gauge + chevron (Pass 4)
- [x] Deleted `components/ui/{card,separator,tooltip}.tsx` (Pass 5)
- [x] `.limit(24)` on `monthly_event_counts` query (Pass 5)

### Open — Quick wins (< 1 h)

- [ ] Add `opengraph-image.png` (static 1200×630)
- [ ] Rename drawer summary copy from "More detail" to something descriptive
- [ ] Delete `public/{file,globe,next,vercel,window}.svg` boilerplate (unused)
- [ ] Drop dead `?? ''` fallback in `app/page.tsx` trend-label helpers
- [ ] Drop unused `status` from `DataFreshness` prop type (or surface it in the badge)
- [ ] Extract `parseFloat(String(...))` numeric-coerce idiom into `lib/utils.ts` helper (~19 sites)

### Open — Higher impact (1–4 h)

- [ ] Fix `Date.now()` purity in `data-freshness.tsx` by promoting to client leaf with `useSyncExternalStore` tick
- [ ] Promote answer-card questions to `<h2>` and resolve drawer `<h3>` skip (sr-only or visible)
- [ ] Add sparkline fallback for single-value case (flat line + dot)
- [ ] Wrap drawer in `<aside aria-labelledby="...">` or move inside `<main>`
- [ ] Add fixtures for untested narrative branches (`thriving`, `critical`, players-primary, retention buckets)
- [ ] Build dynamic `opengraph-image.tsx` rendering live score + band via ImageResponse

### Open — Architecture decisions (owner)

- [ ] ISR: add `revalidateTag('dashboard')` inside `/api/cron/daily` or stay at 1-hour revalidate
- [ ] Light-theme palette: darken `.light` functional + band tokens to meet WCAG AA, or accept the contrast miss
- [ ] `country_snapshots`: migration for `snapshot_date` index + Postgres view/RPC for one-row-per-country aggregation
- [ ] Dark-theme near-misses: bump `--muted-foreground` L by ~0.03 to clear 4.5:1 on card; decide on `--flat` (3.3:1)
