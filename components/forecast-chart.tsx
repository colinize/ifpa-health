'use client'

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ForecastChartProps {
  forecast: {
    target_year: number
    months_of_data: number
    projected_tournaments: number
    ci_68_low_tournaments: number
    ci_68_high_tournaments: number
    ci_95_low_tournaments: number
    ci_95_high_tournaments: number
    trend_reference: { projected_value: number } | null
  }
  annualData: Array<{ year: number; tournaments: number }>
}

interface ChartDataPoint {
  year: number
  actual: number | null
  projected: number | null
  ci68: [number, number] | null
  ci95: [number, number] | null
  trendRef: number | null
}

export function ForecastChart({ forecast, annualData }: ForecastChartProps) {
  if (!forecast || !annualData || annualData.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No forecast data available</p>
        </CardContent>
      </Card>
    )
  }

  // Use last 5 years of historical data
  const recentYears = annualData
    .filter((d) => d.year < forecast.target_year)
    .slice(-5)

  const chartData: ChartDataPoint[] = [
    ...recentYears.map((d) => ({
      year: d.year,
      actual: d.tournaments,
      projected: null,
      ci68: null,
      ci95: null,
      trendRef: null,
    })),
    {
      year: forecast.target_year,
      actual: null,
      projected: forecast.projected_tournaments,
      ci68: [forecast.ci_68_low_tournaments, forecast.ci_68_high_tournaments],
      ci95: [forecast.ci_95_low_tournaments, forecast.ci_95_high_tournaments],
      trendRef: forecast.trend_reference?.projected_value ?? null,
    },
  ]

  // For the area bands, we need flat values for Recharts
  const flatData = chartData.map((d) => ({
    year: d.year,
    actual: d.actual,
    projected: d.projected,
    ci68Low: d.ci68?.[0] ?? null,
    ci68High: d.ci68?.[1] ?? null,
    ci95Low: d.ci95?.[0] ?? null,
    ci95High: d.ci95?.[1] ?? null,
    trendRef: d.trendRef,
  }))

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Based on {forecast.months_of_data} month{forecast.months_of_data !== 1 ? 's' : ''} of data</Badge>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={flatData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              tickFormatter={(v: number) => v.toLocaleString()}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(value: any, name: string) => {
                if (value == null) return ['N/A', name]
                return [Math.round(Number(value)).toLocaleString(), name]
              }}
            />
            <Legend />
            {/* 95% CI band */}
            <Area
              dataKey="ci95High"
              name="95% CI Upper"
              stroke="none"
              fill="#06b6d4"
              fillOpacity={0.1}
              connectNulls={false}
              legendType="none"
            />
            <Area
              dataKey="ci95Low"
              name="95% CI Lower"
              stroke="none"
              fill="#ffffff"
              fillOpacity={0.8}
              connectNulls={false}
              legendType="none"
            />
            {/* 68% CI band */}
            <Area
              dataKey="ci68High"
              name="68% CI Upper"
              stroke="none"
              fill="#06b6d4"
              fillOpacity={0.2}
              connectNulls={false}
              legendType="none"
            />
            <Area
              dataKey="ci68Low"
              name="68% CI Lower"
              stroke="none"
              fill="#ffffff"
              fillOpacity={0.8}
              connectNulls={false}
              legendType="none"
            />
            {/* Historical actual line */}
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4, fill: '#3b82f6' }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
            {/* Projected point */}
            <Line
              type="monotone"
              dataKey="projected"
              name="Projected"
              stroke="#06b6d4"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 6, fill: '#06b6d4', strokeWidth: 2 }}
              connectNulls={false}
            />
            {/* Trend reference */}
            <Line
              type="monotone"
              dataKey="trendRef"
              name="Trend Reference"
              stroke="#6b7280"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={{ r: 4, fill: '#6b7280' }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
