# V2 Narrative Pulse Check — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the IFPA Health Dashboard as a single-viewport, dark-first pulse check with 3-pillar health score, auto-generated narrative, and answer cards.

**Architecture:** Server component fetches health score + annual snapshots + monthly events + forecast from Supabase. Health score computed from 3 equal-weighted pillars (players, retention, tournaments). Narrative generated server-side via template engine. Client components only for sparklines, gauge animation, and detail drawer toggle.

**Tech Stack:** Next.js 16, Tailwind v4, Supabase, custom SVG sparklines (drop Recharts)

**Design doc:** `docs/plans/2026-02-16-v2-redesign-design.md`

---

## Task 1: Rewrite Health Score Algorithm (3 Pillars)

**Files:**
- Modify: `lib/health-score.ts` (full rewrite, keep `interpolate` and `getBand`)
- Create: `lib/__tests__/health-score.test.ts`

**Step 1: Install vitest**

Run: `cd ~/projects/ifpa-health && npm install -D vitest`

**Step 2: Write failing tests for the new 3-pillar score**

```typescript
// lib/__tests__/health-score.test.ts
import { describe, it, expect } from 'vitest'
import { computeHealthScore, interpolate, getBand } from '../health-score'

describe('interpolate', () => {
  it('returns 0 below lowest breakpoint', () => {
    expect(interpolate(-15, [[-10, 0], [0, 50], [15, 100]])).toBe(0)
  })
  it('returns 100 above highest breakpoint', () => {
    expect(interpolate(20, [[-10, 0], [0, 50], [15, 100]])).toBe(100)
  })
  it('interpolates between breakpoints', () => {
    expect(interpolate(0, [[-10, 0], [0, 50], [15, 100]])).toBe(50)
  })
  it('interpolates mid-segment', () => {
    const result = interpolate(7.5, [[-10, 0], [0, 50], [15, 100]])
    expect(result).toBeCloseTo(75, 0)
  })
})

describe('getBand', () => {
  it('returns thriving for 80+', () => expect(getBand(85)).toBe('thriving'))
  it('returns healthy for 65-79', () => expect(getBand(70)).toBe('healthy'))
  it('returns stable for 50-64', () => expect(getBand(55)).toBe('stable'))
  it('returns concerning for 35-49', () => expect(getBand(40)).toBe('concerning'))
  it('returns critical for 0-34', () => expect(getBand(20)).toBe('critical'))
})

describe('computeHealthScore (3 pillars)', () => {
  it('computes correct score with strong growth data', () => {
    const result = computeHealthScore({
      player_yoy_pct: 8.3,
      retention_rate: 42,
      tournament_yoy_pct: 10.5,
    })
    // Players: 8.3% -> ~73, Retention: 42% -> ~73, Tournaments: 10.5% -> ~82
    expect(result.composite_score).toBeGreaterThan(70)
    expect(result.composite_score).toBeLessThan(80)
    expect(result.band).toBe('healthy')
    expect(Object.keys(result.components)).toHaveLength(3)
    expect(result.components.players).toBeDefined()
    expect(result.components.retention).toBeDefined()
    expect(result.components.tournaments).toBeDefined()
  })

  it('returns critical for severe decline', () => {
    const result = computeHealthScore({
      player_yoy_pct: -15,
      retention_rate: 20,
      tournament_yoy_pct: -12,
    })
    expect(result.band).toBe('critical')
    expect(result.composite_score).toBeLessThan(35)
  })

  it('returns thriving for strong across all pillars', () => {
    const result = computeHealthScore({
      player_yoy_pct: 15,
      retention_rate: 50,
      tournament_yoy_pct: 15,
    })
    expect(result.band).toBe('thriving')
    expect(result.composite_score).toBeGreaterThanOrEqual(80)
  })

  it('uses equal weights (each pillar ~33%)', () => {
    const result = computeHealthScore({
      player_yoy_pct: 0,
      retention_rate: 35,
      tournament_yoy_pct: 0,
    })
    // All three at 50 -> composite = 50
    expect(result.composite_score).toBeCloseTo(50, 0)
  })
})
```

**Step 3: Run tests to verify they fail**

Run: `cd ~/projects/ifpa-health && npx vitest run lib/__tests__/health-score.test.ts`
Expected: FAIL — `computeHealthScore` takes wrong input type

**Step 4: Rewrite `lib/health-score.ts`**

```typescript
// lib/health-score.ts
// IFPA Health Score Algorithm — 3-Pillar System
// Pure computation module — no side effects, no database calls.

export type Band = 'thriving' | 'healthy' | 'stable' | 'concerning' | 'critical'

export interface ComponentScore {
  score: number      // 0-100
  weight: number     // always 1/3
  raw_value: number
  label: string
}

export interface HealthScoreResult {
  composite_score: number
  band: Band
  components: Record<string, ComponentScore>
  methodology_version: number
}

export interface HealthScoreInput {
  player_yoy_pct: number       // unique player YoY % change
  retention_rate: number        // returning / unique players %
  tournament_yoy_pct: number   // tournament count YoY % change
}

type Breakpoints = [number, number][]

// Breakpoints: [input_value, output_score] pairs, ascending by input
const BREAKPOINTS: Record<string, Breakpoints> = {
  players:     [[-10, 0], [0, 50], [15, 100]],
  retention:   [[25, 0], [35, 50], [50, 100]],
  tournaments: [[-10, 0], [0, 50], [15, 100]],
}

const WEIGHT = 1 / 3

export function interpolate(value: number, breakpoints: Breakpoints): number {
  if (breakpoints.length === 0) return 0
  if (value <= breakpoints[0][0]) return clamp(breakpoints[0][1])
  if (value >= breakpoints[breakpoints.length - 1][0]) return clamp(breakpoints[breakpoints.length - 1][1])

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i]
    const [x1, y1] = breakpoints[i + 1]
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0)
      return clamp(y0 + t * (y1 - y0))
    }
  }
  return clamp(breakpoints[breakpoints.length - 1][1])
}

export function getBand(score: number): Band {
  if (score >= 80) return 'thriving'
  if (score >= 65) return 'healthy'
  if (score >= 50) return 'stable'
  if (score >= 35) return 'concerning'
  return 'critical'
}

export function computeHealthScore(
  input: HealthScoreInput,
  methodologyVersion: number = 2,
): HealthScoreResult {
  const playerScore = interpolate(input.player_yoy_pct, BREAKPOINTS.players)
  const retentionScore = interpolate(input.retention_rate, BREAKPOINTS.retention)
  const tournamentScore = interpolate(input.tournament_yoy_pct, BREAKPOINTS.tournaments)

  const components: Record<string, ComponentScore> = {
    players: {
      score: round2(playerScore),
      weight: WEIGHT,
      raw_value: round2(input.player_yoy_pct),
      label: `${input.player_yoy_pct >= 0 ? '+' : ''}${input.player_yoy_pct.toFixed(1)}% unique players YoY`,
    },
    retention: {
      score: round2(retentionScore),
      weight: WEIGHT,
      raw_value: round2(input.retention_rate),
      label: `${input.retention_rate.toFixed(1)}% player retention rate`,
    },
    tournaments: {
      score: round2(tournamentScore),
      weight: WEIGHT,
      raw_value: round2(input.tournament_yoy_pct),
      label: `${input.tournament_yoy_pct >= 0 ? '+' : ''}${input.tournament_yoy_pct.toFixed(1)}% tournaments YoY`,
    },
  }

  const composite = (playerScore + retentionScore + tournamentScore) / 3

  return {
    composite_score: round2(clamp(composite)),
    band: getBand(composite),
    components,
    methodology_version: methodologyVersion,
  }
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
```

**Step 5: Run tests to verify they pass**

Run: `cd ~/projects/ifpa-health && npx vitest run lib/__tests__/health-score.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
cd ~/projects/ifpa-health
git add lib/health-score.ts lib/__tests__/health-score.test.ts package.json package-lock.json
git commit -m "feat: rewrite health score to 3-pillar system (players, retention, tournaments)"
```

---

## Task 2: Narrative Generator

**Files:**
- Create: `lib/narrative.ts`
- Create: `lib/__tests__/narrative.test.ts`

**Step 1: Write failing tests**

```typescript
// lib/__tests__/narrative.test.ts
import { describe, it, expect } from 'vitest'
import { generateNarrative } from '../narrative'
import type { HealthScoreResult } from '../health-score'

function makeResult(overrides: Partial<HealthScoreResult> & { composite_score: number; band: HealthScoreResult['band'] }): HealthScoreResult {
  return {
    composite_score: overrides.composite_score,
    band: overrides.band,
    methodology_version: 2,
    components: overrides.components ?? {
      players: { score: 73, weight: 1/3, raw_value: 8.3, label: '+8.3% unique players YoY' },
      retention: { score: 73, weight: 1/3, raw_value: 42, label: '42.0% player retention rate' },
      tournaments: { score: 82, weight: 1/3, raw_value: 10.5, label: '+10.5% tournaments YoY' },
    },
  }
}

describe('generateNarrative', () => {
  it('returns a string starting with "Competitive pinball"', () => {
    const result = generateNarrative(makeResult({ composite_score: 76, band: 'healthy' }))
    expect(result).toMatch(/^Competitive pinball/)
  })

  it('uses "growing steadily" for healthy band', () => {
    const result = generateNarrative(makeResult({ composite_score: 70, band: 'healthy' }))
    expect(result).toContain('growing steadily')
  })

  it('uses "showing signs of strain" for concerning band', () => {
    const result = generateNarrative(makeResult({
      composite_score: 40,
      band: 'concerning',
      components: {
        players: { score: 30, weight: 1/3, raw_value: -5, label: '-5.0% unique players YoY' },
        retention: { score: 50, weight: 1/3, raw_value: 35, label: '35.0% player retention rate' },
        tournaments: { score: 40, weight: 1/3, raw_value: -2, label: '-2.0% tournaments YoY' },
      },
    }))
    expect(result).toContain('showing signs of strain')
  })

  it('mentions the strongest signal pillar', () => {
    const result = generateNarrative(makeResult({ composite_score: 76, band: 'healthy' }))
    // Tournaments has highest score (82), should be mentioned
    expect(result).toMatch(/tournament/i)
  })

  it('includes two evidence clauses separated by comma or conjunction', () => {
    const result = generateNarrative(makeResult({ composite_score: 76, band: 'healthy' }))
    // Should have the em-dash structure
    expect(result).toContain('\u2014')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd ~/projects/ifpa-health && npx vitest run lib/__tests__/narrative.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `lib/narrative.ts`**

```typescript
// lib/narrative.ts
// Template-based narrative generator for health score results.
// No AI — just conditional logic producing a human-readable sentence.

import type { HealthScoreResult, Band } from './health-score'

const TREND_PHRASES: Record<Band, string> = {
  thriving: 'thriving',
  healthy: 'growing steadily',
  stable: 'holding steady',
  concerning: 'showing signs of strain',
  critical: 'in decline',
}

interface PillarEvidence {
  key: string
  score: number
  rawValue: number
  deviation: number // absolute distance from 50 (neutral)
}

export function generateNarrative(result: HealthScoreResult): string {
  const trend = TREND_PHRASES[result.band]

  // Build evidence list sorted by how far each pillar deviates from neutral
  const pillars: PillarEvidence[] = Object.entries(result.components).map(([key, comp]) => ({
    key,
    score: comp.score,
    rawValue: comp.raw_value,
    deviation: Math.abs(comp.score - 50),
  }))

  pillars.sort((a, b) => b.deviation - a.deviation)

  // Check if all pillars are roughly similar (within 15 points of each other)
  const scores = pillars.map(p => p.score)
  const spread = Math.max(...scores) - Math.min(...scores)

  let evidence: string

  if (spread < 15) {
    // All similar — use combined statement
    const direction = pillars[0].score >= 55 ? 'up' : pillars[0].score <= 45 ? 'down' : 'flat'
    evidence = `all three indicators are trending ${direction}`
  } else {
    // Use top two most noteworthy pillars
    const primary = formatEvidence(pillars[0])
    const secondary = formatEvidence(pillars[1])
    evidence = `${primary}, ${secondary.startsWith('with') ? '' : 'with '}${secondary}`
  }

  return `Competitive pinball is ${trend} \u2014 ${evidence}.`
}

function formatEvidence(pillar: PillarEvidence): string {
  const { key, rawValue } = pillar

  switch (key) {
    case 'tournaments':
      if (Math.abs(rawValue) < 2) return 'tournament count is roughly flat'
      return rawValue > 0
        ? `tournament count is up ${rawValue.toFixed(1)}% year over year`
        : `tournament count is down ${Math.abs(rawValue).toFixed(1)}% year over year`

    case 'players':
      if (Math.abs(rawValue) < 2) return 'unique player count is roughly flat'
      return rawValue > 0
        ? `unique players grew ${rawValue.toFixed(1)}% year over year`
        : `unique players dropped ${Math.abs(rawValue).toFixed(1)}% year over year`

    case 'retention':
      if (rawValue >= 45) return `with a strong ${rawValue.toFixed(0)}% player retention rate`
      if (rawValue >= 35) return `with a solid ${rawValue.toFixed(0)}% player retention rate`
      return `retention has dipped to ${rawValue.toFixed(0)}%`

    default:
      return `${key} at ${rawValue.toFixed(1)}`
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd ~/projects/ifpa-health && npx vitest run lib/__tests__/narrative.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
cd ~/projects/ifpa-health
git add lib/narrative.ts lib/__tests__/narrative.test.ts
git commit -m "feat: add template-based narrative generator for health score"
```

---

## Task 3: Update Health Scorer Collector

**Files:**
- Modify: `lib/collectors/health-scorer.ts` (simplify — only needs annual_snapshots now)

**Step 1: Rewrite the collector**

The collector currently reads from 4 tables (annual_snapshots, monthly_event_counts, country_snapshots, overall_stats_snapshots). The new 3-pillar system only needs `annual_snapshots`.

Key changes:
- Remove reads from monthly_event_counts, country_snapshots, overall_stats_snapshots
- Build the new simpler `HealthScoreInput` with just 3 fields
- Remove shadow scoring system (simplify — one methodology now)
- Keep collection_runs logging pattern

The new collector should:
1. Fetch latest complete year from `annual_snapshots`
2. Fetch prior year for YoY calculation on unique_players
3. Build `{ player_yoy_pct, retention_rate, tournament_yoy_pct }`
4. Call `computeHealthScore(input)`
5. Upsert to `health_scores`

**Step 2: Run the existing tests + build**

Run: `cd ~/projects/ifpa-health && npx vitest run && npm run build`
Expected: All pass, build succeeds

**Step 3: Commit**

```bash
cd ~/projects/ifpa-health
git add lib/collectors/health-scorer.ts
git commit -m "feat: simplify health scorer to 3-pillar input (annual_snapshots only)"
```

---

## Task 4: Bump Methodology Version in Supabase

**Files:**
- No code files — SQL migration via Supabase MCP

**Step 1: Insert methodology v2**

Run SQL via `mcp__supabase__execute_sql` against project `ryteszuvasrfppgecnwe`:

```sql
-- Deactivate v1
UPDATE methodology_versions SET is_active = false WHERE version_number = 1;

-- Insert v2
INSERT INTO methodology_versions (version_number, description, weights, breakpoints, is_active)
VALUES (
  2,
  '3-pillar system: players, retention, tournaments (equal weight)',
  '{"players": 0.333, "retention": 0.333, "tournaments": 0.333}',
  '{"players": {"points": [[-10, 0], [0, 50], [15, 100]]}, "retention": {"points": [[25, 0], [35, 50], [50, 100]]}, "tournaments": {"points": [[-10, 0], [0, 50], [15, 100]]}}',
  true
);
```

**Step 2: Verify**

Run: `SELECT version_number, is_active, description FROM methodology_versions ORDER BY version_number;`
Expected: v1 inactive, v2 active

**Step 3: Recompute current health score**

Trigger the daily cron manually or run the scorer directly to get a v2 health score in the database. This will be needed for the frontend to display correctly.

**Step 4: Commit a note in NOTES.md about the migration**

---

## Task 5: Global Styles Overhaul (Dark-First)

**Files:**
- Modify: `app/globals.css` (new color scheme, dark as primary)
- Modify: `app/layout.tsx` (default to dark class)

**Step 1: Rewrite globals.css**

Key changes:
- Dark mode becomes the `:root` default
- Light mode under `.light` class
- Functional color tokens: `--color-up` (green), `--color-down` (red), `--color-flat` (gray)
- Gauge band colors as CSS variables
- Remove unused sidebar variables
- Remove chart-1 through chart-5 (no more Recharts)
- Tighter, more intentional spacing

**Step 2: Update layout.tsx theme script**

Change the inline script to default to dark instead of checking `prefers-color-scheme`:
```javascript
// Default dark, user can toggle to light
try{var d=document.documentElement;var c=localStorage.getItem('theme');if(c==='light'){d.classList.add('light')}else{d.classList.add('dark')}}catch(e){}
```

**Step 3: Visual check**

Run: `cd ~/projects/ifpa-health && npm run dev`
Open http://localhost:3000 — should see dark background, white text

**Step 4: Commit**

```bash
cd ~/projects/ifpa-health
git add app/globals.css app/layout.tsx
git commit -m "feat: dark-first color scheme with functional color tokens"
```

---

## Task 6: Sparkline Component

**Files:**
- Create: `components/sparkline.tsx`

**Step 1: Build SVG sparkline**

Pure SVG component, no Recharts dependency. Props:
- `data: number[]` — array of values (one per year)
- `color?: string` — line color (default muted)
- `width?: number` — default 120
- `height?: number` — default 32

Features:
- Thin (1.5px) polyline with rounded joins
- No axes, no labels
- Rightmost point highlighted with a small filled circle (3px radius)
- Scales Y to min/max of data with small padding
- Subtle draw-in animation via CSS stroke-dasharray

**Step 2: Visual check**

Render with sample data `[30000, 32000, 35000, 28000, 25000, 33000, 38000, 40000, 43740]`
Should show a line that dips (COVID years) then rises, with a dot on the rightmost point.

**Step 3: Commit**

```bash
cd ~/projects/ifpa-health
git add components/sparkline.tsx
git commit -m "feat: add SVG sparkline component (no Recharts)"
```

---

## Task 7: Answer Card Component

**Files:**
- Create: `components/answer-card.tsx`

**Step 1: Build the card**

Props:
- `question: string` — e.g. "Are more people playing?"
- `value: string` — formatted number e.g. "43,740"
- `trend: { direction: 'up' | 'down' | 'flat'; label: string }` — e.g. { direction: 'up', label: '+8.3% vs 2024' }
- `sparklineData: number[]` — historical values for sparkline
- `sparklineColor?: string`

Layout:
- Question as small muted label at top
- Large bold number
- Trend indicator: colored arrow icon + label text
- Sparkline at bottom

Styling:
- No visible border — subtle background differentiation only
- Functional colors: green for up, red for down, gray for flat
- Uses Lucide `ArrowUp`, `ArrowDown`, `Minus` icons (already in project)

**Step 2: Commit**

```bash
cd ~/projects/ifpa-health
git add components/answer-card.tsx
git commit -m "feat: add answer card component with trend + sparkline"
```

---

## Task 8: Narrative Display Component

**Files:**
- Create: `components/narrative-display.tsx`

**Step 1: Build the component**

Simple server-friendly component. Props:
- `text: string` — the generated narrative sentence

Renders the sentence in slightly larger, slightly lighter text below the health gauge. Centered. The em-dash and evidence clauses should read like a headline.

**Step 2: Commit**

```bash
cd ~/projects/ifpa-health
git add components/narrative-display.tsx
git commit -m "feat: add narrative display component"
```

---

## Task 9: Health Score Gauge Update

**Files:**
- Modify: `components/health-score-gauge.tsx`

**Step 1: Update the gauge for dark-first design**

Changes:
- Slightly larger number (42px instead of 36px)
- Band label more prominent
- Use CSS variables for band colors instead of hardcoded hex
- Count-up animation on the number (0 → score) using requestAnimationFrame
- Track background uses `--muted` token

**Step 2: Commit**

```bash
cd ~/projects/ifpa-health
git add components/health-score-gauge.tsx
git commit -m "feat: update gauge for dark-first design with count-up animation"
```

---

## Task 10: Detail Drawer Component

**Files:**
- Create: `components/detail-drawer.tsx`
- Create: `components/monthly-pulse.tsx`
- Create: `components/year-table.tsx`

**Step 1: Build monthly pulse (GitHub-contribution-graph style)**

12 small rounded rectangles in a row, one per month. Colored:
- Green: YoY tournament count > +2%
- Red: YoY < -2%
- Neutral gray: between -2% and +2%

Month abbreviation labels below. Compact — fits in one line.

**Step 2: Build year-over-year table**

Simple HTML table: Year | Tournaments | Entries | Unique Players | Retention Rate
One row per year (2017-2025). No interactivity. Clean monospace numbers, right-aligned.

**Step 3: Build detail drawer**

Collapsible section using `<details>`/`<summary>` (native HTML, no JS needed for toggle).
Contains:
1. Forecast text card (reuse existing ForecastChart logic, simplified)
2. Year-over-year table
3. Monthly pulse
4. One-line methodology: "Health score = equal-weighted average of player growth, retention, and tournament growth."

Remembers open/closed via localStorage (small client wrapper).

**Step 4: Commit**

```bash
cd ~/projects/ifpa-health
git add components/detail-drawer.tsx components/monthly-pulse.tsx components/year-table.tsx
git commit -m "feat: add detail drawer with forecast, year table, monthly pulse"
```

---

## Task 11: Rewrite Main Page

**Files:**
- Modify: `app/page.tsx` (full rewrite)

**Step 1: Simplify data fetching**

New page only needs 4 queries (down from 8):
1. `health_scores` — latest score
2. `annual_snapshots` — all years (for answer cards + sparklines + year table)
3. `monthly_event_counts` — last 12 months (for monthly pulse)
4. `forecasts` — latest (for detail drawer)
5. `collection_runs` — latest (for data freshness)

Remove: `overall_stats_snapshots`, `country_snapshots`, `wppr_rankings` queries.

**Step 2: Compute narrative server-side**

```typescript
import { generateNarrative } from '@/lib/narrative'
// After fetching health score:
const narrative = healthScore ? generateNarrative(healthScore as HealthScoreResult) : null
```

**Step 3: Build the single-viewport layout**

```
<div className="min-h-screen bg-background flex flex-col">
  <header> ... title, theme toggle, data freshness ... </header>
  <main className="flex-1 flex flex-col justify-center max-w-4xl mx-auto px-4">
    <section> ... gauge + narrative (centered) ... </section>
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <AnswerCard question="Are more people playing?" ... />
      <AnswerCard question="Are they coming back?" ... />
      <AnswerCard question="Is there more to compete in?" ... />
    </section>
  </main>
  <DetailDrawer ... />
  <footer> ... attribution ... </footer>
</div>
```

**Step 4: Verify with `npm run build`**

Run: `cd ~/projects/ifpa-health && npm run build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
cd ~/projects/ifpa-health
git add app/page.tsx
git commit -m "feat: rewrite dashboard page — single viewport narrative layout"
```

---

## Task 12: Delete Unused Components + Remove Recharts

**Files:**
- Delete: `components/annual-trends-chart.tsx`
- Delete: `components/monthly-comparison-chart.tsx`
- Delete: `components/forecast-chart.tsx`
- Delete: `components/retention-chart.tsx`
- Delete: `components/demographics-chart.tsx`
- Delete: `components/geographic-chart.tsx`
- Delete: `components/wppr-table.tsx`
- Delete: `components/methodology-panel.tsx`
- Delete: `components/metric-card.tsx`
- Delete: `components/health-score-breakdown.tsx`
- Modify: `package.json` — remove `recharts` dependency

**Step 1: Delete all unused component files**

Verify none of these are imported in the new `page.tsx` or any remaining component.

**Step 2: Uninstall recharts**

Run: `cd ~/projects/ifpa-health && npm uninstall recharts`

**Step 3: Build to verify nothing breaks**

Run: `cd ~/projects/ifpa-health && npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
cd ~/projects/ifpa-health
git add -A
git commit -m "chore: remove v1 chart components and recharts dependency"
```

---

## Task 13: Update Theme Toggle for Dark Default

**Files:**
- Modify: `components/theme-toggle.tsx`

**Step 1: Update toggle logic**

Current toggle flips between dark/light by checking for `.dark` class. Since dark is now the default, update:
- Toggle adds/removes `.light` class (instead of `.dark`)
- localStorage stores `'light'` when user switches to light
- Icon: sun icon in dark mode (click to go light), moon icon in light mode (click to go dark)

**Step 2: Commit**

```bash
cd ~/projects/ifpa-health
git add components/theme-toggle.tsx
git commit -m "feat: update theme toggle for dark-default design"
```

---

## Task 14: Mobile Responsive Pass

**Files:**
- Modify: `app/page.tsx` (if needed)
- Modify: `components/answer-card.tsx` (if needed)

**Step 1: Test at mobile viewport**

Open dev tools, test at 375px width. Verify:
- Health gauge + narrative stack vertically and are visible without scrolling
- 3 answer cards stack into single column
- Sparklines scale down gracefully
- Detail drawer works on mobile
- No horizontal overflow

**Step 2: Fix any issues found**

**Step 3: Commit**

```bash
cd ~/projects/ifpa-health
git add -A
git commit -m "fix: mobile responsive adjustments"
```

---

## Task 15: Deploy + Verify

**Files:**
- Modify: `NOTES.md` (add session notes)

**Step 1: Push to GitHub**

Run: `cd ~/projects/ifpa-health && git push origin main`

**Step 2: Wait for Vercel deployment**

Monitor at https://vercel.com or check `vercel` CLI.

**Step 3: Verify live site**

Open https://ifpa-health.vercel.app in browser:
- [ ] Dark background by default
- [ ] Health score gauge renders with correct number
- [ ] Narrative sentence reads naturally
- [ ] 3 answer cards show correct data with sparklines
- [ ] Detail drawer opens/closes
- [ ] Light mode toggle works
- [ ] Mobile viewport looks correct

**Step 4: Trigger daily cron to verify scorer works**

Hit `/api/cron/daily` with proper auth header to verify the updated health scorer produces a v2 score.

**Step 5: Update NOTES.md with session summary**

**Step 6: Commit and push notes**

```bash
cd ~/projects/ifpa-health
git add NOTES.md
git commit -m "docs: add v2 redesign session notes"
git push origin main
```
