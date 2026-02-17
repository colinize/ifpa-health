interface MonthlyPulseProps {
  data: Array<{
    year: number
    month: number
    yoy_change_pct: number | null
  }>
}

const monthAbbr = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function getCellColor(change: number | null): string {
  if (change === null) return 'bg-flat/50'
  if (change > 2) return 'bg-up/70'
  if (change < -2) return 'bg-down/70'
  return 'bg-flat/50'
}

export function MonthlyPulse({ data }: MonthlyPulseProps) {
  // Take the most recent 12 months of data
  const recent = data
    .slice()
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12)

  return (
    <div className="flex flex-row gap-1.5 justify-center flex-wrap">
      {recent.map((d) => (
        <div key={`${d.year}-${d.month}`} className="flex flex-col items-center gap-1">
          <div
            className={`w-7 h-7 rounded ${getCellColor(d.yoy_change_pct)}`}
            title={
              d.yoy_change_pct !== null
                ? `${d.yoy_change_pct > 0 ? '+' : ''}${d.yoy_change_pct.toFixed(1)}% YoY`
                : 'No data'
            }
          />
          <span className="text-xs text-muted-foreground">
            {monthAbbr[d.month - 1]}
          </span>
        </div>
      ))}
    </div>
  )
}
