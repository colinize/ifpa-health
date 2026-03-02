interface CountryGrowthEntry {
  country_name: string
  country_code: string
  active_players: number
  change: number | null
  change_pct: number | null
  first_snapshot: string
  latest_snapshot: string
}

interface CountryGrowthProps {
  data: CountryGrowthEntry[]
}

function getChangeColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground'
  if (pct > 1) return 'text-up'
  if (pct < -1) return 'text-down'
  return 'text-muted-foreground'
}

function formatChange(change: number | null, pct: number | null): string {
  if (change === null || pct === null) return '—'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toLocaleString()} (${sign}${pct.toFixed(1)}%)`
}

export function CountryGrowth({ data }: CountryGrowthProps) {
  if (data.length === 0) return null

  // Show top 15 countries by player count
  const top = data.slice(0, 15)
  const hasGrowth = top.some(d => d.change !== null)

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs text-muted-foreground font-medium px-1">
        <span>Country</span>
        <span className="text-right">Players</span>
        {hasGrowth && <span className="text-right min-w-[120px]">Change</span>}
      </div>

      {/* Country rows */}
      {top.map((d) => {
        const barWidth = data[0].active_players > 0
          ? Math.max(2, (d.active_players / data[0].active_players) * 100)
          : 0

        return (
          <div key={d.country_code} className="relative">
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 bg-muted/40 rounded-sm"
              style={{ width: `${barWidth}%` }}
            />

            {/* Content */}
            <div className="relative grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-2 py-1.5">
              <span className="text-sm truncate">{d.country_name}</span>
              <span className="text-sm font-mono font-medium text-right tabular-nums">
                {d.active_players.toLocaleString()}
              </span>
              {hasGrowth && (
                <span className={`text-xs font-mono text-right tabular-nums min-w-[120px] ${getChangeColor(d.change_pct)}`}>
                  {formatChange(d.change, d.change_pct)}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* Date range footnote */}
      {hasGrowth && (
        <p className="text-xs text-muted-foreground/70 px-1">
          Change since {new Date(top[0].first_snapshot).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  )
}
