export interface PlayerLifecycleProps {
  priorYear: number
  currentYear: number
  priorTotal: number
  churned: number
  newPlayers: number
  currentTotal: number
}

function formatNum(n: number): string {
  return n.toLocaleString()
}

/**
 * Waterfall as prose. One editorial sentence narrates the flow between
 * two years; key numbers are weighted in DM Sans, direction is colored.
 * No bar chart, no row chrome.
 */
export function PlayerLifecycle({
  priorYear,
  currentYear,
  priorTotal,
  churned,
  newPlayers,
  currentTotal,
}: PlayerLifecycleProps) {
  const net = currentTotal - priorTotal
  const netPct = priorTotal > 0 ? (net / priorTotal) * 100 : 0
  const churnRate = priorTotal > 0 ? (churned / priorTotal) * 100 : 0
  const netSign = net >= 0 ? '+' : ''
  const netColor = net >= 0 ? 'text-up' : 'text-down'

  return (
    <p className="font-serif text-base md:text-lg leading-relaxed text-foreground/85 max-w-prose">
      Started {priorYear} with{' '}
      <span className="font-sans tabular-nums font-semibold text-foreground">
        {formatNum(priorTotal)}
      </span>{' '}
      players. Lost{' '}
      <span className="font-sans tabular-nums font-semibold text-down">
        {formatNum(churned)}
      </span>{' '}
      (
      <span className="font-sans tabular-nums text-muted-foreground">
        {churnRate.toFixed(0)}% churn
      </span>
      ), gained{' '}
      <span className="font-sans tabular-nums font-semibold text-up">
        {formatNum(newPlayers)}
      </span>
      . Ended {currentYear} with{' '}
      <span className="font-sans tabular-nums font-semibold text-foreground">
        {formatNum(currentTotal)}
      </span>{' '}
      (
      <span className={`font-sans tabular-nums font-semibold ${netColor}`}>
        {netSign}
        {formatNum(net)}
      </span>
      ,{' '}
      <span className={`font-sans tabular-nums ${netColor}`}>
        {netSign}
        {netPct.toFixed(1)}%
      </span>
      ).
    </p>
  )
}
