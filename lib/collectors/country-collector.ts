// ---------------------------------------------------------------------------
// Country Collector — runs weekly (Monday 9am UTC)
// Fetches country player counts from the IFPA API, computes each country's
// percentage of the total, and upserts into country_snapshots.
// ---------------------------------------------------------------------------

import { ifpaClient } from '@/lib/ifpa-client'
import { createServiceClient } from '@/lib/supabase'

export async function runCountryCollection(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const data = await ifpaClient.getCountryPlayers()
  const countries = data.stats ?? []

  // Compute total players across all countries
  const totalPlayers = countries.reduce(
    (sum, c) => sum + (parseInt(c.player_count, 10) || 0),
    0
  )

  const rows = countries.map((c) => {
    const activePlayers = parseInt(c.player_count, 10) || 0
    const pctOfTotal = totalPlayers > 0
      ? parseFloat(((activePlayers / totalPlayers) * 100).toFixed(2))
      : 0

    return {
      snapshot_date: today,
      country_name: c.country_name,
      country_code: c.country_code ?? null,
      active_players: activePlayers,
      pct_of_total: pctOfTotal,
    }
  })

  let records = 0

  if (rows.length > 0) {
    const { error } = await supabase
      .from('country_snapshots')
      .upsert(rows, { onConflict: 'snapshot_date,country_name' })

    if (error) {
      console.error('Failed to upsert country snapshots:', error.message)
    } else {
      records = rows.length
    }
  }

  return {
    records_affected: records,
    details: {
      countries_count: rows.length,
      total_players: totalPlayers,
    },
  }
}
