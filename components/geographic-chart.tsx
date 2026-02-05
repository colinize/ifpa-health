'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'

interface GeographicChartProps {
  data: Array<{
    country_name: string
    active_players: number
    pct_of_total: number | null
  }>
}

export function GeographicChart({ data }: GeographicChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">Geographic data unavailable</p>
        </CardContent>
      </Card>
    )
  }

  // Take top 10 by active players
  const top10 = [...data]
    .sort((a, b) => b.active_players - a.active_players)
    .slice(0, 10)
    // Reverse so largest is at top in horizontal layout
    .reverse()

  // Calculate widest country name for YAxis width
  const maxLabelLength = Math.max(...top10.map((d) => d.country_name.length))
  const yAxisWidth = Math.min(Math.max(maxLabelLength * 7, 80), 140)

  return (
    <Card>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <YAxis
              type="category"
              dataKey="country_name"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              width={yAxisWidth}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              formatter={(value: any, _name: string, props: any) => {
                const num = Number(value)
                const pct = props?.payload?.pct_of_total
                const label = pct != null ? `${num.toLocaleString()} (${Number(pct).toFixed(1)}%)` : num.toLocaleString()
                return [label, 'Active Players']
              }}
            />
            <Bar
              dataKey="active_players"
              name="Active Players"
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
