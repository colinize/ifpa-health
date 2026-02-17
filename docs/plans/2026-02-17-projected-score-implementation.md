# Projected 2026 Health Score — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a forward-looking projected health score for 2026, displayed as a mini gauge with confidence range below the existing backward-looking gauge.

**Architecture:** Extend the existing seasonal-ratio forecast engine to project unique players and returning players (using tournament seasonality as proxy), compute a projected health score from the forecast outputs, and render it in a smaller gauge with a translucent CI arc. No new tables or cron jobs — extends the existing forecaster.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres), Vitest, SVG

---

### Task 1: Database Migration — Add Player/Retention Columns to Forecasts

**Files:**
- Create: `supabase/migrations/002_forecast_player_columns.sql`

**Context:** The `forecasts` table currently stores tournament and entry projections. We need to add columns for projected player counts and returning player counts with their confidence intervals, so the forecaster can store all projections in one row.

**Step 1: Write the migration SQL**

```sql
-- 002_forecast_player_columns.sql
-- Add player and returning player projection columns to forecasts table

ALTER TABLE forecasts
  ADD COLUMN IF NOT EXISTS projected_unique_players integer,
  ADD COLUMN IF NOT EXISTS projected_returning_players integer,
  ADD COLUMN IF NOT EXISTS ci_68_low_players integer,
  ADD COLUMN IF NOT EXISTS ci_68_high_players integer,
  ADD COLUMN IF NOT EXISTS ci_68_low_returning integer,
  ADD COLUMN IF NOT EXISTS ci_68_high_returning integer;
```

**Step 2: Apply the migration via Supabase**

Run the SQL against the Supabase project. Since the Supabase MCP may not be authenticated, use a script:

```bash
npx tsx -e "
const { config } = require('dotenv'); config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.rpc('exec_sql', { query: \`
  ALTER TABLE forecasts
    ADD COLUMN IF NOT EXISTS projected_unique_players integer,
    ADD COLUMN IF NOT EXISTS projected_returning_players integer,
    ADD COLUMN IF NOT EXISTS ci_68_low_players integer,
    ADD COLUMN IF NOT EXISTS ci_68_high_players integer,
    ADD COLUMN IF NOT EXISTS ci_68_low_returning integer,
    ADD COLUMN IF NOT EXISTS ci_68_high_returning integer;
\` }).then(console.log).catch(console.error);
"
```

If `rpc('exec_sql')` isn't available, write a standalone `scripts/migrate-002.ts` that uses the service role key to run the ALTER TABLE directly via the Supabase REST API or `pg` library. Alternatively, apply via the Supabase SQL Editor in the dashboard.

**Step 3: Verify columns exist**

Query the table to confirm:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'forecasts' ORDER BY ordinal_position;
```

**Step 4: Commit**

```bash
git add supabase/migrations/002_forecast_player_columns.sql
git commit -m "migration: add player/returning projection columns to forecasts"
```

---

### Task 2: Extend Forecast Module — Project Players and Returning Players

**Files:**
- Modify: `lib/forecast.ts`
- Create: `lib/__tests__/forecast.test.ts`

**Context:** The `computeForecast()` function currently projects tournaments and entries. We need to extend it to also project unique players and returning players using tournament seasonal weights as a proxy. The `AnnualData` type needs `unique_players` and `returning_players` fields. CI for player projections uses the same tournament back-test ratios.

**Step 1: Write failing tests**

Create `lib/__tests__/forecast.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  computeMonthlyWeights,
  computeForecast,
  type AnnualData,
  type MonthlyData,
} from '../forecast'

// Synthetic data: 3 reference years with known seasonal patterns
const annualData: AnnualData[] = [
  { year: 2022, tournaments: 1200, entries: 24000, unique_players: 8000, returning_players: 3200 },
  { year: 2023, tournaments: 1300, entries: 26000, unique_players: 8500, returning_players: 3400 },
  { year: 2024, tournaments: 1400, entries: 28000, unique_players: 9000, returning_players: 3600 },
  { year: 2025, tournaments: 1500, entries: 30000, unique_players: 9500, returning_players: 3800 },
]

// Even monthly distribution for simplicity: each month = 1/12 of annual
const monthlyData: MonthlyData[] = []
for (const year of [2022, 2023, 2024, 2025]) {
  const annual = annualData.find(a => a.year === year)!
  for (let m = 1; m <= 12; m++) {
    monthlyData.push({
      year,
      month: m,
      event_count: Math.round(annual.tournaments / 12),
    })
  }
}

describe('computeForecast with player projections', () => {
  it('projects players and returning players using tournament weights', () => {
    const weights = computeMonthlyWeights(annualData, monthlyData, [2022, 2023, 2024, 2025])

    const result = computeForecast(
      250,   // ytdTournaments (2 months)
      5000,  // ytdEntries
      1600,  // ytdPlayers
      640,   // ytdReturning
      2,     // completedMonths
      weights,
      annualData,
      monthlyData,
      2026,
    )

    // With even monthly weights, 2 months = 2/12 ≈ 0.167 cumulative weight
    // projected = 1600 / 0.167 ≈ 9600
    expect(result.projected_players).toBeGreaterThan(0)
    expect(result.projected_returning).toBeGreaterThan(0)
    expect(result.projected_players).toBeGreaterThan(result.projected_returning)

    // CI should exist
    expect(result.ci_68_low_players).toBeLessThanOrEqual(result.projected_players)
    expect(result.ci_68_high_players).toBeGreaterThanOrEqual(result.projected_players)
    expect(result.ci_68_low_returning).toBeLessThanOrEqual(result.projected_returning)
    expect(result.ci_68_high_returning).toBeGreaterThanOrEqual(result.projected_returning)
  })

  it('returns zero player projections when completedMonths < 2', () => {
    const weights = computeMonthlyWeights(annualData, monthlyData, [2022, 2023, 2024, 2025])

    const result = computeForecast(100, 2000, 800, 320, 1, weights, annualData, monthlyData, 2026)

    expect(result.projected_players).toBe(0)
    expect(result.projected_returning).toBe(0)
  })

  it('handles zero ytdPlayers gracefully', () => {
    const weights = computeMonthlyWeights(annualData, monthlyData, [2022, 2023, 2024, 2025])

    const result = computeForecast(250, 5000, 0, 0, 2, weights, annualData, monthlyData, 2026)

    expect(result.projected_players).toBe(0)
    expect(result.projected_returning).toBe(0)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/forecast.test.ts
```

Expected: FAIL — `computeForecast` doesn't accept player/returning params yet.

**Step 3: Extend `AnnualData` and `ForecastResult` types**

In `lib/forecast.ts`, update:

```typescript
export interface AnnualData {
  year: number
  tournaments: number
  entries: number
  unique_players: number       // NEW
  returning_players: number    // NEW
}

export interface ForecastResult {
  // ... all existing fields ...
  projected_players: number        // NEW
  projected_returning: number      // NEW
  ci_68_low_players: number        // NEW
  ci_68_high_players: number       // NEW
  ci_68_low_returning: number      // NEW
  ci_68_high_returning: number     // NEW
}
```

**Step 4: Extend `computeForecast()` signature and implementation**

Add `ytdPlayers` and `ytdReturning` parameters after `ytdEntries`. Add player/returning projection logic using `cumulativeTournamentWeight` (same weight used for entries). For CI, apply the same tournament back-test ratio distribution:

```typescript
export function computeForecast(
  ytdTournaments: number,
  ytdEntries: number,
  ytdPlayers: number,       // NEW
  ytdReturning: number,     // NEW
  completedMonths: number,
  monthlyWeights: MonthlyWeights,
  annualData: AnnualData[],
  monthlyData: MonthlyData[],
  targetYear: number
): ForecastResult {
  // ... existing empty result with new zero fields ...

  // After existing tournament/entry projections:
  const projectedPlayers = ytdPlayers > 0
    ? Math.round(ytdPlayers / cumulativeTournamentWeight)
    : 0
  const projectedReturning = ytdReturning > 0
    ? Math.round(ytdReturning / cumulativeTournamentWeight)
    : 0

  // CI for players/returning: use same tournament ratio distribution
  let ci68LowPlayers: number
  let ci68HighPlayers: number
  let ci68LowReturning: number
  let ci68HighReturning: number

  if (tournamentRatios.length >= 2) {
    const ratioMean = mean(tournamentRatios)
    const ratioStd = stddev(tournamentRatios)
    ci68LowPlayers = Math.round(projectedPlayers * (ratioMean - ratioStd))
    ci68HighPlayers = Math.round(projectedPlayers * (ratioMean + ratioStd))
    ci68LowReturning = Math.round(projectedReturning * (ratioMean - ratioStd))
    ci68HighReturning = Math.round(projectedReturning * (ratioMean + ratioStd))
  } else {
    // Fallback: same relative uncertainty as tournaments
    const cumulativeWeightStd = Math.sqrt(
      monthlyWeights.weight_std
        .slice(0, completedMonths)
        .reduce((sum, s) => sum + s * s, 0)
    )
    const relativeUncertainty = cumulativeWeightStd / cumulativeTournamentWeight
    ci68LowPlayers = Math.round(projectedPlayers * (1 - relativeUncertainty))
    ci68HighPlayers = Math.round(projectedPlayers * (1 + relativeUncertainty))
    ci68LowReturning = Math.round(projectedReturning * (1 - relativeUncertainty))
    ci68HighReturning = Math.round(projectedReturning * (1 + relativeUncertainty))
  }

  // Include new fields in return
```

**Step 5: Update the empty result** at the top of `computeForecast` to include the new zero-value fields.

**Step 6: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/forecast.test.ts
```

Expected: PASS

**Step 7: Run existing tests to confirm no regressions**

```bash
npx vitest run
```

The existing health-score and narrative tests should still pass. If the forecaster collector calls `computeForecast` with the old signature, it will break — that's expected and fixed in Task 4.

**Step 8: Commit**

```bash
git add lib/forecast.ts lib/__tests__/forecast.test.ts
git commit -m "feat: extend forecast to project players and returning players"
```

---

### Task 3: Create Projected Score Module

**Files:**
- Create: `lib/projected-score.ts`
- Create: `lib/__tests__/projected-score.test.ts`

**Context:** This module takes forecast outputs (projected players, returning, tournaments) plus prior year actuals and computes a projected health score using the existing `computeHealthScore()`. It also computes CI-bound scores by running the algorithm on pessimistic and optimistic inputs.

**Step 1: Write failing tests**

Create `lib/__tests__/projected-score.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeProjectedScore } from '../projected-score'
import type { ForecastResult } from '../forecast'

function makeForecast(overrides: Partial<ForecastResult> = {}): ForecastResult {
  return {
    target_year: 2026,
    months_of_data: 2,
    projected_tournaments: 1650,
    projected_entries: 33000,
    projected_players: 10000,
    projected_returning: 4000,
    ci_68_low_tournaments: 1500,
    ci_68_high_tournaments: 1800,
    ci_95_low_tournaments: 1350,
    ci_95_high_tournaments: 1950,
    ci_68_low_entries: 30000,
    ci_68_high_entries: 36000,
    ci_95_low_entries: 27000,
    ci_95_high_entries: 39000,
    ci_68_low_players: 9000,
    ci_68_high_players: 11000,
    ci_68_low_returning: 3600,
    ci_68_high_returning: 4400,
    method: 'seasonal_ratio',
    trend_reference: null,
    ...overrides,
  }
}

describe('computeProjectedScore', () => {
  it('computes a projected score from forecast data', () => {
    const result = computeProjectedScore(
      makeForecast(),
      9500,  // priorYearPlayers (2025)
      1500,  // priorYearTournaments (2025)
    )

    expect(result.projected_score).toBeGreaterThan(0)
    expect(result.projected_score).toBeLessThanOrEqual(100)
    expect(result.projected_band).toBeDefined()
    expect(result.months_of_data).toBe(2)
  })

  it('CI low score <= projected <= CI high score', () => {
    const result = computeProjectedScore(
      makeForecast(),
      9500,
      1500,
    )

    expect(result.ci_low_score).toBeLessThanOrEqual(result.projected_score)
    expect(result.ci_high_score).toBeGreaterThanOrEqual(result.projected_score)
  })

  it('returns null when forecast has no player projections', () => {
    const result = computeProjectedScore(
      makeForecast({ projected_players: 0, projected_returning: 0 }),
      9500,
      1500,
    )

    expect(result).toBeNull()
  })

  it('returns null when months_of_data < 2', () => {
    const result = computeProjectedScore(
      makeForecast({ months_of_data: 1 }),
      9500,
      1500,
    )

    expect(result).toBeNull()
  })

  it('handles strong growth scenario', () => {
    const result = computeProjectedScore(
      makeForecast({
        projected_players: 11000,
        projected_returning: 4500,
        projected_tournaments: 1750,
        ci_68_low_players: 10000,
        ci_68_high_players: 12000,
        ci_68_low_returning: 4000,
        ci_68_high_returning: 5000,
        ci_68_low_tournaments: 1600,
        ci_68_high_tournaments: 1900,
      }),
      9500,
      1500,
    )

    expect(result).not.toBeNull()
    // 15.8% player growth, 40.9% retention, 16.7% tournament growth
    // All strong indicators → score should be high
    expect(result!.projected_score).toBeGreaterThan(70)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/projected-score.test.ts
```

Expected: FAIL — module doesn't exist yet.

**Step 3: Implement `projected-score.ts`**

Create `lib/projected-score.ts`:

```typescript
import { computeHealthScore, getBand, type Band } from './health-score'
import type { ForecastResult } from './forecast'

export interface ProjectedScoreResult {
  projected_score: number
  projected_band: Band
  ci_low_score: number
  ci_high_score: number
  ci_low_band: Band
  ci_high_band: Band
  months_of_data: number
}

export function computeProjectedScore(
  forecast: ForecastResult,
  priorYearPlayers: number,
  priorYearTournaments: number,
): ProjectedScoreResult | null {
  if (forecast.months_of_data < 2) return null
  if (forecast.projected_players === 0) return null

  // Point estimate inputs
  const playerYoyPct = priorYearPlayers > 0
    ? ((forecast.projected_players - priorYearPlayers) / priorYearPlayers) * 100
    : 0
  const retentionRate = forecast.projected_players > 0
    ? (forecast.projected_returning / forecast.projected_players) * 100
    : 0
  const tournamentYoyPct = priorYearTournaments > 0
    ? ((forecast.projected_tournaments - priorYearTournaments) / priorYearTournaments) * 100
    : 0

  const main = computeHealthScore({
    player_yoy_pct: playerYoyPct,
    retention_rate: retentionRate,
    tournament_yoy_pct: tournamentYoyPct,
  })

  // Pessimistic (CI low) inputs
  const pessPlayerYoy = priorYearPlayers > 0
    ? ((forecast.ci_68_low_players - priorYearPlayers) / priorYearPlayers) * 100
    : 0
  const pessRetention = forecast.ci_68_low_players > 0
    ? (forecast.ci_68_low_returning / forecast.ci_68_low_players) * 100
    : 0
  const pessTournamentYoy = priorYearTournaments > 0
    ? ((forecast.ci_68_low_tournaments - priorYearTournaments) / priorYearTournaments) * 100
    : 0

  const pessimistic = computeHealthScore({
    player_yoy_pct: pessPlayerYoy,
    retention_rate: pessRetention,
    tournament_yoy_pct: pessTournamentYoy,
  })

  // Optimistic (CI high) inputs
  const optPlayerYoy = priorYearPlayers > 0
    ? ((forecast.ci_68_high_players - priorYearPlayers) / priorYearPlayers) * 100
    : 0
  const optRetention = forecast.ci_68_high_players > 0
    ? (forecast.ci_68_high_returning / forecast.ci_68_high_players) * 100
    : 0
  const optTournamentYoy = priorYearTournaments > 0
    ? ((forecast.ci_68_high_tournaments - priorYearTournaments) / priorYearTournaments) * 100
    : 0

  const optimistic = computeHealthScore({
    player_yoy_pct: optPlayerYoy,
    retention_rate: optRetention,
    tournament_yoy_pct: optTournamentYoy,
  })

  return {
    projected_score: main.composite_score,
    projected_band: main.band,
    ci_low_score: pessimistic.composite_score,
    ci_high_score: optimistic.composite_score,
    ci_low_band: pessimistic.band,
    ci_high_band: optimistic.band,
    months_of_data: forecast.months_of_data,
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run lib/__tests__/projected-score.test.ts
```

Expected: PASS

**Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All pass (health-score, narrative, forecast, projected-score).

**Step 6: Commit**

```bash
git add lib/projected-score.ts lib/__tests__/projected-score.test.ts
git commit -m "feat: add projected score module with CI bounds"
```

---

### Task 4: Extend Forecaster Collector

**Files:**
- Modify: `lib/collectors/forecaster.ts`

**Context:** The forecaster runs daily. It currently reads annual and monthly data, computes YTD tournaments/entries, and calls `computeForecast()`. We need to:
1. Read YTD unique players and returning players from `annual_snapshots` (the annual collector already stores 2026 partial-year data)
2. Pass these to the extended `computeForecast()`
3. Store the new columns in the `forecasts` upsert

**Step 1: Update forecaster to read player data from annual_snapshots**

In `lib/collectors/forecaster.ts`, after the existing annual data query, extract the current year's player counts:

```typescript
// After existing annualData construction, also build with player fields
const annualData: AnnualData[] = (annualRows ?? []).map((r) => ({
  year: r.year,
  tournaments: r.tournaments,
  entries: r.player_entries,
  unique_players: r.unique_players ?? 0,
  returning_players: r.returning_players ?? 0,
}))
```

Update the `annualRows` query to also select `unique_players` and `returning_players`:

```typescript
const { data: annualRows } = await supabase
  .from('annual_snapshots')
  .select('year, tournaments, player_entries, unique_players, returning_players')
  .order('year', { ascending: true })
```

**Step 2: Get YTD player counts for the target year**

After the existing `ytdEntries` logic, add:

```typescript
let ytdPlayers = 0
let ytdReturning = 0

if (currentYearAnnual) {
  ytdPlayers = currentYearAnnual.unique_players
  ytdReturning = currentYearAnnual.returning_players
}
```

Note: `currentYearAnnual` is already computed from `annualData.find((a) => a.year === targetYear)`.

**Step 3: Pass new params to `computeForecast()`**

```typescript
const forecast = computeForecast(
  ytdTournaments,
  ytdEntries,
  ytdPlayers,       // NEW
  ytdReturning,     // NEW
  completedMonths,
  monthlyWeights,
  annualData,
  monthlyData,
  targetYear
)
```

**Step 4: Store new columns in the upsert**

Add to the upsert object:

```typescript
projected_unique_players: forecast.projected_players,
projected_returning_players: forecast.projected_returning,
ci_68_low_players: forecast.ci_68_low_players,
ci_68_high_players: forecast.ci_68_high_players,
ci_68_low_returning: forecast.ci_68_low_returning,
ci_68_high_returning: forecast.ci_68_high_returning,
```

**Step 5: Update the return details**

Add to the `details` object:

```typescript
ytd_players: ytdPlayers,
ytd_returning: ytdReturning,
projected_players: forecast.projected_players,
projected_returning: forecast.projected_returning,
```

**Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: Clean (no errors).

**Step 7: Commit**

```bash
git add lib/collectors/forecaster.ts
git commit -m "feat: extend forecaster to project players and retention"
```

---

### Task 5: Create Projected Gauge Component

**Files:**
- Create: `components/projected-gauge.tsx`

**Context:** A mini version of the existing `HealthScoreGauge` at ~60% size. Shows the projected score with a translucent CI range arc behind the main progress arc. No count-up animation (keeps it subordinate). Uses the same band colors via CSS variables. Label "2026 Projected" in muted text below.

**Reference:** Study `components/health-score-gauge.tsx` for the SVG arc math. The mini gauge uses the same geometry scaled down.

**Step 1: Create the component**

Create `components/projected-gauge.tsx`:

```tsx
interface ProjectedGaugeProps {
  score: number
  band: string
  ciLow: number
  ciHigh: number
  year: number
}

const bandColors: Record<string, string> = {
  thriving: 'var(--band-thriving)',
  healthy: 'var(--band-healthy)',
  stable: 'var(--band-stable)',
  concerning: 'var(--band-concerning)',
  critical: 'var(--band-critical)',
}

export function ProjectedGauge({ score, band, ciLow, ciHigh, year }: ProjectedGaugeProps) {
  const color = bandColors[band.toLowerCase()] ?? 'var(--flat)'

  // Semi-circle geometry (same as main gauge, rendered smaller via width/height)
  const cx = 100
  const cy = 100
  const r = 80
  const circumference = Math.PI * r

  const clampedScore = Math.max(0, Math.min(100, score))
  const clampedLow = Math.max(0, Math.min(100, ciLow))
  const clampedHigh = Math.max(0, Math.min(100, ciHigh))

  // Main progress arc
  const progress = (clampedScore / 100) * circumference
  const dashOffset = circumference - progress

  // CI range arc: show only the segment from ciLow to ciHigh
  const ciLowPos = (clampedLow / 100) * circumference
  const ciHighPos = (clampedHigh / 100) * circumference
  const ciLength = ciHighPos - ciLowPos

  const startX = cx - r
  const startY = cy
  const endX = cx + r
  const endY = cy
  const arcPath = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`

  return (
    <div className="flex flex-col items-center">
      <svg
        width="120"
        height="72"
        viewBox="0 0 200 120"
        className="overflow-visible"
      >
        {/* Background track */}
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className="text-muted/30"
        />
        {/* CI range arc (translucent) */}
        {ciLength > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeOpacity={0.2}
            strokeWidth="16"
            strokeDasharray={`${ciLength} ${circumference}`}
            strokeDashoffset={`${-ciLowPos}`}
          />
        )}
        {/* Progress arc (solid) */}
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        {/* Score number */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground"
          style={{ fontSize: '36px', fontWeight: 700 }}
        >
          {Math.round(clampedScore)}
        </text>
      </svg>
      {/* Label */}
      <span className="text-xs text-muted-foreground -mt-1">
        {year} Projected
      </span>
      {/* Range */}
      <span className="text-xs text-muted-foreground/60">
        {Math.round(clampedLow)}&ndash;{Math.round(clampedHigh)}
      </span>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add components/projected-gauge.tsx
git commit -m "feat: add projected gauge component with CI range arc"
```

---

### Task 6: Wire Up Page — Compute and Render Projected Score

**Files:**
- Modify: `app/page.tsx`

**Context:** The page is a server component. It already reads the `forecasts` table. We need to:
1. Read the new player/returning columns from the forecast row
2. Import and call `computeProjectedScore()` with forecast + prior year data
3. Render the `ProjectedGauge` between the main gauge and the narrative

**Step 1: Import new modules**

Add to the imports at the top of `app/page.tsx`:

```typescript
import { computeProjectedScore } from '@/lib/projected-score'
import type { ForecastResult } from '@/lib/forecast'
import { ProjectedGauge } from '@/components/projected-gauge'
```

**Step 2: Build ForecastResult from the Supabase row**

After the existing data fetching and before the return JSX, add:

```typescript
// Build ForecastResult for projected score computation
const projectedScoreResult = forecast ? computeProjectedScore(
  {
    target_year: forecast.target_year,
    months_of_data: forecast.months_of_data,
    projected_tournaments: Math.round(parseFloat(String(forecast.projected_tournaments ?? 0))),
    projected_entries: Math.round(parseFloat(String(forecast.projected_entries ?? 0))),
    projected_players: forecast.projected_unique_players ?? 0,
    projected_returning: forecast.projected_returning_players ?? 0,
    ci_68_low_tournaments: Math.round(parseFloat(String(forecast.ci_68_low_tournaments ?? 0))),
    ci_68_high_tournaments: Math.round(parseFloat(String(forecast.ci_68_high_tournaments ?? 0))),
    ci_95_low_tournaments: Math.round(parseFloat(String(forecast.ci_95_low_tournaments ?? 0))),
    ci_95_high_tournaments: Math.round(parseFloat(String(forecast.ci_95_high_tournaments ?? 0))),
    ci_68_low_entries: Math.round(parseFloat(String(forecast.ci_68_low_entries ?? 0))),
    ci_68_high_entries: Math.round(parseFloat(String(forecast.ci_68_high_entries ?? 0))),
    ci_95_low_entries: Math.round(parseFloat(String(forecast.ci_95_low_entries ?? 0))),
    ci_95_high_entries: Math.round(parseFloat(String(forecast.ci_95_high_entries ?? 0))),
    ci_68_low_players: forecast.ci_68_low_players ?? 0,
    ci_68_high_players: forecast.ci_68_high_players ?? 0,
    ci_68_low_returning: forecast.ci_68_low_returning ?? 0,
    ci_68_high_returning: forecast.ci_68_high_returning ?? 0,
    method: 'seasonal_ratio',
    trend_reference: null,
  } as ForecastResult,
  latestYear?.unique_players ?? 0,
  latestYear?.tournaments ?? 0,
) : null
```

**Step 3: Render ProjectedGauge in the JSX**

In the health score + narrative `<section>`, add the projected gauge between the main gauge and the narrative:

```tsx
<section className="flex flex-col items-center gap-4">
  <HealthScoreGauge score={healthScore?.composite_score ?? 0} band={healthScore?.band ?? 'stable'} />
  {projectedScoreResult && (
    <ProjectedGauge
      score={projectedScoreResult.projected_score}
      band={projectedScoreResult.projected_band}
      ciLow={projectedScoreResult.ci_low_score}
      ciHigh={projectedScoreResult.ci_high_score}
      year={forecast!.target_year}
    />
  )}
  <NarrativeDisplay text={narrative} />
</section>
```

The `{projectedScoreResult && ...}` conditional means nothing renders if forecast data is missing or has < 2 months.

**Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire up projected score gauge on dashboard"
```

---

### Task 7: Recompute Forecast with Player Data, Deploy, and Verify

**Files:**
- Create: `scripts/recompute-forecast.ts` (one-time script)

**Context:** The forecasts table doesn't have player projection data yet. We need to run the forecaster once to populate the new columns, then deploy and verify the projected gauge appears on the live site.

**Step 1: Create a recompute script**

Create `scripts/recompute-forecast.ts`:

```typescript
import { config } from 'dotenv'
config({ path: '.env.local' })

// Dynamic import to ensure env is loaded first
async function main() {
  const { runForecaster } = await import('../lib/collectors/forecaster')
  const result = await runForecaster()
  console.log('Forecaster result:', JSON.stringify(result, null, 2))
}

main().catch(console.error)
```

**Step 2: Run the script**

```bash
npx tsx scripts/recompute-forecast.ts
```

Expected output should show `projected_players` and `projected_returning` values > 0.

**Step 3: Verify the data in Supabase**

Query the forecasts table to confirm new columns are populated:

```sql
SELECT target_year, months_of_data, projected_tournaments, projected_unique_players, projected_returning_players, ci_68_low_players, ci_68_high_players
FROM forecasts
ORDER BY forecast_date DESC
LIMIT 1;
```

**Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 6: Local dev verification**

```bash
npm run dev
```

Open `http://localhost:3000` and verify:
- Main gauge shows the backward-looking score (84 Thriving)
- Below it, a smaller gauge shows the projected 2026 score with a range
- The CI arc is visible as a faded band behind the score arc
- "2026 Projected" label and range numbers appear below

**Step 7: Deploy**

```bash
npx vercel --prod
```

**Step 8: Verify production**

Open https://ifpa-health.vercel.app and confirm the projected gauge appears correctly.

**Step 9: Commit script and any final tweaks**

```bash
git add scripts/recompute-forecast.ts
git commit -m "chore: add forecast recompute script and deploy projected score"
```
