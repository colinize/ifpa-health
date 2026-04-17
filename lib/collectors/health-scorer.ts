// ---------------------------------------------------------------------------
// Health Scorer — runs daily after data collection
// Reads latest complete year from annual_snapshots, computes the 3-pillar
// health score, and stores the result.
// ---------------------------------------------------------------------------

import { computeHealthScore, type HealthScoreInput } from '@/lib/health-score'
import { createServiceClient } from '@/lib/supabase'
import { toNum } from '@/lib/utils'
import type { Json } from '@/lib/database.types'

export async function runHealthScorer(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()

  // ---- 1. Get latest two complete years from annual_snapshots ----------------
  // We need the current and prior year to compute player YoY % change,
  // since unique_players YoY is not stored as a generated column.

  const { data: annualRows, error: annualError } = await supabase
    .from('annual_snapshots')
    .select('year, unique_players, retention_rate, tournament_yoy_pct')
    .lt('year', currentYear)
    .order('year', { ascending: false })
    .limit(2)

  if (annualError) {
    throw new Error(`Failed to fetch annual_snapshots: ${annualError.message}`)
  }

  if (!annualRows || annualRows.length === 0) {
    throw new Error('No annual_snapshots data found for completed years')
  }

  const latestYear = annualRows[0]
  const priorYear = annualRows.length > 1 ? annualRows[1] : null

  // ---- 2. Build HealthScoreInput --------------------------------------------

  // Compute player YoY % change from unique_players
  let playerYoyPct = 0
  if (priorYear && priorYear.unique_players > 0) {
    playerYoyPct =
      ((latestYear.unique_players - priorYear.unique_players) /
        priorYear.unique_players) *
      100
  }

  const input: HealthScoreInput = {
    player_yoy_pct: playerYoyPct,
    retention_rate: toNum(latestYear.retention_rate),
    tournament_yoy_pct: toNum(latestYear.tournament_yoy_pct),
  }

  // ---- 3. Compute health score (methodology v2) -----------------------------

  const result = computeHealthScore(input)

  // ---- 4. Upsert into health_scores -----------------------------------------

  let records = 0

  const { error: scoreError } = await supabase
    .from('health_scores')
    .upsert(
      {
        score_date: today,
        composite_score: result.composite_score,
        band: result.band,
        // `components` is typed `Json` by generated types; `ComponentScore`
        // lacks the index signature Json demands. Content is serializable.
        components: result.components as unknown as Json,
        methodology_version: result.methodology_version,
      },
      { onConflict: 'score_date' }
    )

  if (scoreError) {
    console.error('Failed to upsert health score:', scoreError.message)
  } else {
    records += 1
  }

  // ---- 5. Return results ----------------------------------------------------

  return {
    records_affected: records,
    details: {
      score_date: today,
      data_year: latestYear.year,
      composite_score: result.composite_score,
      band: result.band,
      methodology_version: result.methodology_version,
      input_summary: {
        player_yoy_pct: Math.round(input.player_yoy_pct * 100) / 100,
        retention_rate: input.retention_rate,
        tournament_yoy_pct: input.tournament_yoy_pct,
      },
    },
  }
}
