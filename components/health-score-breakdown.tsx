'use client'

import { Card, CardContent } from '@/components/ui/card'

interface HealthScoreBreakdownProps {
  components: Record<string, { score: number; weight: number; raw_value: number; label?: string }> | null | undefined
  sensitivity: Record<string, number> | null | undefined
}

const componentConfig: Record<string, { icon: string; format: (v: number) => string }> = {
  growth: { icon: '📈', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}% YoY` },
  attendance: { icon: '👥', format: (v) => `${v.toFixed(1)} avg/event` },
  retention: { icon: '🔄', format: (v) => `${v.toFixed(0)}% return rate` },
  momentum: { icon: '⚡', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}% recent` },
  diversity: { icon: '🌍', format: (v) => `${v.toFixed(0)} index` },
  youth: { icon: '🎯', format: (v) => `${v.toFixed(1)}% under 30` },
}

const componentOrder = ['growth', 'attendance', 'retention', 'momentum', 'diversity', 'youth']

function scoreLabel(score: number): { text: string; className: string } {
  if (score >= 80) return { text: 'Strong', className: 'text-green-500' }
  if (score >= 60) return { text: 'Good', className: 'text-blue-500' }
  if (score >= 40) return { text: 'Fair', className: 'text-yellow-500' }
  if (score >= 20) return { text: 'Weak', className: 'text-orange-500' }
  return { text: 'Poor', className: 'text-red-500' }
}

export function HealthScoreBreakdown({ components }: HealthScoreBreakdownProps) {
  if (!components || Object.keys(components).length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No breakdown data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {componentOrder.map((key) => {
            const comp = components[key]
            if (!comp) return null

            const config = componentConfig[key]
            const name = key.charAt(0).toUpperCase() + key.slice(1)
            const label = scoreLabel(comp.score)

            return (
              <div key={key} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/50">
                <span className="text-lg leading-none mt-0.5">{config?.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{name}</span>
                    <span className={`text-xs font-semibold ${label.className}`}>{label.text}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {config?.format(comp.raw_value) ?? `Score: ${Math.round(comp.score)}`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
