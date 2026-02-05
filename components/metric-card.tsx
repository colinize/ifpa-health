import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: number | null | undefined
  yoyPct?: number | null
  year?: number | null
  decimals?: number
}

export function MetricCard({ title, value, yoyPct, year, decimals = 0 }: MetricCardProps) {
  const formattedValue = value != null
    ? decimals > 0 ? Number(value).toFixed(decimals) : Number(value).toLocaleString()
    : '—'

  const TrendIcon = yoyPct != null
    ? yoyPct > 0 ? TrendingUp : yoyPct < 0 ? TrendingDown : Minus
    : null

  const trendColor = yoyPct != null
    ? yoyPct > 0 ? 'text-emerald-600 dark:text-emerald-400' : yoyPct < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
    : ''

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold mt-1">{formattedValue}</p>
        <div className="flex items-center gap-1 mt-1">
          {TrendIcon && <TrendIcon className={`h-3 w-3 ${trendColor}`} />}
          {yoyPct != null && (
            <span className={`text-xs ${trendColor}`}>
              {yoyPct > 0 ? '+' : ''}{Number(yoyPct).toFixed(1)}% YoY
            </span>
          )}
          {year && <span className="text-xs text-muted-foreground ml-auto">{year}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
