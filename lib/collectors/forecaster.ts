// ---------------------------------------------------------------------------
// Forecaster — runs daily after data collection
// Reads annual and monthly data from Supabase, computes seasonal ratio
// forecast for the current year, and stores the result.
// ---------------------------------------------------------------------------

import {
  computeMonthlyWeights,
  computeForecast,
  computeTrendLine,
  type AnnualData,
  type MonthlyData,
} from '@/lib/forecast'
import { createServiceClient } from '@/lib/supabase'

const REFERENCE_YEARS = [2019, 2022, 2023, 2024, 2025]

export async function runForecaster(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const targetYear = new Date().getFullYear()
  let records = 0

  // ---- 1. Get annual data from annual_snapshots ----------------------------

  const { data: annualRows } = await supabase
    .from('annual_snapshots')
    .select('year, tournaments, player_entries')
    .order('year', { ascending: true })

  const annualData: AnnualData[] = (annualRows ?? []).map((r) => ({
    year: r.year,
    tournaments: r.tournaments,
    entries: r.player_entries,
  }))

  if (annualData.length === 0) {
    console.error('No annual data available for forecasting')
    return { records_affected: 0, details: { error: 'no_annual_data' } }
  }

  // ---- 2. Get monthly data from monthly_event_counts -----------------------

  const { data: monthlyRows } = await supabase
    .from('monthly_event_counts')
    .select('year, month, event_count')
    .order('year', { ascending: true })
    .order('month', { ascending: true })

  const monthlyData: MonthlyData[] = (monthlyRows ?? []).map((r) => ({
    year: r.year,
    month: r.month,
    event_count: r.event_count,
  }))

  // ---- 3. Get YTD totals for the target year --------------------------------

  // Sum monthly event counts for completed months of the target year
  const targetYearMonths = monthlyData.filter((m) => m.year === targetYear)
  const completedMonths = targetYearMonths.length
  const ytdTournaments = targetYearMonths.reduce((sum, m) => sum + m.event_count, 0)

  // For YTD entries: check if there is an annual_snapshots row for the
  // current year with partial data, or fall back to estimating from
  // the latest overall_stats_snapshots.
  let ytdEntries = 0

  const currentYearAnnual = annualData.find((a) => a.year === targetYear)
  if (currentYearAnnual) {
    ytdEntries = currentYearAnnual.entries
  } else {
    // Try overall stats snapshot as a fallback
    const { data: overallRow } = await supabase
      .from('overall_stats_snapshots')
      .select('ytd_player_entries')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (overallRow?.ytd_player_entries) {
      ytdEntries = overallRow.ytd_player_entries
    }
  }

  // ---- 4. Compute monthly weights ------------------------------------------

  const monthlyWeights = computeMonthlyWeights(annualData, monthlyData, REFERENCE_YEARS)

  // ---- 5. Compute forecast -------------------------------------------------

  const forecast = computeForecast(
    ytdTournaments,
    ytdEntries,
    completedMonths,
    monthlyWeights,
    annualData,
    monthlyData,
    targetYear
  )

  // ---- 6. Compute trend line for reference ---------------------------------

  const trendTournaments = computeTrendLine(annualData, 'tournaments', targetYear)
  const trendEntries = computeTrendLine(annualData, 'entries', targetYear)

  // ---- 7. Upsert into forecasts table --------------------------------------

  const { error } = await supabase
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

  if (error) {
    console.error('Failed to upsert forecast:', error.message)
  } else {
    records = 1
  }

  return {
    records_affected: records,
    details: {
      forecast_date: today,
      target_year: targetYear,
      months_of_data: completedMonths,
      ytd_tournaments: ytdTournaments,
      ytd_entries: ytdEntries,
      projected_tournaments: forecast.projected_tournaments,
      projected_entries: forecast.projected_entries,
      trend_tournaments: trendTournaments.projected_value,
      trend_entries: trendEntries.projected_value,
    },
  }
}
