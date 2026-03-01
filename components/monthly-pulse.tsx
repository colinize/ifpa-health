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

function getAccentColor(change: number | null): string {
  if (change === null) return 'border-flat/40'
  if (change > 2) return 'border-up/60'
  if (change < -2) return 'border-down/60'
  return 'border-flat/40'
}

function getChangeColor(change: number | null): string {
  if (change === null) return 'text-muted-foreground'
  if (change > 2) return 'text-up'
  if (change < -2) return 'text-down'
  return 'text-muted-foreground'
}

function formatChange(change: number | null): string {
  if (change === null) return '—'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(0)}%`
}

export function MonthlyPulse({ data }: MonthlyPulseProps) {
  const recent = data
    .slice()
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12)

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {recent.map((d) => (
        <div
          key={`${d.year}-${d.month}`}
          className={`rounded-md border-l-[3px] bg-muted/30 px-2.5 py-2 ${getAccentColor(d.yoy_change_pct)}`}
        >
          <div className="text-xs text-muted-foreground">
            {monthAbbr[d.month - 1]} {String(d.year).slice(-2)}
          </div>
          <div className="text-lg font-semibold font-mono leading-tight">
            {d.event_count.toLocaleString()}
          </div>
          <div className={`text-xs font-medium ${getChangeColor(d.yoy_change_pct)}`}>
            {formatChange(d.yoy_change_pct)}
            {d.prior_year_event_count !== null && (
              <span className="text-muted-foreground font-normal">
                {' '}vs {d.prior_year_event_count.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
