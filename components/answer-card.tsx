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

/**
 * An answer row. No card, no chrome. Lives on the straw surface with a
 * hairline top divider supplied by the parent via `divide-y`.
 * Question (sans, small) → Big number (sans, heavy) → Trend (small) + Sparkline.
 */
export function AnswerCard({
  question,
  value,
  trend,
  sparklineData,
}: AnswerCardProps) {
  const { icon: TrendIcon, colorClass } = trendConfig[trend.direction]

  return (
    <div className="py-5 grid grid-cols-[1fr_auto] items-end gap-4">
      <div className="min-w-0">
        <p className="font-serif text-base md:text-lg italic text-foreground/70 leading-snug">
          {question}
        </p>
        <p className="mt-2 font-sans text-4xl md:text-5xl font-semibold text-foreground tabular-nums leading-none">
          {value}
        </p>
        <div className={`mt-2 flex items-center gap-1.5 ${colorClass}`}>
          <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-sm font-sans tabular-nums">{trend.label}</span>
        </div>
      </div>
      <div className="shrink-0 self-center">
        <Sparkline data={sparklineData} />
      </div>
    </div>
  )
}
