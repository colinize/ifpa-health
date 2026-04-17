interface ProjectedGaugeProps {
  score: number
  band: string
  ciLow: number
  ciHigh: number
  year: number
}

const bandColors: Record<string, string> = {
  thriving: 'var(--band-thriving)',
  healthy: 'var(--band-healthy)',
  stable: 'var(--band-stable)',
  concerning: 'var(--band-concerning)',
  critical: 'var(--band-critical)',
}

/**
 * Projected score as an inline caption, not a second gauge. Sits under
 * the main score so the primary number dominates. Year label, projected
 * value, confidence range — one line.
 */
export function ProjectedGauge({ score, band, ciLow, ciHigh, year }: ProjectedGaugeProps) {
  const color = bandColors[band.toLowerCase()] ?? 'var(--flat)'

  const clampedScore = Math.max(0, Math.min(100, score))
  const clampedLow = Math.max(0, Math.min(100, ciLow))
  const clampedHigh = Math.max(0, Math.min(100, ciHigh))

  const ariaLabel = `Projected ${year} health score: ${Math.round(clampedScore)} out of 100, band ${band}, confidence range ${Math.round(clampedLow)} to ${Math.round(clampedHigh)}.`

  return (
    <p
      className="flex items-baseline gap-2 text-sm font-sans text-muted-foreground tabular-nums"
      aria-label={ariaLabel}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
        {year} projected
      </span>
      <span className="font-semibold text-foreground" style={{ color }}>
        {Math.round(clampedScore)}
      </span>
      <span className="text-muted-foreground">
        &ndash; range {Math.round(clampedLow)}&ndash;{Math.round(clampedHigh)}
      </span>
    </p>
  )
}
