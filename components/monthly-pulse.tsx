interface MonthlyPulseProps {
  data: Array<{
    year: number
    month: number
    event_count: number
    prior_year_event_count: number | null
    yoy_change_pct: number | null
  }>
}

const monthAbbr = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function barColor(change: number | null): string {
  if (change === null) return 'bg-flat/40'
  if (change > 2) return 'bg-up'
  if (change < -2) return 'bg-down'
  return 'bg-flat/60'
}

function formatTitle(year: number, month: number, count: number, change: number | null): string {
  const monthName = monthAbbr[month - 1]
  const yoy = change == null
    ? ''
    : ` · ${change >= 0 ? '+' : ''}${change.toFixed(1)}% YoY`
  return `${monthName} ${year}: ${count.toLocaleString()}${yoy}`
}

/**
 * Horizontal strip of 12 monthly bars. Height is event count relative to the
 * period max; color is YoY direction. A chart, not a grid of tiles.
 */
export function MonthlyPulse({ data }: MonthlyPulseProps) {
  const recent = data
    .slice()
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12)

  if (recent.length === 0) return null

  const maxCount = Math.max(...recent.map(d => d.event_count))
  const peak = recent.find(d => d.event_count === maxCount) ?? recent[0]
  const first = recent[0]
  const last = recent[recent.length - 1]

  // Summary stats — aggregate YoY across the 12 months where prior-year data exists.
  const withPrior = recent.filter(d => d.prior_year_event_count != null && d.prior_year_event_count > 0)
  const total = withPrior.reduce((sum, d) => sum + d.event_count, 0)
  const priorTotal = withPrior.reduce((sum, d) => sum + (d.prior_year_event_count ?? 0), 0)
  const periodYoy = priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : null
  const yoyColor = periodYoy == null
    ? 'text-foreground/70'
    : periodYoy > 0
      ? 'text-up'
      : periodYoy < 0
        ? 'text-down'
        : 'text-foreground/70'

  return (
    <div className="space-y-4">
      {/* Period summary + scale reference */}
      {periodYoy != null && (
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <p className="font-sans text-sm text-foreground/80">
            Last 12 months:{' '}
            <span className="tabular-nums font-medium text-foreground">
              {total.toLocaleString()}
            </span>{' '}
            events{' · '}
            <span className={`tabular-nums font-medium ${yoyColor}`}>
              {periodYoy >= 0 ? '+' : ''}
              {periodYoy.toFixed(1)}%
            </span>{' '}
            vs prior year.
          </p>
          <p className="text-[10px] font-sans uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
            Peak {monthAbbr[peak.month - 1]} {String(peak.year).slice(-2)} ·{' '}
            {peak.event_count.toLocaleString()}
          </p>
        </div>
      )}

      {/* Bar strip — each bar is an image with a full aria-label;
          hover title is kept as a sighted-user nicety. */}
      <div>
        <div className="grid grid-cols-12 gap-[2px] sm:gap-[3px] items-end h-20 sm:h-24" role="list">
          {recent.map((d) => {
            const heightPct = maxCount > 0 ? (d.event_count / maxCount) * 100 : 0
            const label = formatTitle(d.year, d.month, d.event_count, d.yoy_change_pct)
            return (
              <div
                key={`${d.year}-${d.month}`}
                role="listitem"
                aria-label={label}
                title={label}
                className="relative h-full flex items-end"
              >
                <div
                  className={`w-full ${barColor(d.yoy_change_pct)}`}
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                />
              </div>
            )
          })}
        </div>

        {/* Month labels */}
        <div className="grid grid-cols-12 gap-[2px] sm:gap-[3px] mt-2">
          {recent.map((d) => (
            <span
              key={`label-${d.year}-${d.month}`}
              className="text-[10px] font-sans uppercase tracking-[0.05em] text-muted-foreground text-center tabular-nums"
            >
              {monthAbbr[d.month - 1]}
            </span>
          ))}
        </div>

        {/* Endpoint dateline */}
        <p className="text-[10px] font-sans uppercase tracking-[0.12em] text-muted-foreground mt-3">
          {monthAbbr[first.month - 1]} {first.year} &ndash; {monthAbbr[last.month - 1]} {last.year}
        </p>
      </div>
    </div>
  )
}
