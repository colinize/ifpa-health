'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'

interface RetentionChartProps {
  data: Array<{
    year: number
    unique_players: number
    returning_players: number | null
    new_players: number | null
    retention_rate: number | null
  }>
}

export function RetentionChart({ data }: RetentionChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No retention data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
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
                const num = Number(value)
                if (name === 'Retention Rate') return [`${num.toFixed(1)}%`, name]
                return [num.toLocaleString(), name]
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="returning_players"
              name="Returning Players"
              stackId="players"
              fill="#3b82f6"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="new_players"
              name="New Players"
              stackId="players"
              fill="#a855f7"
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="retention_rate"
              name="Retention Rate"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
