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
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'

interface DemographicsChartProps {
  data: {
    age_under_18_pct: number | null
    age_18_29_pct: number | null
    age_30_39_pct: number | null
    age_40_49_pct: number | null
    age_50_plus_pct: number | null
  } | null
}

const barColors = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8']

interface AgeGroupItem {
  label: string
  value: number
}

export function DemographicsChart({ data }: DemographicsChartProps) {
  if (!data) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">Demographics data unavailable</p>
        </CardContent>
      </Card>
    )
  }

  const groups: AgeGroupItem[] = [
    { label: 'Under 18', value: data.age_under_18_pct ?? 0 },
    { label: '18-29', value: data.age_18_29_pct ?? 0 },
    { label: '30-39', value: data.age_30_39_pct ?? 0 },
    { label: '40-49', value: data.age_40_49_pct ?? 0 },
    { label: '50+', value: data.age_50_plus_pct ?? 0 },
  ]

  const hasData = groups.some((g) => g.value > 0)

  if (!hasData) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">Demographics data unavailable</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={groups}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              domain={[0, 'auto']}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              className="text-xs fill-muted-foreground"
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Share']}
            />
            <Bar dataKey="value" name="Percentage" radius={[0, 4, 4, 0]}>
              {groups.map((_, idx) => (
                <Cell key={idx} fill={barColors[idx]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
