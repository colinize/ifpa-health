'use client'

import { useEffect, useRef, useState } from 'react'

interface HealthScoreGaugeProps {
  score: number
  band: string
}

const bandColors: Record<string, string> = {
  thriving: 'var(--band-thriving)',
  healthy: 'var(--band-healthy)',
  stable: 'var(--band-stable)',
  concerning: 'var(--band-concerning)',
  critical: 'var(--band-critical)',
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function HealthScoreGauge({ score, band }: HealthScoreGaugeProps) {
  const color = bandColors[band.toLowerCase()] ?? 'var(--flat)'
  const [displayValue, setDisplayValue] = useState(0)
  const rafRef = useRef<number | null>(null)

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

  // Count-up animation
  useEffect(() => {
    const duration = 800 // ms
    let startTime: number | null = null

    function animate(timestamp: number) {
      if (startTime === null) startTime = timestamp
      const elapsed = timestamp - startTime
      const t = Math.min(elapsed / duration, 1)
      const easedT = easeOutCubic(t)
      setDisplayValue(easedT * clampedScore)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [clampedScore])

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
          className="text-muted/30"
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
          style={{ fontSize: '44px', fontWeight: 700 }}
        >
          {Math.round(displayValue)}
        </text>
      </svg>
      {/* Band label */}
      <span
        className="text-base font-bold -mt-2"
        style={{ color }}
      >
        {band.charAt(0).toUpperCase() + band.slice(1).toLowerCase()}
      </span>
    </div>
  )
}
