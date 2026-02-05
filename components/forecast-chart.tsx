'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ForecastChartProps {
  forecast: {
    target_year: number
    months_of_data: number
    projected_tournaments: number
    ci_68_low_tournaments: number
    ci_68_high_tournaments: number
    ci_95_low_tournaments: number
    ci_95_high_tournaments: number
    ytd_actual_tournaments?: number
    trend_reference: { projected_value: number } | null
  }
  annualData: Array<{ year: number; tournaments: number }>
}

export function ForecastChart({ forecast, annualData }: ForecastChartProps) {
  if (!forecast) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No forecast data available</p>
        </CardContent>
      </Card>
    )
  }

  const projected = forecast.projected_tournaments
  const ci68Low = forecast.ci_68_low_tournaments
  const ci68High = forecast.ci_68_high_tournaments

  // Get last year's actual for comparison
  const lastYear = annualData
    .filter((d) => d.year < forecast.target_year)
    .sort((a, b) => b.year - a.year)[0]

  const lastYearTournaments = lastYear?.tournaments
  const vsLastYear = lastYearTournaments
    ? ((projected - lastYearTournaments) / lastYearTournaments) * 100
    : null

  // YTD progress
  const ytdActual = forecast.ytd_actual_tournaments
  const progressPct = ytdActual && projected > 0 ? (ytdActual / projected) * 100 : null

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            Based on {forecast.months_of_data} month{forecast.months_of_data !== 1 ? 's' : ''} of data
          </Badge>
          {forecast.months_of_data <= 3 && (
            <span className="text-xs text-muted-foreground">Early estimate, wide range expected</span>
          )}
        </div>

        {/* Main projection */}
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-1">Projected {forecast.target_year} Tournaments</p>
          <p className="text-4xl font-bold tracking-tight">{Math.round(projected).toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Range: {Math.round(ci68Low).toLocaleString()} &ndash; {Math.round(ci68High).toLocaleString()}
          </p>
        </div>

        {/* Comparison to last year */}
        {vsLastYear != null && lastYearTournaments && (
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {lastYear.year}: {lastYearTournaments.toLocaleString()}
            </span>
            <span className={vsLastYear >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
              {vsLastYear >= 0 ? '+' : ''}{vsLastYear.toFixed(1)}% projected change
            </span>
          </div>
        )}

        {/* YTD progress bar */}
        {ytdActual != null && progressPct != null && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>YTD: {ytdActual.toLocaleString()} tournaments</span>
              <span>{progressPct.toFixed(1)}% of projection</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
