// lib/__tests__/forecast.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeForecast,
  computeMonthlyWeights,
  type AnnualData,
  type MonthlyData,
} from '../forecast'

// ---------------------------------------------------------------------------
// Synthetic reference data: 4 years with even monthly distribution
// Each month = annual / 12 so the math is predictable.
// ---------------------------------------------------------------------------

function makeAnnualData(): AnnualData[] {
  return [
    { year: 2022, tournaments: 1200, entries: 24000, unique_players: 6000, returning_players: 2400 },
    { year: 2023, tournaments: 1320, entries: 26400, unique_players: 6600, returning_players: 2640 },
    { year: 2024, tournaments: 1440, entries: 28800, unique_players: 7200, returning_players: 2880 },
    { year: 2025, tournaments: 1560, entries: 31200, unique_players: 7800, returning_players: 3120 },
  ]
}

function makeMonthlyData(): MonthlyData[] {
  const annualData = makeAnnualData()
  const monthly: MonthlyData[] = []
  for (const ad of annualData) {
    const perMonth = ad.tournaments / 12
    for (let m = 1; m <= 12; m++) {
      monthly.push({ year: ad.year, month: m, event_count: perMonth })
    }
  }
  return monthly
}

const annualData = makeAnnualData()
const monthlyData = makeMonthlyData()
const referenceYears = [2022, 2023, 2024, 2025]
const weights = computeMonthlyWeights(annualData, monthlyData, referenceYears)

describe('computeForecast — player and returning projections', () => {
  it('projects players and returning players using tournament weights', () => {
    // With even distribution, 2 months = 2/12 of the year.
    // ytdPlayers=1300 -> projected = 1300 / (2/12) = 7800
    // ytdReturning=520 -> projected = 520 / (2/12) = 3120
    const result = computeForecast(
      260,    // ytdTournaments (2 months of ~130/mo)
      5200,   // ytdEntries
      1300,   // ytdPlayers
      520,    // ytdReturning
      2,      // completedMonths
      weights,
      annualData,
      monthlyData,
      2026
    )

    expect(result.projected_players).toBeGreaterThan(0)
    expect(result.projected_returning).toBeGreaterThan(0)
    expect(result.projected_players).toBeGreaterThan(result.projected_returning)

    // CI bounds should bracket the point estimate
    expect(result.ci_68_low_players).toBeLessThanOrEqual(result.projected_players)
    expect(result.ci_68_high_players).toBeGreaterThanOrEqual(result.projected_players)
    expect(result.ci_68_low_returning).toBeLessThanOrEqual(result.projected_returning)
    expect(result.ci_68_high_returning).toBeGreaterThanOrEqual(result.projected_returning)
  })

  it('returns zero player projections when completedMonths < 2', () => {
    const result = computeForecast(
      100,    // ytdTournaments
      2000,   // ytdEntries
      800,    // ytdPlayers
      320,    // ytdReturning
      1,      // completedMonths — too few
      weights,
      annualData,
      monthlyData,
      2026
    )

    expect(result.projected_players).toBe(0)
    expect(result.projected_returning).toBe(0)
    expect(result.ci_68_low_players).toBe(0)
    expect(result.ci_68_high_players).toBe(0)
    expect(result.ci_68_low_returning).toBe(0)
    expect(result.ci_68_high_returning).toBe(0)
  })

  it('handles zero ytdPlayers gracefully', () => {
    const result = computeForecast(
      250,    // ytdTournaments
      5000,   // ytdEntries
      0,      // ytdPlayers — zero
      0,      // ytdReturning — zero
      2,      // completedMonths
      weights,
      annualData,
      monthlyData,
      2026
    )

    expect(result.projected_players).toBe(0)
    expect(result.projected_returning).toBe(0)
    // CI for zero projections should also be zero
    expect(result.ci_68_low_players).toBe(0)
    expect(result.ci_68_high_players).toBe(0)
    expect(result.ci_68_low_returning).toBe(0)
    expect(result.ci_68_high_returning).toBe(0)

    // Tournament/entry projections should still work
    expect(result.projected_tournaments).toBeGreaterThan(0)
    expect(result.projected_entries).toBeGreaterThan(0)
  })
})
