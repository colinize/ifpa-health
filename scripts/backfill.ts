// ---------------------------------------------------------------------------
// Backfill Script — one-time seed of all historical data (2016-2026)
// Run with: npx tsx scripts/backfill.ts
//
// IMPORTANT: dotenv must be loaded before any code that reads env vars.
// ---------------------------------------------------------------------------

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { computeHealthScore, type HealthScoreInput } from '../lib/health-score'
import {
  computeMonthlyWeights,
  computeForecast,
  computeTrendLine,
  type AnnualData,
  type MonthlyData,
} from '../lib/forecast'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const IFPA_API_KEY = process.env.IFPA_API_KEY!
const BASE_URL = 'https://api.ifpapinball.com/'

async function fetchIFPA<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(endpoint, BASE_URL)
  url.searchParams.set('api_key', IFPA_API_KEY)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`IFPA API error: ${res.status} for ${endpoint}`)
  return res.json()
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// IFPA API Response Types (matching lib/ifpa-client.ts)
// ---------------------------------------------------------------------------

interface EventsByYearEntry {
  year: string
  tournament_count: string
  player_count: string
  country_count?: string
  stats_rank?: number
}

interface PlayersByYearEntry {
  year: string
  current_year_count: string
  previous_year_count?: string
  previous_2_year_count?: string
  stats_rank?: number
}

interface CountryPlayer {
  country_name: string
  country_code: string
  player_count: string
}

interface WPPRRanking {
  player_id: string
  name: string
  current_rank: string
  wppr_points: string
  rating_value: string
  event_count: string
  country_name: string
  country_code?: string
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== IFPA Health Dashboard Backfill ===')
  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`IFPA API Key: ${IFPA_API_KEY ? '***' + IFPA_API_KEY.slice(-4) : 'MISSING'}`)
  console.log('')

  // Insert collection_runs record
  const { data: run } = await supabase
    .from('collection_runs')
    .insert({ run_type: 'backfill', status: 'running', started_at: new Date().toISOString() })
    .select()
    .single()

  try {
    let totalRecords = 0

    // =====================================================================
    // 1. Annual snapshots from events_by_year + players_by_year
    // =====================================================================
    console.log('[1/7] Fetching annual data...')

    const [eventsResponse, playersResponse] = await Promise.all([
      fetchIFPA<{ stats: EventsByYearEntry[] }>('/stats/events_by_year'),
      fetchIFPA<{ stats: PlayersByYearEntry[] }>('/stats/players_by_year'),
    ])

    const eventsByYear = eventsResponse.stats ?? []
    const playersByYear = playersResponse.stats ?? []

    // Index players by year
    // current_year_count = unique players that year
    // previous_year_count = players who also played the prior year (returning)
    const playersMap = new Map<number, {
      unique_players: number
      returning_players: number | null
      new_players: number | null
    }>()

    for (const p of playersByYear) {
      const year = parseInt(p.year, 10)
      const uniquePlayers = parseInt(p.current_year_count, 10) || 0
      const returningPlayers = p.previous_year_count != null ? parseInt(p.previous_year_count, 10) : null
      const newPlayers = returningPlayers != null ? uniquePlayers - returningPlayers : null
      playersMap.set(year, {
        unique_players: uniquePlayers,
        returning_players: returningPlayers,
        new_players: newPlayers,
      })
    }

    // Sort events ascending for YoY delta computation
    const sortedEvents = eventsByYear
      .map((e) => ({
        year: parseInt(e.year, 10),
        tournaments: parseInt(e.tournament_count, 10) || 0,
        player_entries: parseInt(e.player_count, 10) || 0,
      }))
      .sort((a, b) => a.year - b.year)

    // Index for prior-year lookups
    const eventsMap = new Map<number, { tournaments: number; player_entries: number }>()
    for (const e of sortedEvents) {
      eventsMap.set(e.year, { tournaments: e.tournaments, player_entries: e.player_entries })
    }

    // Build annual snapshot rows (filter to 2016+)
    const annualRows = sortedEvents
      .filter((e) => e.year >= 2016)
      .map((e) => {
        const players = playersMap.get(e.year)
        const prior = eventsMap.get(e.year - 1)

        let tournament_yoy_pct: number | null = null
        let entry_yoy_pct: number | null = null

        if (prior && prior.tournaments > 0) {
          tournament_yoy_pct = parseFloat(
            (((e.tournaments - prior.tournaments) / prior.tournaments) * 100).toFixed(1)
          )
        }
        if (prior && prior.player_entries > 0) {
          entry_yoy_pct = parseFloat(
            (((e.player_entries - prior.player_entries) / prior.player_entries) * 100).toFixed(1)
          )
        }

        return {
          year: e.year,
          tournaments: e.tournaments,
          player_entries: e.player_entries,
          unique_players: players?.unique_players ?? 0,
          returning_players: players?.returning_players ?? null,
          new_players: players?.new_players ?? null,
          countries: null as number | null,
          tournament_yoy_pct,
          entry_yoy_pct,
        }
      })

    if (annualRows.length > 0) {
      const { error } = await supabase
        .from('annual_snapshots')
        .upsert(annualRows, { onConflict: 'year' })

      if (error) {
        console.error('  Failed to upsert annual snapshots:', error.message)
      } else {
        totalRecords += annualRows.length
        console.log(`  Upserted ${annualRows.length} annual snapshots (${annualRows[0].year}-${annualRows[annualRows.length - 1].year})`)
      }
    }

    // =====================================================================
    // 2. Monthly event counts for 2019-2026 (reference years + current)
    // =====================================================================
    console.log('[2/7] Fetching monthly event counts...')

    const monthlyYears = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
    const monthlyCountMap = new Map<string, number>()

    for (const year of monthlyYears) {
      const maxMonth = year === 2026 ? new Date().getMonth() + 1 : 12

      for (let month = 1; month <= maxMonth; month++) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        try {
          const result = await fetchIFPA<{ total_results: string }>(
            '/tournament/search',
            { start_date: startDate, end_date: endDate }
          )
          const eventCount = parseInt(result.total_results, 10) || 0
          monthlyCountMap.set(`${year}-${month}`, eventCount)
        } catch (err) {
          console.error(`  Failed to fetch ${year}-${month}:`, err)
        }

        await delay(100) // rate limit
      }

      console.log(`  Fetched ${year}...`)
    }

    // Build monthly upsert rows with YoY
    const monthlyRows: Array<{
      year: number
      month: number
      event_count: number
      prior_year_event_count: number | null
      yoy_change_pct: number | null
    }> = []

    for (const [key, eventCount] of monthlyCountMap) {
      const [yearStr, monthStr] = key.split('-')
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)

      const priorYearCount = monthlyCountMap.get(`${year - 1}-${month}`) ?? null

      let yoy_change_pct: number | null = null
      if (priorYearCount != null && priorYearCount > 0) {
        yoy_change_pct = parseFloat(
          (((eventCount - priorYearCount) / priorYearCount) * 100).toFixed(1)
        )
      }

      monthlyRows.push({
        year,
        month,
        event_count: eventCount,
        prior_year_event_count: priorYearCount,
        yoy_change_pct,
      })
    }

    if (monthlyRows.length > 0) {
      const { error } = await supabase
        .from('monthly_event_counts')
        .upsert(monthlyRows, { onConflict: 'year,month' })

      if (error) {
        console.error('  Failed to upsert monthly event counts:', error.message)
      } else {
        totalRecords += monthlyRows.length
        console.log(`  Upserted ${monthlyRows.length} monthly event counts`)
      }
    }

    // =====================================================================
    // 3. Overall stats snapshot
    // =====================================================================
    console.log('[3/7] Fetching overall stats...')

    const overallResponse = await fetchIFPA<{
      stats: {
        overall_player_count: number
        active_player_count: number
        tournament_count: number
        tournament_count_this_year: number
        tournament_player_count: number
        tournament_player_count_average: number
        age: {
          age_under_18: number
          age_18_to_29: number
          age_30_to_39: number
          age_40_to_49: number
          age_50_to_99: number
        }
      }
    }>('/stats/overall')

    const overallStats = overallResponse.stats
    const ageDist = overallStats.age
    const today = new Date().toISOString().split('T')[0]

    const { error: overallError } = await supabase
      .from('overall_stats_snapshots')
      .upsert(
        {
          snapshot_date: today,
          ytd_tournaments: overallStats.tournament_count_this_year ?? null,
          ytd_player_entries: overallStats.tournament_player_count ?? null,
          ytd_unique_players: null,
          total_active_players: overallStats.active_player_count ?? null,
          total_players_all_time: overallStats.overall_player_count ?? null,
          age_under_18_pct: ageDist?.age_under_18 ?? null,
          age_18_29_pct: ageDist?.age_18_to_29 ?? null,
          age_30_39_pct: ageDist?.age_30_to_39 ?? null,
          age_40_49_pct: ageDist?.age_40_to_49 ?? null,
          age_50_plus_pct: ageDist?.age_50_to_99 ?? null,
        },
        { onConflict: 'snapshot_date' }
      )

    if (overallError) {
      console.error('  Failed to upsert overall stats:', overallError.message)
    } else {
      totalRecords += 1
      console.log('  Upserted overall stats snapshot')
    }

    // =====================================================================
    // 4. Country players
    // =====================================================================
    console.log('[4/7] Fetching country data...')

    const countryResponse = await fetchIFPA<{ stats: CountryPlayer[] }>(
      '/stats/country_players'
    )
    const countries = countryResponse.stats ?? []

    // Compute total players
    const totalPlayers = countries.reduce(
      (sum, c) => sum + (parseInt(c.player_count, 10) || 0),
      0
    )

    const countryRows = countries.map((c) => {
      const activePlayers = parseInt(c.player_count, 10) || 0
      const pctOfTotal =
        totalPlayers > 0
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

    if (countryRows.length > 0) {
      const { error } = await supabase
        .from('country_snapshots')
        .upsert(countryRows, { onConflict: 'snapshot_date,country_name' })

      if (error) {
        console.error('  Failed to upsert country snapshots:', error.message)
      } else {
        totalRecords += countryRows.length
        console.log(`  Upserted ${countryRows.length} country snapshots`)
      }
    }

    // =====================================================================
    // 5. WPPR rankings (top 50)
    // =====================================================================
    console.log('[5/7] Fetching WPPR rankings...')

    const rankingsResponse = await fetchIFPA<{ rankings: WPPRRanking[] }>(
      '/rankings/wppr',
      { start_pos: '1', count: '50' }
    )
    const rankings = rankingsResponse.rankings ?? []

    const rankingRows = rankings.map((r) => {
      const nameParts = (r.name || '').split(' ')
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
      const { error } = await supabase
        .from('wppr_rankings')
        .upsert(rankingRows, { onConflict: 'snapshot_date,player_id' })

      if (error) {
        console.error('  Failed to upsert WPPR rankings:', error.message)
      } else {
        totalRecords += rankingRows.length
        console.log(`  Upserted ${rankingRows.length} WPPR rankings`)
      }
    }

    // =====================================================================
    // 6. Seed observations (ground truth for calibration)
    // =====================================================================
    console.log('[6/7] Seeding observations...')

    const observations = [
      { period_start: '2017-01-01', period_end: '2017-12-31', observed_health: 'thriving', observed_score: 90, notes: '27% tournament growth, 31% entry growth, boom era' },
      { period_start: '2019-01-01', period_end: '2019-12-31', observed_health: 'thriving', observed_score: 88, notes: 'Peak pre-COVID, 30% growth, 24k unique players' },
      { period_start: '2020-01-01', period_end: '2020-12-31', observed_health: 'critical', observed_score: 10, notes: 'COVID, -78% collapse across all metrics' },
      { period_start: '2021-01-01', period_end: '2021-12-31', observed_health: 'concerning', observed_score: 40, notes: 'Recovery underway but still below 2019 levels' },
      { period_start: '2022-01-01', period_end: '2022-12-31', observed_health: 'thriving', observed_score: 85, notes: 'Full recovery, exceeded 2019 in tournament count' },
      { period_start: '2023-01-01', period_end: '2023-12-31', observed_health: 'healthy', observed_score: 78, notes: 'Strong growth continuing, retention trough from new player influx' },
      { period_start: '2024-01-01', period_end: '2024-12-31', observed_health: 'healthy', observed_score: 75, notes: 'Growth decelerating but still solid double digits' },
      { period_start: '2025-01-01', period_end: '2025-10-31', observed_health: 'healthy', observed_score: 72, notes: 'Growth slowing further, retention improving to 42%' },
      { period_start: '2025-11-01', period_end: '2025-12-31', observed_health: 'stable', observed_score: 55, notes: 'Event growth stalled, first declines since COVID' },
      { period_start: '2026-01-01', period_end: '2026-01-31', observed_health: 'stable', observed_score: 50, notes: 'Event count flat YoY, entry decline likely significant' },
    ]

    let obsInserted = 0
    for (const obs of observations) {
      // Check if observation already exists for this period (no unique constraint)
      const { data: existing } = await supabase
        .from('observations')
        .select('id')
        .eq('period_start', obs.period_start)
        .eq('period_end', obs.period_end)
        .limit(1)

      if (existing && existing.length > 0) {
        // Already exists, skip
        continue
      }

      const { error } = await supabase
        .from('observations')
        .insert(obs)

      if (error) {
        console.error(`  Failed to insert observation ${obs.period_start}:`, error.message)
      } else {
        obsInserted++
        totalRecords++
      }
    }

    console.log(`  Inserted ${obsInserted} observations (${observations.length - obsInserted} already existed)`)

    // =====================================================================
    // 7. Compute initial health score + forecast
    // =====================================================================
    console.log('[7/7] Computing initial health score and forecast...')

    // Re-read the last COMPLETE year (not current partial year) for the health score
    const currentYear = new Date().getFullYear()
    const { data: latestAnnual } = await supabase
      .from('annual_snapshots')
      .select('*')
      .lt('year', currentYear)
      .order('year', { ascending: false })
      .limit(1)
      .single()

    if (latestAnnual) {
      // Get last 3 months of momentum
      const { data: recentMonths } = await supabase
        .from('monthly_event_counts')
        .select('yoy_change_pct')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(3)

      const momentum = (recentMonths ?? [])
        .filter((m) => m.yoy_change_pct != null)
        .map((m) => Number(m.yoy_change_pct))

      // US concentration from country data
      const usRow = countryRows.find(
        (c) => c.country_name === 'United States' || c.country_code === 'US'
      )
      const usConcentrationPct = usRow ? usRow.pct_of_total : 70
      const countryCount = countryRows.filter((c) => c.active_players > 0).length

      // Youth from overall stats
      const youthPct =
        (ageDist?.age_under_18 ?? 0) +
        (ageDist?.age_18_to_29 ?? 0)

      const healthInput: HealthScoreInput = {
        tournament_yoy_pct: Number(latestAnnual.tournament_yoy_pct) || 0,
        entry_yoy_pct: Number(latestAnnual.entry_yoy_pct) || 0,
        avg_attendance: Number(latestAnnual.avg_attendance) || 20,
        retention_rate: Number(latestAnnual.retention_rate) || 35,
        monthly_momentum: momentum,
        us_concentration_pct: usConcentrationPct,
        country_count: countryCount || 30,
        youth_pct: youthPct || 13,
      }

      const healthResult = computeHealthScore(healthInput, 1)

      const { error: healthError } = await supabase
        .from('health_scores')
        .upsert(
          {
            score_date: today,
            composite_score: healthResult.composite_score,
            band: healthResult.band,
            components: healthResult.components,
            sensitivity: healthResult.sensitivity,
            methodology_version: healthResult.methodology_version,
          },
          { onConflict: 'score_date' }
        )

      if (healthError) {
        console.error('  Failed to upsert health score:', healthError.message)
      } else {
        totalRecords += 1
        console.log(`  Health score: ${healthResult.composite_score} (${healthResult.band})`)
      }

      // Also compute shadow score for version 1
      const { error: shadowError } = await supabase
        .from('shadow_scores')
        .upsert(
          {
            score_date: today,
            methodology_version: 1,
            composite_score: healthResult.composite_score,
            component_scores: healthResult.components,
          },
          { onConflict: 'score_date,methodology_version' }
        )

      if (shadowError) {
        console.error('  Failed to upsert shadow score:', shadowError.message)
      } else {
        totalRecords += 1
      }

      // Compute forecast
      const annualDataForForecast: AnnualData[] = annualRows.map((r) => ({
        year: r.year,
        tournaments: r.tournaments,
        entries: r.player_entries,
      }))

      const monthlyDataForForecast: MonthlyData[] = monthlyRows.map((r) => ({
        year: r.year,
        month: r.month,
        event_count: r.event_count,
      }))

      const targetYear = new Date().getFullYear()
      const referenceYears = [2019, 2022, 2023, 2024, 2025]

      const weights = computeMonthlyWeights(
        annualDataForForecast,
        monthlyDataForForecast,
        referenceYears
      )

      // YTD totals for current year
      const targetYearMonths = monthlyDataForForecast.filter((m) => m.year === targetYear)
      const completedMonths = targetYearMonths.length
      const ytdTournaments = targetYearMonths.reduce((sum, m) => sum + m.event_count, 0)

      // YTD entries from annual snapshot or overall stats
      const currentYearAnnual = annualDataForForecast.find((a) => a.year === targetYear)
      let ytdEntries = currentYearAnnual?.entries ?? 0
      if (ytdEntries === 0 && overallStats.tournament_player_count) {
        ytdEntries = overallStats.tournament_player_count
      }

      const forecast = computeForecast(
        ytdTournaments,
        ytdEntries,
        completedMonths,
        weights,
        annualDataForForecast,
        monthlyDataForForecast,
        targetYear
      )

      const trendTournaments = computeTrendLine(annualDataForForecast, 'tournaments', targetYear)
      const trendEntries = computeTrendLine(annualDataForForecast, 'entries', targetYear)

      const { error: forecastError } = await supabase
        .from('forecasts')
        .upsert(
          {
            forecast_date: today,
            target_year: targetYear,
            months_of_data: forecast.months_of_data,
            projected_tournaments: forecast.projected_tournaments,
            projected_entries: forecast.projected_entries,
            ci_68_low_tournaments: forecast.ci_68_low_tournaments,
            ci_68_high_tournaments: forecast.ci_68_high_tournaments,
            ci_95_low_tournaments: forecast.ci_95_low_tournaments,
            ci_95_high_tournaments: forecast.ci_95_high_tournaments,
            ci_68_low_entries: forecast.ci_68_low_entries,
            ci_68_high_entries: forecast.ci_68_high_entries,
            ci_95_low_entries: forecast.ci_95_low_entries,
            ci_95_high_entries: forecast.ci_95_high_entries,
            method: forecast.method,
            trend_reference: {
              tournaments: trendTournaments,
              entries: trendEntries,
            },
          },
          { onConflict: 'forecast_date,target_year' }
        )

      if (forecastError) {
        console.error('  Failed to upsert forecast:', forecastError.message)
      } else {
        totalRecords += 1
        console.log(`  Forecast: ${forecast.projected_tournaments} tournaments projected for ${targetYear} (based on ${completedMonths} months)`)
      }
    } else {
      console.log('  No annual data available, skipping health score and forecast')
    }

    // =====================================================================
    // Done
    // =====================================================================

    await supabase
      .from('collection_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        records_affected: totalRecords,
        details: {
          annual_snapshots: annualRows.length,
          monthly_event_counts: monthlyRows.length,
          overall_stats: 1,
          country_snapshots: countryRows.length,
          wppr_rankings: rankingRows.length,
          observations: obsInserted,
        },
      })
      .eq('id', run!.id)

    console.log('')
    console.log(`=== Backfill complete! ${totalRecords} records affected. ===`)
  } catch (error) {
    console.error('Backfill failed:', error)

    await supabase
      .from('collection_runs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: String(error),
      })
      .eq('id', run!.id)

    process.exit(1)
  }
}

main()
