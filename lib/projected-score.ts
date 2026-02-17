// lib/projected-score.ts
// Projected Health Score with Confidence Interval Bounds
//
// Takes a ForecastResult (projected annual values + CI bounds) plus prior-year
// actuals, and computes a forward-looking health score by running the
// pessimistic, point-estimate, and optimistic inputs through computeHealthScore.
//
// Pure computation module — no database calls, no side effects.

import { computeHealthScore, type Band } from './health-score'
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
  // Return null if insufficient data
  if (forecast.months_of_data < 2) return null
  if (forecast.projected_players === 0) return null

  // Point estimate: compute YoY% and retention from projected values
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

  // Pessimistic (CI low): use low bounds for all
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

  // Optimistic (CI high): use high bounds for all
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
