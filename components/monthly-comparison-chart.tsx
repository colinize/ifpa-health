'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
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

interface ChartPoint {
  month: string
  yoyPct: number
  count: number
  priorCount: number
}

function transformData(data: MonthlyComparisonChartProps['data']): ChartPoint[] {
  if (!data || data.length === 0) return []

  // Build a map of year+month → event_count
  const byYearMonth = new Map<string, number>()
  for (const d of data) {
    byYearMonth.set(`${d.year}-${d.month}`, d.event_count)
  }

  // Get the most recent 12 months that have data
  const allYears = [...new Set(data.map((d) => d.year))].sort()
  const maxYear = allYears[allYears.length - 1]

  // Find months with YoY data — look for months that have both current and prior year
  const result: ChartPoint[] = []

  for (const d of data) {
    if (d.yoy_change_pct == null) continue
    const priorCount = byYearMonth.get(`${d.year - 1}-${d.month}`)
    if (priorCount == null) continue

    result.push({
      month: `${monthLabels[d.month - 1]} ${d.year}`,
      yoyPct: d.yoy_change_pct,
      count: d.event_count,
      priorCount,
    })
  }

  // Show last 12 months with YoY data
  return result.slice(-12)
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

  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Year-over-year change in monthly tournament counts</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              formatter={(_value: any, _name: string, props: any) => {
                const d = props.payload as ChartPoint
                return [
                  `${d.yoyPct > 0 ? '+' : ''}${d.yoyPct.toFixed(1)}% (${d.count.toLocaleString()} vs ${d.priorCount.toLocaleString()})`,
                  'YoY Change',
                ]
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
            <Bar dataKey="yoyPct" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.yoyPct >= 0 ? '#22c55e' : '#ef4444'}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
