import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 1. Get all observations
  const { data: observations } = await supabase
    .from('observations')
    .select('*')

  if (!observations || observations.length < 3) {
    return NextResponse.json(
      {
        error: 'Need at least 3 observations to calibrate',
        observation_count: observations?.length ?? 0,
      },
      { status: 400 }
    )
  }

  // 2. Get all methodology versions
  const { data: versions } = await supabase
    .from('methodology_versions')
    .select('*')
    .order('version_number')

  // 3. Get shadow scores for comparison
  const { data: shadowScores } = await supabase
    .from('shadow_scores')
    .select('*')

  // 4. For each version, compute MAE against observations
  // Match shadow scores to observations by date range overlap
  const results = (versions || []).map((version) => {
    const versionScores = (shadowScores || []).filter(
      (s) => s.methodology_version === version.version_number
    )

    let totalError = 0
    let matchCount = 0

    for (const obs of observations) {
      // Find shadow scores within the observation period
      const matchingScores = versionScores.filter((s) => {
        const scoreDate = new Date(s.score_date)
        return (
          scoreDate >= new Date(obs.period_start) &&
          scoreDate <= new Date(obs.period_end)
        )
      })

      if (matchingScores.length > 0) {
        const avgScore =
          matchingScores.reduce((sum, s) => sum + Number(s.composite_score), 0) /
          matchingScores.length
        totalError += Math.abs(avgScore - Number(obs.observed_score))
        matchCount++
      }
    }

    const mae = matchCount > 0 ? totalError / matchCount : null

    return {
      version_number: version.version_number,
      description: version.description,
      is_active: version.is_active,
      mae,
      observations_matched: matchCount,
      total_shadow_scores: versionScores.length,
    }
  })

  // 5. Update backtest_mae in methodology_versions
  for (const result of results) {
    if (result.mae !== null) {
      await supabase
        .from('methodology_versions')
        .update({ backtest_mae: result.mae })
        .eq('version_number', result.version_number)
    }
  }

  // 6. Find best version
  const rankedVersions = results
    .filter((r) => r.mae !== null)
    .sort((a, b) => a.mae! - b.mae!)

  return NextResponse.json({
    results,
    recommendation:
      rankedVersions.length > 0
        ? `Version ${rankedVersions[0].version_number} has lowest MAE (${rankedVersions[0].mae?.toFixed(1)})`
        : 'Insufficient shadow score data for comparison',
    observation_count: observations.length,
  })
}
