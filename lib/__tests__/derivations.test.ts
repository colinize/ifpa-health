import { describe, it, expect } from 'vitest'
import {
  computeLifecycleData,
  computeCountryGrowthData,
} from '../derivations'

describe('computeLifecycleData', () => {
  const prior = { year: 2023, unique_players: 1000, returning_players: 800 }
  const latest = { year: 2024, unique_players: 1200, returning_players: 700 }

  it('computes churn and new-player counts from two complete years', () => {
    const result = computeLifecycleData(prior, latest)
    expect(result).toEqual({
      priorYear: 2023,
      currentYear: 2024,
      priorTotal: 1000,
      churned: 300,      // 1000 prior - 700 returning
      newPlayers: 500,   // 1200 latest - 700 returning
      currentTotal: 1200,
    })
  })

  it('returns null when prior year is missing', () => {
    expect(computeLifecycleData(undefined, latest)).toBeNull()
  })

  it('returns null when latest year is missing', () => {
    expect(computeLifecycleData(prior, undefined)).toBeNull()
  })

  it('returns null when returning_players is null (the null-handling bug fix)', () => {
    // Pre-fix: `returning_players > 0` coerced null → false → returned null by
    // accident. Post-fix: the null check is explicit, so this still returns
    // null but for the right reason. More importantly, a `returning_players`
    // of 0 must NOT be treated as missing — see next test.
    const latestNull = { year: 2024, unique_players: 1200, returning_players: null }
    expect(computeLifecycleData(prior, latestNull)).toBeNull()
  })

  it('treats returning_players === 0 as a legitimate value (regression guard)', () => {
    // "Everyone is new this year" is a real outcome, not a data gap. The old
    // `> 0` truthiness check would drop this case.
    const latestZero = { year: 2024, unique_players: 1200, returning_players: 0 }
    const result = computeLifecycleData(prior, latestZero)
    expect(result).not.toBeNull()
    expect(result?.newPlayers).toBe(1200)
    expect(result?.churned).toBe(1000)
  })
})

describe('computeCountryGrowthData', () => {
  it('returns an empty array for null / empty input', () => {
    expect(computeCountryGrowthData(null)).toEqual([])
    expect(computeCountryGrowthData(undefined)).toEqual([])
    expect(computeCountryGrowthData([])).toEqual([])
  })

  it('collapses multiple snapshots per country and sorts by active_players desc', () => {
    const snapshots = [
      { snapshot_date: '2024-01-01', country_name: 'USA', country_code: 'US', active_players: 5000 },
      { snapshot_date: '2024-06-01', country_name: 'USA', country_code: 'US', active_players: 5500 },
      { snapshot_date: '2024-01-01', country_name: 'Canada', country_code: 'CA', active_players: 1000 },
      { snapshot_date: '2024-06-01', country_name: 'Canada', country_code: 'CA', active_players: 1100 },
    ]

    const result = computeCountryGrowthData(snapshots)

    expect(result).toHaveLength(2)
    expect(result[0].country_name).toBe('USA')  // sorted first by active_players
    expect(result[0].change).toBe(500)
    expect(result[0].change_pct).toBeCloseTo(10, 1)
    expect(result[0].first_snapshot).toBe('2024-01-01')
    expect(result[0].latest_snapshot).toBe('2024-06-01')
    expect(result[1].country_name).toBe('Canada')
  })

  it('sets change and change_pct to null for a single-snapshot country', () => {
    const snapshots = [
      { snapshot_date: '2024-06-01', country_name: 'Japan', country_code: 'JP', active_players: 2000 },
    ]
    const result = computeCountryGrowthData(snapshots)
    expect(result).toHaveLength(1)
    expect(result[0].change).toBeNull()
    expect(result[0].change_pct).toBeNull()
    expect(result[0].active_players).toBe(2000)
  })

  it('falls back to empty string when country_code is null', () => {
    const snapshots = [
      { snapshot_date: '2024-01-01', country_name: 'Atlantis', country_code: null, active_players: 10 },
      { snapshot_date: '2024-06-01', country_name: 'Atlantis', country_code: null, active_players: 12 },
    ]
    expect(computeCountryGrowthData(snapshots)[0].country_code).toBe('')
  })

  it('guards against divide-by-zero when first snapshot has 0 active players', () => {
    const snapshots = [
      { snapshot_date: '2024-01-01', country_name: 'Narnia', country_code: 'NA', active_players: 0 },
      { snapshot_date: '2024-06-01', country_name: 'Narnia', country_code: 'NA', active_players: 5 },
    ]
    const result = computeCountryGrowthData(snapshots)
    expect(result[0].change).toBe(5)
    expect(result[0].change_pct).toBeNull() // can't compute pct from zero baseline
  })
})
