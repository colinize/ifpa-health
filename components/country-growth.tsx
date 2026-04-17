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

function formatPct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function formatAbsoluteTitle(change: number | null): string {
  if (change === null) return ''
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toLocaleString()} players`
}

/**
 * Ranked list, table-like. Hairline dividers between rows, no background
 * bars, no chrome. The tabular numbers do the visual comparison.
 */
export function CountryGrowth({ data }: CountryGrowthProps) {
  if (data.length === 0) return null

  const top = data.slice(0, 15)
  const hasGrowth = top.some(d => d.change !== null)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div
        className={`grid ${hasGrowth ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]'} gap-x-6 pb-2 border-b border-foreground/10 text-[10px] font-sans uppercase tracking-[0.15em] text-muted-foreground`}
      >
        <span>Country</span>
        <span className="text-right">Players</span>
        {hasGrowth && <span className="text-right min-w-[72px]">Change</span>}
      </div>

      {/* Rows */}
      <div className="divide-y divide-foreground/5">
        {top.map((d) => (
          <div
            key={d.country_code}
            className={`grid ${hasGrowth ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]'} gap-x-6 items-baseline py-2`}
          >
            <span className="font-sans text-sm truncate text-foreground">
              {d.country_name}
            </span>
            <span className="font-sans tabular-nums text-sm font-medium text-right text-foreground">
              {d.active_players.toLocaleString()}
            </span>
            {hasGrowth && (
              <span
                className={`font-sans tabular-nums text-sm text-right min-w-[72px] ${getChangeColor(d.change_pct)}`}
                title={formatAbsoluteTitle(d.change)}
              >
                {formatPct(d.change_pct)}
                {d.change !== null && (
                  <span className="sr-only">
                    {' '}({formatAbsoluteTitle(d.change)})
                  </span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Dateline */}
      {hasGrowth && (
        <p className="text-[10px] font-sans uppercase tracking-[0.12em] text-muted-foreground">
          Change since{' '}
          {new Date(top[0].first_snapshot).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </p>
      )}
    </div>
  )
}
