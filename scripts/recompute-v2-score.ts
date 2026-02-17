// Quick one-time script to recompute the health score using the v2 3-pillar algorithm.
// Run with: npx tsx scripts/recompute-v2-score.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { computeHealthScore, type HealthScoreInput } from '../lib/health-score'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const currentYear = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  // Get latest two complete years
  const { data: rows, error } = await supabase
    .from('annual_snapshots')
    .select('year, unique_players, retention_rate, tournament_yoy_pct')
    .lt('year', currentYear)
    .order('year', { ascending: false })
    .limit(2)

  if (error || !rows?.length) {
    console.error('Failed to fetch annual_snapshots:', error?.message ?? 'no data')
    process.exit(1)
  }

  const latest = rows[0]
  const prior = rows.length > 1 ? rows[1] : null

  let playerYoyPct = 0
  if (prior && prior.unique_players > 0) {
    playerYoyPct = ((latest.unique_players - prior.unique_players) / prior.unique_players) * 100
  }

  const input: HealthScoreInput = {
    player_yoy_pct: playerYoyPct,
    retention_rate: Number(latest.retention_rate) || 0,
    tournament_yoy_pct: Number(latest.tournament_yoy_pct) || 0,
  }

  console.log('Input:', input)
  console.log(`  Latest year: ${latest.year}`)
  console.log(`  Prior year: ${prior?.year ?? 'none'}`)

  const result = computeHealthScore(input)

  console.log('\nResult:')
  console.log(`  Score: ${result.composite_score}`)
  console.log(`  Band: ${result.band}`)
  console.log(`  Components:`, JSON.stringify(result.components, null, 2))
  console.log(`  Methodology: v${result.methodology_version}`)

  // Upsert
  const { error: upsertError } = await supabase
    .from('health_scores')
    .upsert(
      {
        score_date: today,
        composite_score: result.composite_score,
        band: result.band,
        components: result.components,
        methodology_version: result.methodology_version,
      },
      { onConflict: 'score_date' }
    )

  if (upsertError) {
    console.error('Failed to upsert:', upsertError.message)
    process.exit(1)
  }

  console.log(`\nUpserted health score for ${today}`)
}

main()
