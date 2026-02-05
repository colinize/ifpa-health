import { createPublicClient } from '@/lib/supabase'
import { HealthScoreGauge } from '@/components/health-score-gauge'
import { HealthScoreBreakdown } from '@/components/health-score-breakdown'
import { MetricCard } from '@/components/metric-card'
import { AnnualTrendsChart } from '@/components/annual-trends-chart'
import { MonthlyComparisonChart } from '@/components/monthly-comparison-chart'
import { ForecastChart } from '@/components/forecast-chart'
import { RetentionChart } from '@/components/retention-chart'
import { DemographicsChart } from '@/components/demographics-chart'
import { GeographicChart } from '@/components/geographic-chart'
import { WPPRTable } from '@/components/wppr-table'
import { MethodologyPanel } from '@/components/methodology-panel'
import { DataFreshness } from '@/components/data-freshness'
import { ThemeToggle } from '@/components/theme-toggle'
import { Separator } from '@/components/ui/separator'

export const revalidate = 3600

export default async function DashboardPage() {
  const supabase = createPublicClient()

  // Fetch all data in parallel
  const [
    { data: healthScore },
    { data: annualSnapshots },
    { data: monthlyEvents },
    { data: overallStats },
    { data: countryData },
    { data: wpprRankings },
    { data: forecast },
    { data: latestRun },
  ] = await Promise.all([
    supabase.from('health_scores').select('*').order('score_date', { ascending: false }).limit(1).single(),
    supabase.from('annual_snapshots').select('*').order('year', { ascending: true }),
    supabase.from('monthly_event_counts').select('*').order('year', { ascending: true }).order('month', { ascending: true }),
    supabase.from('overall_stats_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(1).single(),
    supabase.from('country_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(20),
    supabase.from('wppr_rankings').select('*').order('snapshot_date', { ascending: false }).order('wppr_rank', { ascending: true }).limit(25),
    supabase.from('forecasts').select('*').order('forecast_date', { ascending: false }).limit(1).single(),
    supabase.from('collection_runs').select('*').order('started_at', { ascending: false }).limit(1).single(),
  ])

  // Use the last COMPLETE year for metric cards (not the current incomplete year)
  const currentYear = new Date().getFullYear()
  const completeYears = annualSnapshots?.filter((s) => s.year < currentYear) ?? []
  const currentYearData = annualSnapshots?.find((s) => s.year === currentYear)
  const latestCompleteYear = completeYears[completeYears.length - 1]
  const priorCompleteYear = completeYears[completeYears.length - 2]

  // Exclude current incomplete year from historical charts
  const historicalData = completeYears

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* HEADER */}
        <header className="text-center space-y-2 relative">
          <div className="absolute right-0 top-0">
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">IFPA Ecosystem Health Dashboard</h1>
          <p className="text-muted-foreground">Is competitive pinball growing or dying? Let the data answer.</p>
          <DataFreshness lastRun={latestRun} />
        </header>

        <Separator />

        {/* HEALTH SCORE HERO */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-1 flex justify-center">
            <HealthScoreGauge score={healthScore?.composite_score ?? 0} band={healthScore?.band ?? 'stable'} />
          </div>
          <div className="md:col-span-2">
            <HealthScoreBreakdown components={healthScore?.components} sensitivity={healthScore?.sensitivity} />
          </div>
        </section>

        <Separator />

        {/* KEY METRICS ROW — uses last complete year to avoid misleading partial-year YoY */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Tournaments"
            value={latestCompleteYear?.tournaments}
            yoyPct={latestCompleteYear?.tournament_yoy_pct}
            year={latestCompleteYear?.year}
          />
          <MetricCard
            title="Player Entries"
            value={latestCompleteYear?.player_entries}
            yoyPct={latestCompleteYear?.entry_yoy_pct}
            year={latestCompleteYear?.year}
          />
          <MetricCard
            title="Unique Players"
            value={latestCompleteYear?.unique_players}
            year={latestCompleteYear?.year}
          />
          <MetricCard
            title="Avg Attendance"
            value={latestCompleteYear?.avg_attendance}
            year={latestCompleteYear?.year}
            decimals={1}
          />
        </section>

        {/* HISTORICAL TRENDS */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Historical Trends</h2>
          <AnnualTrendsChart data={historicalData} />
        </section>

        {/* MONTHLY MOMENTUM */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Monthly Momentum</h2>
          <MonthlyComparisonChart data={monthlyEvents ?? []} />
        </section>

        {/* 2026 FORECAST */}
        {forecast && forecast.months_of_data >= 2 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">{forecast.target_year} Forecast</h2>
            <ForecastChart forecast={forecast} annualData={historicalData} />
          </section>
        )}

        {/* PLAYER RETENTION */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Player Retention</h2>
          <RetentionChart data={historicalData} />
        </section>

        {/* DEMOGRAPHICS + GEOGRAPHY side by side */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Age Demographics</h2>
            <DemographicsChart data={overallStats} />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Geographic Distribution</h2>
            <GeographicChart data={countryData ?? []} />
          </div>
        </section>

        {/* WPPR TOP 25 */}
        <section>
          <h2 className="text-xl font-semibold mb-4">WPPR Top 25</h2>
          <WPPRTable rankings={wpprRankings ?? []} />
        </section>

        <Separator />

        {/* METHODOLOGY */}
        <MethodologyPanel />

        {/* FOOTER */}
        <footer className="text-center text-sm text-muted-foreground space-y-1 pb-8">
          <p>Data sourced from the <a href="https://www.ifpapinball.com" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">IFPA API</a>. Not affiliated with IFPA.</p>
          <p>
            <a href="https://github.com/colinize/ifpa-health" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">View on GitHub</a>
          </p>
        </footer>
      </div>
    </div>
  )
}
