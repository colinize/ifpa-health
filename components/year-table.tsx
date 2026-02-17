interface YearTableProps {
  data: Array<{
    year: number
    tournaments: number
    player_entries: number
    unique_players: number
    retention_rate: number
  }>
}

export function YearTable({ data }: YearTableProps) {
  const sorted = data.slice().sort((a, b) => a.year - b.year)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs md:text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-2 px-2 font-medium">Year</th>
            <th className="text-right py-2 px-2 font-medium">Tournaments</th>
            <th className="text-right py-2 px-2 font-medium">Entries</th>
            <th className="text-right py-2 px-2 font-medium">Unique Players</th>
            <th className="text-right py-2 px-2 font-medium">Retention</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.year}
              className={i % 2 === 1 ? 'bg-muted/30' : ''}
            >
              <td className="py-1.5 px-2 font-mono text-sm">{row.year}</td>
              <td className="py-1.5 px-2 font-mono text-sm text-right">
                {row.tournaments.toLocaleString()}
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right">
                {row.player_entries.toLocaleString()}
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right">
                {row.unique_players.toLocaleString()}
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right">
                {row.retention_rate.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
