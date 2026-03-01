import { createPublicClient } from '@/lib/supabase'
import { generateNarrative } from '@/lib/narrative'
import type { HealthScoreResult } from '@/lib/health-score'
import { computeProjectedScore } from '@/lib/projected-score'
import type { ForecastResult } from '@/lib/forecast'
import { HealthScoreGauge } from '@/components/health-score-gauge'
import { ProjectedGauge } from '@/components/projected-gauge'
import { NarrativeDisplay } from '@/components/narrative-display'
import { AnswerCard } from '@/components/answer-card'
import { DetailDrawer } from '@/components/detail-drawer'
import { DataFreshness } from '@/components/data-freshness'
import { ThemeToggle } from '@/components/theme-toggle'

export const revalidate = 3600

export default async function DashboardPage() {
  const supabase = createPublicClient()

  const [
    { data: healthScore },
    { data: annualSnapshots },
    { data: monthlyEvents },
    { data: forecast },
    { data: latestRun },
  ] = await Promise.all([
    supabase.from('health_scores').select('*').order('score_date', { ascending: false }).limit(1).single(),
    supabase.from('annual_snapshots').select('*').order('year', { ascending: true }),
    supabase.from('monthly_event_counts').select('*').order('year', { ascending: true }).order('month', { ascending: true }),
    supabase.from('forecasts').select('*').order('forecast_date', { ascending: false }).limit(1).single(),
    supabase.from('collection_runs').select('*').order('started_at', { ascending: false }).limit(1).single(),
  ])

  // Use the last COMPLETE year for metric cards (not the current incomplete year)
  const currentYear = new Date().getFullYear()
  const completeYears = annualSnapshots?.filter(s => s.year < currentYear) ?? []
  const latestYear = completeYears[completeYears.length - 1]
  const priorYear = completeYears[completeYears.length - 2]

  // Current (incomplete) year actuals for the YoY table projected row
  const currentYearRow = annualSnapshots?.find(s => s.year === currentYear)

  // Generate narrative
  const narrative = healthScore
    ? generateNarrative(healthScore as unknown as HealthScoreResult)
    : 'No health score data available.'

  // Projected 2026 score
  // If 2026 player data isn't available from the IFPA API yet, hold at 2025 actuals
  // (0% player growth, same retention rate). CI then only reflects tournament uncertainty.
  const hasPlayerProjections = (forecast?.projected_unique_players ?? 0) > 0
  const fallbackPlayers = latestYear?.unique_players ?? 0
  const fallbackReturning = latestYear?.returning_players ?? 0

  const projectedScoreResult = forecast ? computeProjectedScore(
    {
      target_year: forecast.target_year,
      months_of_data: forecast.months_of_data,
      projected_tournaments: Math.round(parseFloat(String(forecast.projected_tournaments ?? 0))),
      projected_entries: Math.round(parseFloat(String(forecast.projected_entries ?? 0))),
      projected_players: hasPlayerProjections ? (forecast.projected_unique_players ?? 0) : fallbackPlayers,
      projected_returning: hasPlayerProjections ? (forecast.projected_returning_players ?? 0) : fallbackReturning,
      ci_68_low_tournaments: Math.round(parseFloat(String(forecast.ci_68_low_tournaments ?? 0))),
      ci_68_high_tournaments: Math.round(parseFloat(String(forecast.ci_68_high_tournaments ?? 0))),
      ci_95_low_tournaments: Math.round(parseFloat(String(forecast.ci_95_low_tournaments ?? 0))),
      ci_95_high_tournaments: Math.round(parseFloat(String(forecast.ci_95_high_tournaments ?? 0))),
      ci_68_low_entries: Math.round(parseFloat(String(forecast.ci_68_low_entries ?? 0))),
      ci_68_high_entries: Math.round(parseFloat(String(forecast.ci_68_high_entries ?? 0))),
      ci_95_low_entries: Math.round(parseFloat(String(forecast.ci_95_low_entries ?? 0))),
      ci_95_high_entries: Math.round(parseFloat(String(forecast.ci_95_high_entries ?? 0))),
      ci_68_low_players: hasPlayerProjections ? (forecast.ci_68_low_players ?? 0) : fallbackPlayers,
      ci_68_high_players: hasPlayerProjections ? (forecast.ci_68_high_players ?? 0) : fallbackPlayers,
      ci_68_low_returning: hasPlayerProjections ? (forecast.ci_68_low_returning ?? 0) : fallbackReturning,
      ci_68_high_returning: hasPlayerProjections ? (forecast.ci_68_high_returning ?? 0) : fallbackReturning,
      method: 'seasonal_ratio',
      trend_reference: null,
    } as ForecastResult,
    latestYear?.unique_players ?? 0,
    latestYear?.tournaments ?? 0,
  ) : null

  // Answer card 1: Players
  const playerYoyPct = latestYear && priorYear && priorYear.unique_players > 0
    ? ((latestYear.unique_players - priorYear.unique_players) / priorYear.unique_players) * 100
    : null

  // Answer card 2: Retention
  const retentionRate = latestYear?.retention_rate ? parseFloat(String(latestYear.retention_rate)) : null
  const priorRetention = priorYear?.retention_rate ? parseFloat(String(priorYear.retention_rate)) : null
  const retentionDelta = retentionRate != null && priorRetention != null ? retentionRate - priorRetention : null

  // Answer card 3: Tournaments
  const tournamentYoyPct = latestYear?.tournament_yoy_pct ? parseFloat(String(latestYear.tournament_yoy_pct)) : null

  // Sparkline data arrays (complete years only)
  const playerSparkline = completeYears.map(s => s.unique_players ?? 0)
  const retentionSparkline = completeYears.map(s => parseFloat(String(s.retention_rate ?? 0)))
  const tournamentSparkline = completeYears.map(s => s.tournaments ?? 0)

  // Trend direction helper
  function getTrend(value: number | null): { direction: 'up' | 'down' | 'flat'; label: string } {
    if (value == null) return { direction: 'flat', label: 'No data' }
    if (value > 2) return { direction: 'up', label: `+${value.toFixed(1)}% vs ${priorYear?.year ?? ''}` }
    if (value < -2) return { direction: 'down', label: `${value.toFixed(1)}% vs ${priorYear?.year ?? ''}` }
    return { direction: 'flat', label: `Flat vs ${priorYear?.year ?? ''}` }
  }

  // Retention trend is in percentage points, not percent
  function getRetentionTrend(delta: number | null): { direction: 'up' | 'down' | 'flat'; label: string } {
    if (delta == null) return { direction: 'flat', label: 'No data' }
    if (delta > 1) return { direction: 'up', label: `+${delta.toFixed(0)} pts vs ${priorYear?.year ?? ''}` }
    if (delta < -1) return { direction: 'down', label: `${delta.toFixed(0)} pts vs ${priorYear?.year ?? ''}` }
    return { direction: 'flat', label: `Flat vs ${priorYear?.year ?? ''}` }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* HEADER: minimal, top bar */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap">IFPA Health</h1>
          <DataFreshness lastRun={latestRun} />
        </div>
        <ThemeToggle />
      </header>

      {/* MAIN: centered content, fits viewport */}
      <main className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full px-4 md:px-6 pb-8 gap-6 md:gap-8">

        {/* HEALTH SCORE + NARRATIVE */}
        <section className="flex flex-col items-center gap-4">
          <HealthScoreGauge score={healthScore?.composite_score ?? 0} band={healthScore?.band ?? 'stable'} />
          {projectedScoreResult && (
            <ProjectedGauge
              score={projectedScoreResult.projected_score}
              band={projectedScoreResult.projected_band}
              ciLow={projectedScoreResult.ci_low_score}
              ciHigh={projectedScoreResult.ci_high_score}
              year={forecast!.target_year}
            />
          )}
          <NarrativeDisplay text={narrative} />
        </section>

        {/* THREE ANSWER CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {latestYear && (
            <p className="col-span-full text-xs text-muted-foreground text-center -mb-2">
              {latestYear.year} full-year totals
            </p>
          )}
          <AnswerCard
            question="Are more people playing?"
            value={latestYear?.unique_players?.toLocaleString() ?? '\u2014'}
            trend={getTrend(playerYoyPct)}
            sparklineData={playerSparkline}
          />
          <AnswerCard
            question="Are they coming back?"
            value={retentionRate != null ? `${retentionRate.toFixed(1)}%` : '\u2014'}
            trend={getRetentionTrend(retentionDelta)}
            sparklineData={retentionSparkline}
          />
          <AnswerCard
            question="Is there more to compete in?"
            value={latestYear?.tournaments?.toLocaleString() ?? '\u2014'}
            trend={getTrend(tournamentYoyPct)}
            sparklineData={tournamentSparkline}
          />
        </section>

      </main>

      {/* DETAIL DRAWER */}
      <DetailDrawer
        forecast={forecast ? {
          target_year: forecast.target_year,
          projected_tournaments: Math.round(parseFloat(String(forecast.projected_tournaments))),
          projected_entries: Math.round(parseFloat(String(forecast.projected_entries))),
          ci_68_low_tournaments: Math.round(parseFloat(String(forecast.ci_68_low_tournaments))),
          ci_68_high_tournaments: Math.round(parseFloat(String(forecast.ci_68_high_tournaments))),
          months_of_data: forecast.months_of_data,
        } : null}
        annualData={completeYears.map(s => ({
          year: s.year,
          tournaments: s.tournaments,
          player_entries: s.player_entries,
          unique_players: s.unique_players,
          retention_rate: parseFloat(String(s.retention_rate ?? 0)),
        }))}
        monthlyData={(monthlyEvents ?? []).map(m => ({
          year: m.year,
          month: m.month,
          event_count: m.event_count,
          prior_year_event_count: m.prior_year_event_count,
          yoy_change_pct: m.yoy_change_pct != null ? parseFloat(String(m.yoy_change_pct)) : null,
        }))}
        priorYearTournaments={latestYear?.tournaments ?? null}
        currentYearActuals={currentYearRow ? {
          year: currentYearRow.year,
          ytd_tournaments: currentYearRow.tournaments,
          ytd_entries: currentYearRow.player_entries,
        } : null}
      />

      {/* FOOTER */}
      <footer className="text-center text-xs text-muted-foreground py-4">
        Data from <a href="https://www.ifpapinball.com" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">IFPA API</a>. Not affiliated.
      </footer>
    </div>
  )
}
