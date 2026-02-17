// lib/__tests__/projected-score.test.ts
import { describe, it, expect } from 'vitest'
import { computeProjectedScore, type ProjectedScoreResult } from '../projected-score'
import type { ForecastResult } from '../forecast'

// ---------------------------------------------------------------------------
// Helper: build a valid ForecastResult with sensible defaults
// ---------------------------------------------------------------------------

function makeForecast(overrides: Partial<ForecastResult> = {}): ForecastResult {
  return {
    target_year: 2026,
    months_of_data: 3,
    projected_tournaments: 12000,
    projected_entries: 240000,
    projected_players: 8000,
    projected_returning: 3200,
    ci_68_low_tournaments: 11000,
    ci_68_high_tournaments: 13000,
    ci_95_low_tournaments: 10000,
    ci_95_high_tournaments: 14000,
    ci_68_low_entries: 220000,
    ci_68_high_entries: 260000,
    ci_95_low_entries: 200000,
    ci_95_high_entries: 280000,
    ci_68_low_players: 7200,
    ci_68_high_players: 8800,
    ci_68_low_returning: 2880,
    ci_68_high_returning: 3520,
    method: 'seasonal_ratio',
    trend_reference: null,
    ...overrides,
  }
}

describe('computeProjectedScore', () => {
  it('computes a projected score from forecast data', () => {
    const forecast = makeForecast()
    const result = computeProjectedScore(forecast, 7500, 11000)

    expect(result).not.toBeNull()
    const r = result as ProjectedScoreResult

    expect(r.projected_score).toBeGreaterThanOrEqual(0)
    expect(r.projected_score).toBeLessThanOrEqual(100)
    expect(r.projected_band).toBeDefined()
    expect(['thriving', 'healthy', 'stable', 'concerning', 'critical']).toContain(r.projected_band)
    expect(r.months_of_data).toBe(3)
  })

  it('CI low <= projected <= CI high', () => {
    const forecast = makeForecast()
    const result = computeProjectedScore(forecast, 7500, 11000)

    expect(result).not.toBeNull()
    const r = result as ProjectedScoreResult

    expect(r.ci_low_score).toBeLessThanOrEqual(r.projected_score)
    expect(r.ci_high_score).toBeGreaterThanOrEqual(r.projected_score)
  })

  it('returns null when forecast has no player projections', () => {
    const forecast = makeForecast({ projected_players: 0 })
    const result = computeProjectedScore(forecast, 7500, 11000)

    expect(result).toBeNull()
  })

  it('returns null when months_of_data < 2', () => {
    const forecast = makeForecast({ months_of_data: 1 })
    const result = computeProjectedScore(forecast, 7500, 11000)

    expect(result).toBeNull()
  })

  it('strong growth scenario produces high score', () => {
    // Prior year: 7000 players, 10000 tournaments
    // Projected: 8106 players (15.8% up), 3242 returning (40% retention), 11670 tournaments (16.7% up)
    const forecast = makeForecast({
      projected_players: 8106,
      projected_returning: 3242,
      projected_tournaments: 11670,
      ci_68_low_players: 7800,
      ci_68_high_players: 8400,
      ci_68_low_returning: 3100,
      ci_68_high_returning: 3400,
      ci_68_low_tournaments: 11200,
      ci_68_high_tournaments: 12100,
    })
    const result = computeProjectedScore(forecast, 7000, 10000)

    expect(result).not.toBeNull()
    const r = result as ProjectedScoreResult

    // player_yoy_pct = +15.8% -> score ~100
    // retention_rate  = 40%   -> score ~83.3
    // tournament_yoy  = +16.7% -> score 100
    // composite ~94.4 -> should be well above 70
    expect(r.projected_score).toBeGreaterThan(70)
    expect(r.projected_band).toBe('thriving')
  })
})
