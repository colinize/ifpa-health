interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function Sparkline({
  data,
  color = 'var(--muted-foreground)',
  width = 120,
  height = 32,
}: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  // 10% vertical padding
  const paddingY = height * 0.1
  const plotHeight = height - paddingY * 2

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width
      const y = paddingY + plotHeight - ((value - min) / range) * plotHeight
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  // Last point coordinates for the dot
  const lastX = width
  const lastY =
    paddingY + plotHeight - ((data[data.length - 1] - min) / range) * plotHeight

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY.toFixed(1)} r="3" fill={color} />
    </svg>
  )
}
