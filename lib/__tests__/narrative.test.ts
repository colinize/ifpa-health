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
    // Tournaments has highest deviation from 50 (score 82), should be mentioned
    expect(result).toMatch(/tournament/i)
  })

  it('includes em-dash structure', () => {
    const result = generateNarrative(makeResult({ composite_score: 76, band: 'healthy' }))
    expect(result).toContain('\u2014')
  })

  it('ends with a period', () => {
    const result = generateNarrative(makeResult({ composite_score: 76, band: 'healthy' }))
    expect(result.trimEnd()).toMatch(/\.$/)
  })

  it('handles all-similar scores with combined statement', () => {
    const result = generateNarrative(makeResult({
      composite_score: 55,
      band: 'stable',
      components: {
        players: { score: 55, weight: 1/3, raw_value: 1.5, label: '+1.5% unique players YoY' },
        retention: { score: 50, weight: 1/3, raw_value: 35, label: '35.0% player retention rate' },
        tournaments: { score: 55, weight: 1/3, raw_value: 1.5, label: '+1.5% tournaments YoY' },
      },
    }))
    expect(result).toContain('all three indicators')
  })
})
