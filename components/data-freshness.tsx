import { formatDistanceToNow } from 'date-fns'

interface DataFreshnessProps {
  lastRun: { completed_at: string | null } | null
  // Staleness is derived upstream in the Server Component so this component
  // stays purely presentational and doesn't call `Date.now()` at render time
  // (react-hooks/purity would flag that as an impure component).
  isStale: boolean
}

/**
 * Inline label for the masthead. No pill, no card — a small dateline
 * with a status dot. Color shifts to pink when data is stale.
 */
export function DataFreshness({ lastRun, isStale }: DataFreshnessProps) {
  if (!lastRun?.completed_at) {
    return (
      <span className="inline-flex items-center gap-2 text-[11px] font-sans uppercase tracking-[0.15em] text-muted-foreground">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
        />
        No data yet
      </span>
    )
  }

  const timeAgo = formatDistanceToNow(new Date(lastRun.completed_at), { addSuffix: true })
  const dotColor = isStale ? 'bg-down' : 'bg-up'
  const textColor = isStale ? 'text-down' : 'text-muted-foreground'

  return (
    <span className={`inline-flex items-center gap-2 text-[11px] font-sans uppercase tracking-[0.15em] ${textColor}`}>
      <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="normal-case tracking-normal">Last updated {timeAgo}</span>
    </span>
  )
}
