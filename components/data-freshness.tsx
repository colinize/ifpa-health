import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface DataFreshnessProps {
  lastRun: { completed_at: string; status: string } | null
}

export function DataFreshness({ lastRun }: DataFreshnessProps) {
  if (!lastRun?.completed_at) {
    return <Badge variant="outline" className="text-xs">No data collected yet</Badge>
  }

  const timeAgo = formatDistanceToNow(new Date(lastRun.completed_at), { addSuffix: true })
  const isStale = Date.now() - new Date(lastRun.completed_at).getTime() > 48 * 60 * 60 * 1000

  return (
    <Badge variant={isStale ? 'destructive' : 'outline'} className="text-xs">
      Last updated {timeAgo}
    </Badge>
  )
}
