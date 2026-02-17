interface YearRow {
  year: number
  tournaments: number
  player_entries: number
  unique_players: number
  retention_rate: number
}

interface ProjectedRow {
  year: number
  ytd_tournaments: number
  projected_tournaments: number
  ci_low_tournaments: number
  ci_high_tournaments: number
  ytd_entries: number
  projected_entries: number
  months_of_data: number
}

interface YearTableProps {
  data: YearRow[]
  projected?: ProjectedRow | null
}

export function YearTable({ data, projected }: YearTableProps) {
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

          {/* Projected year row */}
          {projected && (
            <tr className="border-t border-border/50 text-muted-foreground">
              <td className="py-1.5 px-2 font-mono text-sm">
                {projected.year}
                <span className="text-[10px] ml-1 opacity-70">est.</span>
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right">
                <span title={`YTD actual: ${projected.ytd_tournaments.toLocaleString()}`}>
                  ~{projected.projected_tournaments.toLocaleString()}
                </span>
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right">
                <span title={`YTD actual: ${projected.ytd_entries.toLocaleString()}`}>
                  ~{projected.projected_entries.toLocaleString()}
                </span>
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right opacity-50">
                &mdash;
              </td>
              <td className="py-1.5 px-2 font-mono text-sm text-right opacity-50">
                &mdash;
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {projected && (
        <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-2">
          {projected.year} projected from {projected.months_of_data} months of data
          (range: {projected.ci_low_tournaments.toLocaleString()}&ndash;{projected.ci_high_tournaments.toLocaleString()} tournaments).
          Player data not yet available from IFPA.
        </p>
      )}
    </div>
  )
}
