'use client'

interface HealthScoreGaugeProps {
  score: number
  band: string
}

const bandColors: Record<string, string> = {
  thriving: '#22c55e',
  healthy: '#3b82f6',
  stable: '#eab308',
  concerning: '#f97316',
  critical: '#ef4444',
}

export function HealthScoreGauge({ score, band }: HealthScoreGaugeProps) {
  const color = bandColors[band.toLowerCase()] ?? '#6b7280'

  // Semi-circle gauge geometry
  const cx = 100
  const cy = 100
  const r = 80
  // Arc from 180 degrees (left) to 0 degrees (right) — a top semi-circle
  const circumference = Math.PI * r // half-circle circumference
  const clampedScore = Math.max(0, Math.min(100, score))
  const progress = (clampedScore / 100) * circumference
  const dashOffset = circumference - progress

  // Arc endpoints for the semi-circle (drawn from left to right)
  const startX = cx - r
  const startY = cy
  const endX = cx + r
  const endY = cy

  return (
    <div className="flex flex-col items-center">
      <svg
        width="200"
        height="120"
        viewBox="0 0 200 120"
        className="overflow-visible"
      >
        {/* Background track */}
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className="text-muted-foreground/20"
        />
        {/* Progress arc */}
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
        {/* Score number */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground"
          style={{ fontSize: '36px', fontWeight: 700 }}
        >
          {Math.round(clampedScore)}
        </text>
      </svg>
      {/* Band label */}
      <span
        className="text-sm font-semibold -mt-2"
        style={{ color }}
      >
        {band.charAt(0).toUpperCase() + band.slice(1).toLowerCase()}
      </span>
    </div>
  )
}
