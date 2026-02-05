'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'

interface MonthlyComparisonChartProps {
  data: Array<{
    year: number
    month: number
    event_count: number
    yoy_change_pct: number | null
  }>
}

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface TransformedMonth {
  month: string
  currentYear: number
  priorYear: number
  yoyPct: number | null
}

function transformData(data: MonthlyComparisonChartProps['data']): TransformedMonth[] {
  if (!data || data.length === 0) return []

  const currentYear = Math.max(...data.map((d) => d.year))
  const priorYear = currentYear - 1

  const currentMap = new Map<number, number>()
  const priorMap = new Map<number, number>()
  const yoyMap = new Map<number, number | null>()

  for (const d of data) {
    if (d.year === currentYear) {
      currentMap.set(d.month, d.event_count)
      yoyMap.set(d.month, d.yoy_change_pct)
    } else if (d.year === priorYear) {
      priorMap.set(d.month, d.event_count)
    }
  }

  const result: TransformedMonth[] = []
  for (let m = 1; m <= 12; m++) {
    const cur = currentMap.get(m)
    const prior = priorMap.get(m)
    // Only include months that have data in either year
    if (cur != null || prior != null) {
      result.push({
        month: monthLabels[m - 1],
        currentYear: cur ?? 0,
        priorYear: prior ?? 0,
        yoyPct: yoyMap.get(m) ?? null,
      })
    }
  }

  return result
}

function YoYLabel(props: { x?: number; y?: number; width?: number; value?: number; index?: number; chartData?: TransformedMonth[] }) {
  const { x = 0, y = 0, width = 0, index = 0, chartData = [] } = props
  const item = chartData[index]
  if (!item || item.yoyPct == null) return null

  const pct = item.yoyPct
  const color = pct >= 0 ? '#22c55e' : '#ef4444'
  const sign = pct >= 0 ? '+' : ''

  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fill={color}
      fontSize={11}
      fontWeight={600}
    >
      {sign}{Math.round(pct)}%
    </text>
  )
}

export function MonthlyComparisonChart({ data }: MonthlyComparisonChartProps) {
  const chartData = transformData(data)

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No monthly data available</p>
        </CardContent>
      </Card>
    )
  }

  const currentYear = Math.max(...data.map((d) => d.year))
  const priorYear = currentYear - 1

  return (
    <Card>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(value: number, name: string) => [
                value.toLocaleString(),
                name,
              ]}
            />
            <Legend />
            <Bar
              dataKey="priorYear"
              name={String(priorYear)}
              fill="#6b7280"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="currentYear"
              name={String(currentYear)}
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
              label={<YoYLabel chartData={chartData} />}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
