export interface PlayerLifecycleProps {
  priorYear: number
  currentYear: number
  priorTotal: number
  returning: number
  churned: number
  newPlayers: number
  currentTotal: number
}

function formatNum(n: number): string {
  return n.toLocaleString()
}

export function PlayerLifecycle({
  priorYear,
  currentYear,
  priorTotal,
  churned,
  newPlayers,
  currentTotal,
}: PlayerLifecycleProps) {
  const maxVal = Math.max(priorTotal, currentTotal)
  const net = currentTotal - priorTotal
  const netPct = priorTotal > 0 ? (net / priorTotal) * 100 : 0
  const churnRate = priorTotal > 0 ? (churned / priorTotal) * 100 : 0

  const rows: Array<{
    label: string
    value: string
    raw: number
    barColor: string
  }> = [
    {
      label: `Started with (${priorYear})`,
      value: formatNum(priorTotal),
      raw: priorTotal,
      barColor: 'bg-muted/40',
    },
    {
      label: "Didn\u2019t return",
      value: `\u2212${formatNum(churned)}`,
      raw: churned,
      barColor: 'bg-down/50',
    },
    {
      label: 'New players',
      value: `+${formatNum(newPlayers)}`,
      raw: newPlayers,
      barColor: 'bg-up/50',
    },
    {
      label: `Ended with (${currentYear})`,
      value: formatNum(currentTotal),
      raw: currentTotal,
      barColor: 'bg-muted/40',
    },
  ]

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = maxVal > 0 ? (row.raw / maxVal) * 100 : 0
        return (
          <div key={row.label} className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-36 shrink-0 text-right">
              {row.label}
            </span>
            <span className="font-mono text-sm w-20 shrink-0 text-right tabular-nums">
              {row.value}
            </span>
            <div className="flex-1 h-5">
              <div
                className={`h-full rounded-sm ${row.barColor}`}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
          </div>
        )
      })}

      {/* Net summary */}
      <div className="flex items-center gap-3 pt-1 border-t border-border">
        <span className="text-sm text-muted-foreground w-36 shrink-0 text-right">
          Net
        </span>
        <span
          className={`font-mono text-sm font-semibold w-20 shrink-0 text-right tabular-nums ${
            net >= 0 ? 'text-up' : 'text-down'
          }`}
        >
          {net >= 0 ? '+' : ''}{formatNum(net)}
        </span>
        <span className={`text-sm ${net >= 0 ? 'text-up' : 'text-down'}`}>
          ({netPct >= 0 ? '+' : ''}{netPct.toFixed(1)}%)
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {churnRate.toFixed(0)}% churn
        </span>
      </div>
    </div>
  )
}
