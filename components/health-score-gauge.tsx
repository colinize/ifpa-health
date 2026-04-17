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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Hero score treatment — magazine number, not a gauge. A huge DM Sans
 * figure on the left; band label and "out of 100" in tracked small-caps
 * on the right; a thin horizontal scale underneath with a single colored
 * tick marking the current score. No arc.
 */
export function HealthScoreGauge({ score, band }: HealthScoreGaugeProps) {
  const color = bandColors[band.toLowerCase()] ?? 'var(--flat)'
  const [displayValue, setDisplayValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  const clampedScore = Math.max(0, Math.min(100, score))

  // Count-up animation. Under `prefers-reduced-motion: reduce` the duration
  // collapses to 0 so the first RAF frame jumps to the final value.
  useEffect(() => {
    const reduceMotion = prefersReducedMotion()
    const duration = reduceMotion ? 0 : 800 // ms
    let startTime: number | null = null

    function animate(timestamp: number) {
      if (startTime === null) startTime = timestamp
      const elapsed = timestamp - startTime
      const t = duration === 0 ? 1 : Math.min(elapsed / duration, 1)
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

  const bandLabel = band.charAt(0).toUpperCase() + band.slice(1).toLowerCase()
  const ariaLabel = `Pinball health score: ${Math.round(clampedScore)} out of 100, band: ${bandLabel}`

  return (
    <div
      className="flex flex-col items-start gap-5 w-full max-w-md"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Hero number + band label */}
      <div className="flex items-baseline gap-5">
        <span
          className="font-sans font-bold tabular-nums leading-none text-foreground"
          style={{
            fontSize: 'clamp(6rem, 13vw, 10.5rem)',
            letterSpacing: '-0.045em',
          }}
        >
          {Math.round(displayValue)}
        </span>
        <div className="flex flex-col gap-1.5 pb-2">
          <span
            className="text-xs font-sans font-semibold uppercase tracking-[0.18em]"
            style={{ color }}
            aria-hidden="true"
          >
            {bandLabel}
          </span>
          <span className="text-[10px] font-sans uppercase tracking-[0.15em] text-muted-foreground">
            out of 100
          </span>
        </div>
      </div>

      {/* Horizontal scale with marker */}
      <div className="w-full">
        <div
          className="relative h-px bg-foreground/15"
          aria-hidden="true"
        >
          {/* Quarter ticks */}
          {[25, 50, 75].map((pct) => (
            <span
              key={pct}
              className="absolute top-0 h-1.5 w-px bg-foreground/15"
              style={{ left: `${pct}%` }}
            />
          ))}
          {/* Current score marker. Position is set once (no layout-animating
              transition on `left`); entrance uses opacity on the GPU. */}
          <span
            className="score-marker absolute h-3 w-[3px] -top-[6px] rounded-[1px]"
            style={{
              left: `${clampedScore}%`,
              backgroundColor: color,
              transform: 'translateX(-50%)',
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-sans font-medium uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    </div>
  )
}
