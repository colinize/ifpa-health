'use client'

import { Card, CardContent } from '@/components/ui/card'

interface HealthScoreBreakdownProps {
  components: Record<string, { score: number; weight: number; raw_value: number; label?: string }> | null | undefined
  sensitivity: Record<string, number> | null | undefined
}

const componentOrder = ['growth', 'attendance', 'retention', 'momentum', 'diversity', 'youth']

function scoreColor(score: number): string {
  if (score > 70) return '#22c55e'
  if (score > 50) return '#eab308'
  if (score > 35) return '#f97316'
  return '#ef4444'
}

function topSensitivityKey(sensitivity: Record<string, number>): string | null {
  let maxKey: string | null = null
  let maxVal = -Infinity
  for (const [key, val] of Object.entries(sensitivity)) {
    if (Math.abs(val) > maxVal) {
      maxVal = Math.abs(val)
      maxKey = key
    }
  }
  return maxKey
}

export function HealthScoreBreakdown({ components, sensitivity }: HealthScoreBreakdownProps) {
  if (!components || Object.keys(components).length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No breakdown data available</p>
        </CardContent>
      </Card>
    )
  }

  const topInfluencer = sensitivity ? topSensitivityKey(sensitivity) : null

  return (
    <Card>
      <CardContent className="space-y-3">
        {componentOrder.map((key) => {
          const comp = components[key]
          if (!comp) return null

          const label = comp.label ?? key.charAt(0).toUpperCase() + key.slice(1)
          const color = scoreColor(comp.score)
          const pct = Math.max(0, Math.min(100, comp.score))
          const sensitivityVal = sensitivity?.[key]
          const isTopInfluencer = topInfluencer === key

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {label} <span className="text-muted-foreground font-normal">({Math.round(comp.weight * 100)}%)</span>
                  </span>
                  {isTopInfluencer && sensitivityVal != null && (
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{
                        color,
                        backgroundColor: `${color}15`,
                      }}
                    >
                      {sensitivityVal > 0 ? '↑' : '↓'} {Math.abs(Math.round(sensitivityVal))}%
                    </span>
                  )}
                </div>
                <span className="font-semibold tabular-nums" style={{ color }}>
                  {Math.round(comp.score)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
