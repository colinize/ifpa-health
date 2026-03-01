'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MonthlyPulse } from './monthly-pulse'
import { YearTable } from './year-table'

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
  priorYearTournaments: number | null
  currentYearActuals: {
    year: number
    ytd_tournaments: number
    ytd_entries: number
  } | null
}

const STORAGE_KEY = 'detail-drawer-open'

export function DetailDrawer({
  forecast,
  annualData,
  monthlyData,
  priorYearTournaments,
  currentYearActuals,
}: DetailDrawerProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  // Restore open/closed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') {
      setIsOpen(true)
      if (detailsRef.current) {
        detailsRef.current.open = true
      }
    }
  }, [])

  function handleToggle() {
    const open = detailsRef.current?.open ?? false
    setIsOpen(open)
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
      onToggle={handleToggle}
      className="border-t border-border mt-8"
    >
      <summary className="flex items-center justify-center gap-1.5 py-4 cursor-pointer list-none text-muted-foreground hover:text-foreground transition-colors [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">More detail</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </summary>

      <div className="space-y-8 pb-8 px-4 md:px-6 max-w-4xl mx-auto">
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
