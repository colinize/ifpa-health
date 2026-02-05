import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WPPRRanking {
  wppr_rank: number
  first_name: string
  last_name: string
  wppr_points: number
  active_events: number
  country_name: string
}

interface WPPRTableProps {
  rankings: WPPRRanking[]
}

export function WPPRTable({ rankings }: WPPRTableProps) {
  if (!rankings || rankings.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center">No data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>World Pinball Player Rankings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-4 font-medium text-muted-foreground w-16">Rank</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Player</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Points</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Events</th>
                <th className="pb-2 font-medium text-muted-foreground">Country</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((player) => (
                <tr key={player.wppr_rank} className="border-b last:border-0">
                  <td className="py-2 pr-4 tabular-nums text-muted-foreground">{player.wppr_rank}</td>
                  <td className="py-2 pr-4 font-medium">
                    {player.first_name} {player.last_name}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {Number(player.wppr_points).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{player.active_events}</td>
                  <td className="py-2 text-muted-foreground">{player.country_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
