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

export function ProjectedGauge({ score, band, ciLow, ciHigh, year }: ProjectedGaugeProps) {
  const color = bandColors[band.toLowerCase()] ?? 'var(--flat)'

  const cx = 100
  const cy = 100
  const r = 80
  const circumference = Math.PI * r

  const clampedScore = Math.max(0, Math.min(100, score))
  const clampedLow = Math.max(0, Math.min(100, ciLow))
  const clampedHigh = Math.max(0, Math.min(100, ciHigh))

  // Main progress arc
  const progress = (clampedScore / 100) * circumference
  const dashOffset = circumference - progress

  // CI range arc: from ciLow to ciHigh position
  const ciLowPos = (clampedLow / 100) * circumference
  const ciHighPos = (clampedHigh / 100) * circumference
  const ciLength = ciHighPos - ciLowPos

  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  const bandLabel = band.charAt(0).toUpperCase() + band.slice(1).toLowerCase()
  const ariaLabel = `Projected ${year} health score: ${Math.round(clampedScore)} out of 100, band: ${bandLabel}. Confidence range ${Math.round(clampedLow)} to ${Math.round(clampedHigh)}.`

  return (
    <div className="flex flex-col items-center">
      <svg
        width="120"
        height="72"
        viewBox="0 0 200 120"
        className="overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        {/* Background track */}
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className="text-muted/30"
        />
        {/* CI range arc (translucent) */}
        {ciLength > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeOpacity={0.2}
            strokeWidth="16"
            strokeDasharray={`${ciLength} ${circumference}`}
            strokeDashoffset={`${-ciLowPos}`}
          />
        )}
        {/* Progress arc (solid) */}
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
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
      {/* Label */}
      <span className="text-xs text-muted-foreground -mt-1" aria-hidden="true">
        {year} Projected
      </span>
      {/* Range */}
      <span className="text-xs text-muted-foreground/60" aria-hidden="true">
        {Math.round(clampedLow)}&ndash;{Math.round(clampedHigh)}
      </span>
    </div>
  )
}
