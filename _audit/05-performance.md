# Pass 5 — Performance & Rendering

## Changes Since Last Audit

- Pass 1 flagged 3 unused shadcn primitives (`card.tsx`, `separator.tsx`, `tooltip.tsx`). **Deleted this pass** — verified zero imports repo-wide first.
- Pass 2 narrowed all 6 `select('*')` queries. Re-verified — no additional tightening needed.
- Pass 3/4 fixes (`useSyncExternalStore`, aria, reduced-motion) preserved.
- `data-freshness.tsx:14` `Date.now()` purity error remains — **explicitly out of scope** per spec.

## Summary

- **Fixes applied:** Deleted 3 unused shadcn primitives (117 LOC). Added `.limit(24)` to the `monthly_event_counts` query — drawer only renders last 12 months, so a 24-month window (~2 years) is a safe ceiling.
- **Build:** Succeeds. `/` is prerendered static with `revalidate = 3600` (1h) / `expire = 1y`. No `force-dynamic`, no cookie/auth reads on the page.
- **Client bundle:** ~409 KB uncompressed across 4 main chunks for `/`. `date-fns` and `lucide-react` are **fully absent** from client chunks — both are used only in server components (DataFreshness) or server-rendered leaves (AnswerCard). The 3 client leaves (ThemeToggle, HealthScoreGauge, DetailDrawer) import only `Moon/Sun`, `ChevronDown` from lucide — these are tree-shaken.
- **Compiled CSS:** 31,432 bytes (31 KB) — well under the 50 KB threshold.
- **Severity counts:** 🔴 0 · 🟠 1 · 🟡 2 · 🔵 1 · ⚪ 6.

## 1. ISR Verification

- `app/page.tsx:14` — `export const revalidate = 3600`. ✅
- `app/page.tsx` — no `export const dynamic = 'force-dynamic'`, no `export const fetchCache`. ✅
- No `cookies()`, `headers()`, or auth reads on the page (grepped). ✅
- Build output confirms the page is statically prerendered: `Route (app) … ┌ ○ /   1h   1y` — `○` = Static. ✅

⚪ **INFO** — ISR is correctly configured. `/` serves from the edge ISR cache until revalidation.

## 2. ISR Invalidation Story

**Current behaviour:** daily cron writes fresh rows to Supabase at 08:00 UTC; the dashboard picks them up within 60 minutes (next revalidation hit by a visitor). Worst-case staleness for a user who lands at 08:00 UTC is ~59 minutes.

**Trade-offs:**

| Option | Latency | Complexity | Cost |
|---|---|---|---|
| Current (1h revalidate) | 0–60 min | 0 | 0 |
| `revalidate = 600` (10 min) | 0–10 min | 0 | 6× more edge-origin fetches |
| `revalidateTag` from `/api/cron/daily` | < 1 min | Small — one `revalidateTag('dashboard')` call post-cron; `unstable_cache` wrap around queries | 1 extra call per day |
| Webhook-driven (Supabase → Vercel) | < 30 s | Medium — Supabase DB webhook, `/api/revalidate` endpoint, secret | Minor infra |

🟡 **MEDIUM (owner-decision)** — 1-hour window is **reasonable for a daily-updating dataset**. The data changes at most once per day (from the daily cron); a 1-hour stale window means the worst case is ~1h out of 24h visually stale. A `revalidateTag` hook inside `/api/cron/daily` would cut this to < 1 min at near-zero cost. Recommend as a follow-up if/when the "last updated" badge starts showing stale-looking timestamps frequently. **Not fixed** (architecture decision per spec).

## 3. Server vs Client Split

| Component | Current | Needs client? | Verdict |
|---|---|---|---|
| `app/page.tsx` | Server | No | ✅ |
| `HealthScoreGauge` | `"use client"` | Yes — RAF count-up + `prefers-reduced-motion` effect | ✅ |
| `ProjectedGauge` | Server | No — no animation | ✅ |
| `NarrativeDisplay` | Server | No | ✅ |
| `AnswerCard` | Server | No | ✅ |
| `Sparkline` | Server | No | ✅ |
| `DetailDrawer` | `"use client"` | Yes — `useSyncExternalStore` for localStorage + `onToggle` handler | ✅ |
| `DataFreshness` | Server | No (pre-existing `Date.now()` purity issue is a render-time bug, not a client need) | ✅ |
| `ThemeToggle` | `"use client"` | Yes — MutationObserver + DOM mutation | ✅ |
| `MonthlyPulse`, `CountryGrowth`, `YearTable`, `PlayerLifecycle` | Server | No | ✅ |

⚪ **INFO** — Boundary is already optimal. The 3 client leaves (gauge, drawer, toggle) are exactly the 3 with genuine client-only work. The two other files containing `"use client"` strings (`components/ui/tooltip.tsx`, `components/ui/separator.tsx`) were shadcn primitives — **deleted this pass**.

## 4. Client Bundle Size

Next.js 16 with Turbopack no longer prints the per-route First Load JS table at the bottom of `next build`. Computed manually from `.next/server/app/page/build-manifest.json`:

| File | Role | Size |
|---|---|---|
| `static/chunks/f2f58a7e93290fbb.js` | React + Next runtime (rootMain) | 224,636 B |
| `static/chunks/a90b6d11afe742e2.js` | App shell + client leaves (rootMain) | 161,913 B |
| `static/chunks/4b9eae0c8dc7e975.js` | rootMain fragment | 13,280 B |
| `static/chunks/turbopack-1e9ff4ec3e6618de.js` | Turbopack runtime | 10,196 B |
| `static/chunks/a6dad97d9634a72d.js` | Polyfill | 112,594 B (legacy browsers only) |
| **Total, modern browsers (rootMain)** | | **~409 KB uncompressed** |

Brotli-compressed on Vercel this typically drops to ~120–140 KB — in line with a Next.js 16 + React 19 app with three small client leaves.

**Tree-shake check on surprise imports:**

| Dep | Server-only? | In client chunks? |
|---|---|---|
| `date-fns` (`formatDistanceToNow`) | Yes — only in `DataFreshness` (server component) | **No** (grepped) |
| `lucide-react` (icons) | Mixed — `TrendingUp/Down/Minus` used in `AnswerCard` (server), `Moon/Sun` in `ThemeToggle` (client), `ChevronDown` in `DetailDrawer` (client) | Only `Moon/Sun/ChevronDown` ship to client. The `AnswerCard` icons are server-rendered. ✅ |
| `@supabase/supabase-js` | Yes — only referenced via `lib/supabase.ts` from the server page | **No** (grepped) |
| `@radix-ui/*` | Only `@radix-ui/react-slot` from `Badge` (server-side `DataFreshness`) | **No** |

⚪ **INFO** — No surprise imports. `date-fns`'s modular ESM works correctly — only `formatDistanceToNow` and its internal deps would ship if ever imported on the client, and today that's zero bytes because `DataFreshness` is a server component. If `DataFreshness` ever becomes a client component (e.g. to tick live), this assumption changes.

🔵 **LOW** — the 409 KB rootMain chunk is React 19 + Next 16 baseline plus minimal app code. There is **no app-level optimization available** short of trimming React itself. Report-only.

## 5. Tailwind Bundle

`/.next/static/chunks/f67f8379be855622.css` — **31,432 bytes (31 KB)**.

Well under the 50 KB threshold. Tailwind v4's `@theme` inline token model keeps the output lean because unused utilities are scanned-and-dropped per build. The oklch token set (14 colors × 2 themes) compiles to a single `:root` + `.light` block plus utility classes actually referenced by JSX.

⚪ **INFO** — CSS size is healthy. No action.

## 6. Font Strategy

`app/layout.tsx:2,5-13`:

```tsx
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```

- **`next/font`?** ✅ Yes.
- **Self-hosted?** ✅ Yes — `next/font/google` downloads font files at build time and serves them from the same origin. No runtime Google Fonts fetch.
- **`display: swap`?** ⚪ — `next/font` **defaults to `display: swap`** (per the Next.js docs; unless explicitly overridden, `swap` is what `next/font/google` uses). No override here, so swap is in effect. ✅
- **`preload`?** Default `true` for both. ✅
- **Variable declaration pattern?** ✅ CSS variables (`--font-geist-sans`, `--font-geist-mono`) — set on `<body className={...variable}>` and consumed via Tailwind `font-sans` / `font-mono`.

⚪ **INFO** — Font strategy is best-practice. No fix.

## 7. Images

- **No `<img>` tags** in `app/` or `components/` (grepped). ✅
- **No `next/image` usage.** Gauges and sparklines are inline SVG. ✅
- **No OG image.** `app/layout.tsx` sets `openGraph: { title, description, type, siteName }` and `twitter: { card: "summary_large_image", … }` but **does not define an `images` array** — so no preview card renders an image when the URL is shared.

🟡 **MEDIUM (owner-decision)** — **Missing OG image.** `twitter.card = "summary_large_image"` expects a 1200×630 image; absent, X/Slack/LinkedIn previews fall back to link-text-only or a broken preview card. For a public-facing dashboard that's shared in Discord/Slack/X, a static OG image (or `opengraph-image.tsx` for dynamic gauge rendering) would materially improve share-through. **Not auto-fixed** — image creation is a design decision. Cheapest path: drop a `app/opengraph-image.png` file (Next auto-detects). Higher-effort: a `app/opengraph-image.tsx` that renders the live score on demand.

⚪ **INFO** — `public/` contains 5 boilerplate Next SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) — all unused by the dashboard. Not deleted this pass (not flagged by the Pass 5 spec fix list); recommend removal in any future cleanup pass.

## 8. Query Performance

The 6 `Promise.all()` queries in `app/page.tsx:26-58`. Indexes from `supabase/migrations/001_initial_schema.sql:236-242`.

| # | Table | Order by | Limit | Index? | Growth profile | Assessment |
|---|---|---|---|---|---|---|
| 1 | `health_scores` | `score_date desc` | 1 | `idx_health_scores_score_date` ✅ | 1 row/day (~365/yr, tiny) | ✅ |
| 2 | `annual_snapshots` | `year asc` | none | `idx_annual_snapshots_year` ✅ | ~1 row/year; current DB has < 20 rows and will stay under 50 for the foreseeable future | ✅ No limit needed |
| 3 | `monthly_event_counts` | `year, month asc` | **was: none. now: 24** | `idx_monthly_event_counts_year_month` ✅ | 12 rows/year; currently probably ~60-80 rows, growing 12/yr forever | 🟠 was unbounded — **fixed inline** |
| 4 | `forecasts` | `forecast_date desc` | 1 | `idx_forecasts_forecast_date` ✅ | ~1 row/day | ✅ |
| 5 | `collection_runs` | `started_at desc` | 1 | `idx_collection_runs_type_started` ✅ (composite; `started_at` is the 2nd col, still usable for pure `started_at` order since Postgres can reverse-scan) | 2-3 rows/day, forever | ✅ |
| 6 | `country_snapshots` | `snapshot_date asc` | none | **no index on `snapshot_date`** ⚠️ | ~100-120 countries × N snapshots. Growing per weekly cron. Currently modest; 3 years = ~150 snapshots × ~120 countries = ~18K rows ceiling | 🟡 see below |

### Inline fix applied

🟠 **HIGH → resolved** — `monthly_event_counts` was fetching **all rows** (growing 12/yr forever) when the UI only renders the **last 12 months** in `MonthlyPulse`. Added `.limit(24)`:

```ts
.from('monthly_event_counts')
.select('year, month, event_count, prior_year_event_count, yoy_change_pct')
.order('year', { ascending: false })
.order('month', { ascending: false })
.limit(24)
```

**Note:** flipped sort to `desc` + `desc` so `.limit(24)` gets the **most recent 24** months. The `MonthlyPulse` component expects the last 12 in ascending display order, so the page now re-sorts ascending before passing:

```ts
monthlyData={(monthlyEvents ?? [])
  .slice()
  .sort((a, b) => a.year - b.year || a.month - b.month)
  .map(...)}
```

Net effect: query cost bounded at 24 rows forever; UI output unchanged.

### Remaining findings

- 🟡 **MEDIUM** — `country_snapshots.snapshot_date` has **no index**. The query orders by `snapshot_date asc` and reads all rows; at current scale this is a full table scan of ~200-500 rows. Not a bug today; will become one at ~10K rows (a year or two out). **Not fixed** — adding an index is a migration, which is out of this pass's scope. Recommend a `CREATE INDEX idx_country_snapshots_snapshot_date ON country_snapshots (snapshot_date);` in a follow-up migration.
- 🟡 **MEDIUM** — `country_snapshots` also has **no `.limit()`** — and per the spec, the view is "first-vs-latest per country" which makes windowing tricky (slicing to "last N snapshots" drops the `first` reference). Correct to leave alone today. If the table grows past ~10K rows, the right fix is a dedicated view/RPC that returns one row per country with `min(snapshot_date) / max(snapshot_date)` computed server-side; that's a design decision.
- ⚪ **INFO** — `collection_runs` `started_at desc` uses the composite index's `started_at` column via reverse scan. Efficient enough; if performance ever degrades, a dedicated `idx_collection_runs_started_at` would be cleaner.

## 9. Layout Shift

- **SSR with data** — the page fetches 6 queries on the server, computes derivations, and returns complete HTML. ✅
- **Gauge final size** — `<svg width="200" height="120" viewBox="0 0 200 120">` on the primary gauge and `width="120" height="72"` on the projected gauge. Both are **rendered at final size on the first paint** because they're server-inserted into the HTML stream. The client-side RAF count-up only updates the text content; it does not resize the SVG. ✅
- **Drawer** — starts closed (default) or open based on `useSyncExternalStore`'s server snapshot of `false`. Opens below main content; the only elements below are the footer, which pushes down without affecting main. ✅
- **Font loading** — `display: swap` means fallback font renders immediately; when Geist loads, there's a micro-relayout on text width. Typical impact < 0.01 CLS; negligible for a dashboard dominated by numeric + SVG content.
- **No client-only content that would pop in.** ✅

⚪ **INFO** — CLS should be effectively 0. No action.

## 10. Third-Party Scripts

- No external `<script>` tags anywhere in `app/` or `components/` except the inline FOUC-prevention script in `app/layout.tsx:43-47` (reads `localStorage.theme` and sets `.light` pre-paint — internal, not third-party).
- **No** Google Analytics, Plausible, PostHog, Segment, Mixpanel, Amplitude, Hotjar, Fullstory, Intercom, Drift, Clarity, or similar. Grepped for `gtag|plausible|posthog|analytics|sentry|datadog|mixpanel|amplitude|hotjar|fullstory|intercom|segment` — zero hits in `app/` or `components/`.
- **No Sentry / error tracker.** Consistent with CLAUDE.md: "no third-party analytics, no error tracking."
- Fonts are self-hosted via `next/font/google` (no runtime Google Fonts fetch).

⚪ **INFO** — Verified. No third-party scripts.

## Inline Fixes Applied

| # | File(s) | Change | Impact |
|---|---|---|---|
| 1 | `components/ui/card.tsx`, `components/ui/separator.tsx`, `components/ui/tooltip.tsx` | Deleted (unused shadcn primitives). | **-117 LOC.** Bundle size unchanged (was tree-shaken out already); **source-tree cleanup only.** |
| 2 | `app/page.tsx` — `monthly_event_counts` query | Flipped sort to `desc` + added `.limit(24)`; added `.slice().sort()` ascending before passing to `DetailDrawer`. | Query now bounded to **last 24 monthly rows** forever. At current scale ~80 rows, savings negligible; at 10-year scale (~120 rows), saves ~96 rows per page render. Prevents unbounded growth. |

No other fixes eligible:
- All 6 queries' `select()` were already narrowed in Pass 2.
- No `"use client"` promotable to RSC (shadcn primitives containing `"use client"` were the deletions — not promotions).
- `next/font` is already using default `display: swap`.
- `country_snapshots` `.limit()` deliberately left alone per spec ("first-vs-latest per country" is slicing-unsafe).

## Verification

- **`npm run build`** — ✅ compiles successfully in 1.4s. Prerenders `/` statically with `revalidate = 3600`. No new warnings.
- **`npm run lint`** — ✅ unchanged: 3 errors (all pre-existing, out of scope): `data-freshness.tsx:14` `Date.now()` purity, `scripts/migrate-002.cjs` × 2 ops errors. No new errors introduced.
- **`npx vitest run`** — ✅ 29/29 passing.

## Findings Rollup

- 🟠 **HIGH (0 after fix):** `monthly_event_counts` unbounded query — **fixed inline**.
- 🟡 **MEDIUM (3):** ISR staleness window vs cron-driven invalidation (owner call); missing OG image (owner call — affects link-share preview); `country_snapshots.snapshot_date` missing index + unbounded query (migration scope).
- 🔵 **LOW (1):** 409 KB rootMain chunk is React/Next baseline — no app-level lever.
- ⚪ **INFO (6):** ISR correctly configured; RSC/client split optimal; CSS 31 KB under threshold; fonts self-hosted with `display: swap`; no images/CLS concerns; no third-party scripts.

## Build Output Metrics Snapshot

```
Route (app)        Revalidate  Expire
┌ ○ /                      1h     1y       ← static, ISR
├ ○ /_not-found
├ ƒ /api/admin/calibrate            ← dynamic (expected)
├ ƒ /api/admin/observations
├ ƒ /api/cron/daily
└ ƒ /api/cron/weekly

Client chunks for `/` (rootMain):
  f2f58a7e…js  225 KB   React + Next runtime
  a90b6d11…js  162 KB   App shell + client leaves
  4b9eae0c…js   13 KB   rootMain fragment
  turbopack…js  10 KB   Turbopack runtime
  Total         ~410 KB uncompressed (~120-140 KB brotli typical)

CSS (all routes):
  f67f8379…css  31 KB   Tailwind v4 compiled (dark + .light tokens + utilities)

Polyfill (legacy only):  113 KB
```

**Tree-shake verification:** `date-fns` 0 bytes in client; `lucide-react` only `Moon`/`Sun`/`ChevronDown` in client (AnswerCard's `TrendingUp/Down/Minus` are server-rendered).
