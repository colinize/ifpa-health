import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface DataFreshnessProps {
  lastRun: { completed_at: string | null } | null
  // Staleness is derived upstream in the Server Component so this component
  // stays purely presentational and doesn't call `Date.now()` at render time
  // (react-hooks/purity would flag that as an impure component).
  isStale: boolean
}

export function DataFreshness({ lastRun, isStale }: DataFreshnessProps) {
  if (!lastRun?.completed_at) {
    return <Badge variant="outline" className="text-xs">No data collected yet</Badge>
  }

  const timeAgo = formatDistanceToNow(new Date(lastRun.completed_at), { addSuffix: true })

  return (
    <Badge variant={isStale ? 'destructive' : 'outline'} className="text-xs">
      Last updated {timeAgo}
    </Badge>
  )
}
