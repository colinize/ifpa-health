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
  deviation: number
}

export function generateNarrative(result: HealthScoreResult): string {
  const trend = TREND_PHRASES[result.band]

  const pillars: PillarEvidence[] = Object.entries(result.components).map(([key, comp]) => ({
    key,
    score: comp.score,
    rawValue: comp.raw_value,
    deviation: Math.abs(comp.score - 50),
  }))

  pillars.sort((a, b) => b.deviation - a.deviation)

  const scores = pillars.map(p => p.score)
  const spread = Math.max(...scores) - Math.min(...scores)

  let evidence: string

  if (spread < 8) {
    const direction = pillars[0].score >= 55 ? 'up' : pillars[0].score <= 45 ? 'down' : 'flat'
    evidence = `all three indicators are trending ${direction}`
  } else {
    const primary = formatEvidence(pillars[0])
    const secondary = formatSecondary(pillars[1])
    evidence = `${primary}, ${secondary}`
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
      if (rawValue >= 45) return `a strong ${rawValue.toFixed(0)}% player retention rate`
      if (rawValue >= 35) return `a solid ${rawValue.toFixed(0)}% player retention rate`
      return `retention at just ${rawValue.toFixed(0)}%`

    default:
      return `${key} at ${rawValue.toFixed(1)}`
  }
}

// Secondary evidence is introduced with connective phrasing
function formatSecondary(pillar: PillarEvidence): string {
  const { key, rawValue } = pillar

  switch (key) {
    case 'tournaments':
      if (Math.abs(rawValue) < 2) return 'with tournament count roughly flat'
      return rawValue > 0
        ? `with tournament count up ${rawValue.toFixed(1)}% year over year`
        : `though tournament count dropped ${Math.abs(rawValue).toFixed(1)}%`

    case 'players':
      if (Math.abs(rawValue) < 2) return 'with unique player count roughly flat'
      return rawValue > 0
        ? `with unique players up ${rawValue.toFixed(1)}%`
        : `though unique players dropped ${Math.abs(rawValue).toFixed(1)}%`

    case 'retention':
      if (rawValue >= 45) return `with a strong ${rawValue.toFixed(0)}% player retention rate`
      if (rawValue >= 35) return `with a solid ${rawValue.toFixed(0)}% player retention rate`
      return `though retention has dipped to ${rawValue.toFixed(0)}%`

    default:
      return `${key} at ${rawValue.toFixed(1)}`
  }
}
