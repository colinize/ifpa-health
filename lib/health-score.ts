// ---------------------------------------------------------------------------
// IFPA Health Score Algorithm
// Pure computation module — no side effects, no database calls.
// Takes input metrics and returns a composite 0-100 health score built from
// 6 weighted components using linear interpolation between breakpoints.
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export type Band = 'thriving' | 'healthy' | 'stable' | 'concerning' | 'critical'

export interface ComponentScore {
  score: number      // 0-100
  weight: number     // 0-1
  raw_value: number  // the actual metric value fed into interpolation
  label: string      // human-readable description
}

export interface HealthScoreResult {
  composite_score: number
  band: Band
  components: Record<string, ComponentScore>
  sensitivity: Record<string, number>  // % contribution of each component
  methodology_version: number
}

export interface HealthScoreInput {
  tournament_yoy_pct: number    // e.g. 10.5
  entry_yoy_pct: number         // e.g. 9.8
  avg_attendance: number         // e.g. 22.7
  retention_rate: number         // e.g. 42.2
  monthly_momentum: number[]     // last 3 months' event YoY % changes
  us_concentration_pct: number   // e.g. 70.6
  country_count: number          // e.g. 30
  youth_pct: number              // % under 30, e.g. 13.3
}

/** Array of [input_value, output_score] pairs, sorted ascending by input_value */
type Breakpoints = [number, number][]

// ---- Default Constants ----------------------------------------------------

export const DEFAULT_WEIGHTS: Record<string, number> = {
  growth: 0.25,
  attendance: 0.20,
  retention: 0.20,
  momentum: 0.15,
  diversity: 0.10,
  youth: 0.10,
}

export const DEFAULT_BREAKPOINTS: Record<string, Breakpoints> = {
  growth:     [[-20, 0], [0, 50], [20, 100]],
  attendance: [[15, 0], [20, 55], [23, 85], [25, 100]],
  retention:  [[20, 0], [30, 50], [42, 85], [50, 100]],
  momentum:   [[-15, 0], [0, 50], [15, 100]],
  diversity:  [[50, 100], [70, 50], [90, 0]],  // inverted: lower US% = better
  youth:      [[5, 0], [13, 50], [30, 100]],
}

// ---- Component Labels -----------------------------------------------------

const COMPONENT_LABELS: Record<string, (raw: number) => string> = {
  growth:     (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% avg YoY growth`,
  attendance: (v) => `${v.toFixed(1)} avg attendance per event`,
  retention:  (v) => `${v.toFixed(1)}% player retention rate`,
  momentum:   (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% recent monthly trend`,
  diversity:  (v) => `${v.toFixed(1)} diversity index (blended)`,
  youth:      (v) => `${v.toFixed(1)}% of players under 30`,
}

// ---- Core Helpers ---------------------------------------------------------

/**
 * Linear interpolation between breakpoint pairs.
 * Breakpoints must be sorted ascending by input value.
 * Output is clamped to [0, 100].
 */
export function interpolate(value: number, breakpoints: Breakpoints): number {
  if (breakpoints.length === 0) return 0

  // Below the first breakpoint — clamp to its output
  if (value <= breakpoints[0][0]) {
    return clamp(breakpoints[0][1])
  }

  // Above the last breakpoint — clamp to its output
  if (value >= breakpoints[breakpoints.length - 1][0]) {
    return clamp(breakpoints[breakpoints.length - 1][1])
  }

  // Find the surrounding pair and lerp
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i]
    const [x1, y1] = breakpoints[i + 1]

    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0)
      return clamp(y0 + t * (y1 - y0))
    }
  }

  // Fallback (should not be reached with well-formed breakpoints)
  return clamp(breakpoints[breakpoints.length - 1][1])
}

/** Map a composite score (0-100) to a named band. */
export function getBand(score: number): Band {
  if (score >= 80) return 'thriving'
  if (score >= 65) return 'healthy'
  if (score >= 50) return 'stable'
  if (score >= 35) return 'concerning'
  return 'critical'
}

// ---- Main Entry Point -----------------------------------------------------

/**
 * Compute the IFPA composite health score from raw metrics.
 *
 * @param input          Raw metric values
 * @param methodologyVersion  Version tag stored in the result (default 1)
 * @param customWeights  Override default component weights (must sum to ~1)
 * @param customBreakpoints  Override default breakpoints per component
 */
export function computeHealthScore(
  input: HealthScoreInput,
  methodologyVersion: number = 1,
  customWeights?: Record<string, number>,
  customBreakpoints?: Record<string, Breakpoints>,
): HealthScoreResult {
  const weights = { ...DEFAULT_WEIGHTS, ...customWeights }
  const breakpoints = { ...DEFAULT_BREAKPOINTS, ...customBreakpoints }

  // --- 1. Compute each component score ------------------------------------

  // Growth: average of tournament and entry YoY growth
  const growthRaw = (input.tournament_yoy_pct + input.entry_yoy_pct) / 2
  const growthScore = interpolate(growthRaw, breakpoints.growth)

  // Attendance: avg attendance vs baseline
  const attendanceRaw = input.avg_attendance
  const attendanceScore = interpolate(attendanceRaw, breakpoints.attendance)

  // Retention: player retention rate
  const retentionRaw = input.retention_rate
  const retentionScore = interpolate(retentionRaw, breakpoints.retention)

  // Momentum: average of last 3 months' event YoY change
  const momentumRaw = input.monthly_momentum.length > 0
    ? input.monthly_momentum.reduce((sum, v) => sum + v, 0) / input.monthly_momentum.length
    : 0
  const momentumScore = interpolate(momentumRaw, breakpoints.momentum)

  // Diversity: blended US concentration (inverted) + country count
  const usScore = interpolate(input.us_concentration_pct, breakpoints.diversity)
  const countryScore = Math.min(100, input.country_count * 3.33)
  const diversityRaw = 0.7 * usScore + 0.3 * countryScore
  const diversityScore = clamp(diversityRaw)

  // Youth: % of players under 30
  const youthRaw = input.youth_pct
  const youthScore = interpolate(youthRaw, breakpoints.youth)

  // --- 2. Build components map --------------------------------------------

  const componentScores: Record<string, number> = {
    growth: growthScore,
    attendance: attendanceScore,
    retention: retentionScore,
    momentum: momentumScore,
    diversity: diversityScore,
    youth: youthScore,
  }

  const componentRawValues: Record<string, number> = {
    growth: growthRaw,
    attendance: attendanceRaw,
    retention: retentionRaw,
    momentum: momentumRaw,
    diversity: diversityRaw,
    youth: youthRaw,
  }

  const components: Record<string, ComponentScore> = {}
  for (const key of Object.keys(weights)) {
    components[key] = {
      score: round2(componentScores[key]),
      weight: weights[key],
      raw_value: round2(componentRawValues[key]),
      label: COMPONENT_LABELS[key]
        ? COMPONENT_LABELS[key](componentRawValues[key])
        : `${componentRawValues[key]}`,
    }
  }

  // --- 3. Weighted composite ----------------------------------------------

  const compositeScore = Object.keys(weights).reduce(
    (sum, key) => sum + componentScores[key] * weights[key],
    0,
  )

  // --- 4. Sensitivity analysis --------------------------------------------
  // For each component, measure how much the composite changes when that
  // component moves +/-10 points, then normalise to percentages.

  const deltas: Record<string, number> = {}
  for (const key of Object.keys(weights)) {
    const upper = Object.keys(weights).reduce(
      (sum, k) =>
        sum + (k === key ? Math.min(100, componentScores[k] + 10) : componentScores[k]) * weights[k],
      0,
    )
    const lower = Object.keys(weights).reduce(
      (sum, k) =>
        sum + (k === key ? Math.max(0, componentScores[k] - 10) : componentScores[k]) * weights[k],
      0,
    )
    deltas[key] = Math.abs(upper - lower)
  }

  const totalDelta = Object.values(deltas).reduce((sum, d) => sum + d, 0)

  const sensitivity: Record<string, number> = {}
  for (const key of Object.keys(weights)) {
    sensitivity[key] = totalDelta > 0
      ? round2((deltas[key] / totalDelta) * 100)
      : 0
  }

  // --- 5. Assemble result -------------------------------------------------

  return {
    composite_score: round2(clamp(compositeScore)),
    band: getBand(compositeScore),
    components,
    sensitivity,
    methodology_version: methodologyVersion,
  }
}

// ---- Internal Utilities ---------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
