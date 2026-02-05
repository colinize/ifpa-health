// ---------------------------------------------------------------------------
// Daily Collector — runs daily at 8am UTC
// Fetches overall stats and top-50 WPPR rankings from the IFPA API
// and upserts them into Supabase.
// ---------------------------------------------------------------------------

import { ifpaClient } from '@/lib/ifpa-client'
import { createServiceClient } from '@/lib/supabase'

export async function runDailyCollection(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  let records = 0

  // ---- 1. Overall stats ----------------------------------------------------

  const overall = await ifpaClient.getStatsOverall()
  const stats = overall.stats
  const ageDist = stats.age

  const { error: overallError } = await supabase
    .from('overall_stats_snapshots')
    .upsert(
      {
        snapshot_date: today,
        ytd_tournaments: stats.tournament_count_this_year ?? null,
        ytd_player_entries: stats.tournament_player_count ?? null,
        ytd_unique_players: stats.active_player_count ?? null,
        total_active_players: stats.active_player_count ?? null,
        total_players_all_time: stats.overall_player_count ?? null,
        age_under_18_pct: ageDist ? ageDist.age_under_18 ?? null : null,
        age_18_29_pct: ageDist ? ageDist.age_18_to_29 ?? null : null,
        age_30_39_pct: ageDist ? ageDist.age_30_to_39 ?? null : null,
        age_40_49_pct: ageDist ? ageDist.age_40_to_49 ?? null : null,
        age_50_plus_pct: ageDist ? ageDist.age_50_to_99 ?? null : null,
      },
      { onConflict: 'snapshot_date' }
    )

  if (overallError) {
    console.error('Failed to upsert overall stats:', overallError.message)
  } else {
    records += 1
  }

  // ---- 2. WPPR Rankings (top 50) -------------------------------------------

  const rankingsResponse = await ifpaClient.getWPPRRankings(1, 50)
  const rankings = rankingsResponse.rankings ?? []

  const rankingRows = rankings.map((r) => {
    const nameParts = r.name.split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    return {
      snapshot_date: today,
      player_id: parseInt(r.player_id, 10),
      first_name: firstName,
      last_name: lastName,
      wppr_rank: parseInt(r.current_rank, 10),
      wppr_points: parseFloat(r.wppr_points),
      ratings_value: r.rating_value ? parseFloat(r.rating_value) : null,
      active_events: r.event_count ? parseInt(r.event_count, 10) : null,
      country_name: r.country_name ?? null,
      country_code: r.country_code ?? null,
    }
  })

  if (rankingRows.length > 0) {
    const { error: rankingsError } = await supabase
      .from('wppr_rankings')
      .upsert(rankingRows, { onConflict: 'snapshot_date,player_id' })

    if (rankingsError) {
      console.error('Failed to upsert WPPR rankings:', rankingsError.message)
    } else {
      records += rankingRows.length
    }
  }

  return {
    records_affected: records,
    details: {
      overall: !overallError,
      rankings: rankingRows.length,
    },
  }
}
