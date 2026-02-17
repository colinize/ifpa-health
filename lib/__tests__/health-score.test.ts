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
    expect(result.composite_score).toBeCloseTo(50, 0)
  })

  it('defaults to methodology version 2', () => {
    const result = computeHealthScore({
      player_yoy_pct: 0,
      retention_rate: 35,
      tournament_yoy_pct: 0,
    })
    expect(result.methodology_version).toBe(2)
  })
})
