// ---------------------------------------------------------------------------
// Annual Collector — runs weekly (Monday 9am UTC)
// Fetches events-by-year and players-by-year from the IFPA API, joins on
// year, computes YoY deltas, and upserts into annual_snapshots.
// ---------------------------------------------------------------------------

import { ifpaClient } from '@/lib/ifpa-client'
import { createServiceClient } from '@/lib/supabase'

export async function runAnnualCollection(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  let records = 0

  const [eventsData, playersData] = await Promise.all([
    ifpaClient.getEventsByYear(),
    ifpaClient.getPlayersByYear(),
  ])

  // Index players-by-year by year for quick lookup
  const playersByYear = new Map<number, {
    unique_players: number
    returning_players: number | null
    new_players: number | null
  }>()

  for (const p of playersData.stats) {
    const year = parseInt(p.year, 10)
    const currentYearCount = parseInt(p.current_year_count, 10)
    const previousYearCount = parseInt(p.previous_year_count, 10)
    playersByYear.set(year, {
      unique_players: currentYearCount,
      returning_players: !isNaN(previousYearCount) ? previousYearCount : null,
      new_players: !isNaN(currentYearCount) && !isNaN(previousYearCount)
        ? currentYearCount - previousYearCount
        : null,
    })
  }

  // Sort events by year ascending so we can look back for YoY deltas
  const sortedEvents = [...eventsData.stats]
    .map((e) => ({
      year: parseInt(e.year, 10),
      tournaments: parseInt(e.tournament_count, 10),
      player_entries: parseInt(e.player_count, 10),
    }))
    .sort((a, b) => a.year - b.year)

  // Index for prior-year lookups
  const eventsByYear = new Map<number, { tournaments: number; player_entries: number }>()
  for (const e of sortedEvents) {
    eventsByYear.set(e.year, { tournaments: e.tournaments, player_entries: e.player_entries })
  }

  // Build rows
  const rows = sortedEvents.map((e) => {
    const players = playersByYear.get(e.year)
    const priorEvents = eventsByYear.get(e.year - 1)

    // YoY calculations
    let tournament_yoy_pct: number | null = null
    let entry_yoy_pct: number | null = null

    if (priorEvents && priorEvents.tournaments > 0) {
      tournament_yoy_pct = parseFloat(
        (((e.tournaments - priorEvents.tournaments) / priorEvents.tournaments) * 100).toFixed(1)
      )
    }
    if (priorEvents && priorEvents.player_entries > 0) {
      entry_yoy_pct = parseFloat(
        (((e.player_entries - priorEvents.player_entries) / priorEvents.player_entries) * 100).toFixed(1)
      )
    }

    return {
      year: e.year,
      tournaments: e.tournaments,
      player_entries: e.player_entries,
      unique_players: players?.unique_players ?? 0,
      returning_players: players?.returning_players ?? null,
      new_players: players?.new_players ?? null,
      countries: null, // not available from these endpoints
      tournament_yoy_pct,
      entry_yoy_pct,
      // avg_attendance and retention_rate are generated columns — do NOT insert
    }
  })

  if (rows.length > 0) {
    const { error } = await supabase
      .from('annual_snapshots')
      .upsert(rows, { onConflict: 'year' })

    if (error) {
      console.error('Failed to upsert annual snapshots:', error.message)
    } else {
      records = rows.length
    }
  }

  return {
    records_affected: records,
    details: {
      years_processed: rows.length,
      year_range: rows.length > 0
        ? `${rows[0].year}-${rows[rows.length - 1].year}`
        : 'none',
    },
  }
}
