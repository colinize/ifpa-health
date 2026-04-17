'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown } from 'lucide-react'
import { MonthlyPulse } from './monthly-pulse'
import { CountryGrowth } from './country-growth'
import { YearTable } from './year-table'
import { PlayerLifecycle, type PlayerLifecycleProps } from './player-lifecycle'

interface DetailDrawerProps {
  forecast: {
    target_year: number
    projected_tournaments: number
    projected_entries: number
    ci_68_low_tournaments: number
    ci_68_high_tournaments: number
    months_of_data: number
  } | null
  annualData: Array<{
    year: number
    tournaments: number
    player_entries: number
    unique_players: number
    retention_rate: number
  }>
  monthlyData: Array<{
    year: number
    month: number
    event_count: number
    prior_year_event_count: number | null
    yoy_change_pct: number | null
  }>
  countryGrowthData: Array<{
    country_name: string
    country_code: string
    active_players: number
    change: number | null
    change_pct: number | null
    first_snapshot: string
    latest_snapshot: string
  }>
  priorYearTournaments: number | null
  currentYearActuals: {
    year: number
    ytd_tournaments: number
    ytd_entries: number
  } | null
  lifecycleData: PlayerLifecycleProps | null
}

const STORAGE_KEY = 'detail-drawer-open'

// Read initial open state from localStorage so we avoid setState-in-effect.
// Server and first client render both return `false` (closed), and a future
// client-only re-render picks up the stored value via getSnapshot.
function subscribeStorage(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function getStoredOpen(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === 'true'
}

function getStoredOpenServer(): boolean {
  return false
}

export function DetailDrawer({
  forecast,
  annualData,
  monthlyData,
  countryGrowthData,
  priorYearTournaments,
  currentYearActuals,
  lifecycleData,
}: DetailDrawerProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const storedOpen = useSyncExternalStore(subscribeStorage, getStoredOpen, getStoredOpenServer)
  // After a user toggles the drawer in this session, prefer their in-session
  // choice over whatever localStorage says (the storage subscription only
  // reacts to cross-tab changes, but this also decouples chevron state from
  // the raw storage value once the user has interacted).
  const [sessionOpen, setSessionOpen] = useState<boolean | null>(null)
  const isOpen = sessionOpen ?? storedOpen

  function handleToggle() {
    const open = detailsRef.current?.open ?? false
    setSessionOpen(open)
    localStorage.setItem(STORAGE_KEY, String(open))
  }

  const showForecast = forecast !== null && forecast.months_of_data >= 2

  let projectedChangePct: number | null = null
  if (showForecast && priorYearTournaments && priorYearTournaments > 0) {
    projectedChangePct =
      ((forecast.projected_tournaments - priorYearTournaments) / priorYearTournaments) * 100
  }

  return (
    <details
      ref={detailsRef}
      open={isOpen}
      onToggle={handleToggle}
      className="border-t border-border mt-8"
    >
      <summary className="flex items-center justify-center gap-1.5 py-4 cursor-pointer list-none text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">More detail</span>
        <ChevronDown
          className={`chevron-rotate h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-8 pb-8 px-4 md:px-6 max-w-4xl mx-auto">
        {/* Player Flow */}
        {lifecycleData && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Player Flow
            </h3>
            <PlayerLifecycle {...lifecycleData} />
          </div>
        )}

        {/* Forecast section */}
        {showForecast && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {forecast.target_year} Forecast
            </h3>
            <p className="text-3xl font-bold font-mono">
              {forecast.projected_tournaments.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Range: {forecast.ci_68_low_tournaments.toLocaleString()} &ndash;{' '}
              {forecast.ci_68_high_tournaments.toLocaleString()}
            </p>
            {priorYearTournaments !== null && projectedChangePct !== null && (
              <p className="text-sm text-muted-foreground">
                {forecast.target_year - 1}: {priorYearTournaments.toLocaleString()}
                {' '}
                <span className={projectedChangePct >= 0 ? 'text-up' : 'text-down'}>
                  {projectedChangePct >= 0 ? '+' : ''}
                  {projectedChangePct.toFixed(1)}% projected change
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground/70">
              Based on {forecast.months_of_data} months of data
            </p>
          </div>
        )}

        {/* Monthly Pulse */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Monthly Pulse
          </h3>
          <MonthlyPulse data={monthlyData} />
        </div>

        {/* Country Growth */}
        {countryGrowthData.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Players by Country
            </h3>
            <CountryGrowth data={countryGrowthData} />
          </div>
        )}

        {/* Year-over-Year table */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Year-over-Year
          </h3>
          <YearTable
            data={annualData}
            projected={showForecast && currentYearActuals ? {
              year: forecast.target_year,
              ytd_tournaments: currentYearActuals.ytd_tournaments,
              projected_tournaments: forecast.projected_tournaments,
              ci_low_tournaments: forecast.ci_68_low_tournaments,
              ci_high_tournaments: forecast.ci_68_high_tournaments,
              ytd_entries: currentYearActuals.ytd_entries,
              projected_entries: forecast.projected_entries,
              months_of_data: forecast.months_of_data,
            } : null}
          />
        </div>

        {/* Methodology note */}
        <p className="text-xs text-muted-foreground/70 text-center">
          Health score = equal-weighted average of player growth, retention, and tournament growth.
        </p>
      </div>
    </details>
  )
}
