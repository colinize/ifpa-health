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

// ---------------------------------------------------------------------------
// parseHealthScore
//
// Bridge from a Supabase `health_scores` row (where `band` is `string` and
// `components` is `Json`) to the strongly-typed `HealthScoreResult` the
// narrative engine consumes. The scorer is the only writer of this table, so
// the shape is trusted — but we still narrow explicitly rather than double-
// cast at the call site.
// ---------------------------------------------------------------------------

interface HealthScoreRow {
  composite_score: number
  band: string
  components: unknown
}

const BANDS: readonly Band[] = ['thriving', 'healthy', 'stable', 'concerning', 'critical']

function isBand(value: string): value is Band {
  return (BANDS as readonly string[]).includes(value)
}

export function parseHealthScore(row: HealthScoreRow): HealthScoreResult {
  return {
    composite_score: row.composite_score,
    band: isBand(row.band) ? row.band : 'stable',
    components: row.components as Record<string, ComponentScore>,
    methodology_version: 2,
  }
}
