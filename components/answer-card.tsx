import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Sparkline } from './sparkline'

interface AnswerCardProps {
  question: string
  value: string
  trend: {
    direction: 'up' | 'down' | 'flat'
    label: string
  }
  sparklineData: number[]
}

const trendConfig = {
  up: { icon: TrendingUp, colorClass: 'text-up' },
  down: { icon: TrendingDown, colorClass: 'text-down' },
  flat: { icon: Minus, colorClass: 'text-flat' },
} as const

export function AnswerCard({
  question,
  value,
  trend,
  sparklineData,
}: AnswerCardProps) {
  const { icon: TrendIcon, colorClass } = trendConfig[trend.direction]

  return (
    <div className="bg-card rounded-lg p-5">
      <p className="text-sm text-muted-foreground">{question}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      <div className={`flex items-center gap-1.5 mt-1 ${colorClass}`}>
        <TrendIcon className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm">{trend.label}</span>
      </div>
      <div className="mt-3">
        <Sparkline data={sparklineData} />
      </div>
    </div>
  )
}
