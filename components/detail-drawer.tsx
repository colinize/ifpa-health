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
      className="border-t border-foreground/10 mt-8"
    >
      <summary className="max-w-6xl mx-auto w-full px-4 md:px-8 flex items-center justify-center gap-2 py-5 cursor-pointer list-none text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-sans font-semibold uppercase tracking-[0.18em]">More detail</span>
        <ChevronDown
          className={`chevron-rotate h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-10 pb-10 px-4 md:px-8 max-w-6xl mx-auto">
        {/* Player Flow */}
        {lifecycleData && (
          <div className="space-y-2">
            <h3 className="font-serif text-xl font-semibold text-foreground">
              Player Flow
            </h3>
            <PlayerLifecycle {...lifecycleData} />
          </div>
        )}

        {/* Forecast — prose, matching the lifecycle treatment */}
        {showForecast && (
          <div className="space-y-3">
            <h3 className="font-serif text-xl font-semibold text-foreground">
              {forecast.target_year} Forecast
            </h3>
            <p className="font-serif text-base md:text-lg leading-relaxed text-foreground/85 max-w-prose">
              IFPA is on track for{' '}
              <span className="font-sans tabular-nums font-semibold text-foreground">
                ~{forecast.projected_tournaments.toLocaleString()}
              </span>{' '}
              tournaments in {forecast.target_year}
              {priorYearTournaments !== null && projectedChangePct !== null && (
                <>
                  ,{' '}
                  <span
                    className={`font-sans tabular-nums ${projectedChangePct >= 0 ? 'text-up' : 'text-down'}`}
                  >
                    {projectedChangePct >= 0 ? 'up' : 'down'}{' '}
                    {Math.abs(projectedChangePct).toFixed(1)}%
                  </span>{' '}
                  from {forecast.target_year - 1}&rsquo;s{' '}
                  <span className="font-sans tabular-nums text-foreground">
                    {priorYearTournaments.toLocaleString()}
                  </span>
                </>
              )}
              . Range runs{' '}
              <span className="font-sans tabular-nums text-foreground">
                {forecast.ci_68_low_tournaments.toLocaleString()}
                &ndash;
                {forecast.ci_68_high_tournaments.toLocaleString()}
              </span>{' '}
              at 68% confidence.
            </p>
            <p className="text-[10px] font-sans uppercase tracking-[0.12em] text-muted-foreground">
              Based on {forecast.months_of_data} months of data
            </p>
          </div>
        )}

        {/* Monthly Pulse */}
        <div className="space-y-2">
          <h3 className="font-serif text-xl font-semibold text-foreground">
            Monthly Pulse
          </h3>
          <MonthlyPulse data={monthlyData} />
        </div>

        {/* Country Growth */}
        {countryGrowthData.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-serif text-xl font-semibold text-foreground">
              Players by Country
            </h3>
            <CountryGrowth data={countryGrowthData} />
          </div>
        )}

        {/* Year-over-Year table */}
        <div className="space-y-2">
          <h3 className="font-serif text-xl font-semibold text-foreground">
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

        {/* Methodology note — pulled quote with left rule */}
        <p className="font-serif italic text-sm text-muted-foreground border-l-2 border-foreground/15 pl-4 max-w-prose">
          Health score is the equal-weighted average of player growth, retention, and tournament growth.
        </p>
      </div>
    </details>
  )
}
