import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function MethodologyPanel() {
  return (
    <Card>
      <CardContent className="p-6">
        <details>
          <summary className="cursor-pointer text-lg font-semibold select-none">
            Methodology &amp; Data Sources
          </summary>

          <div className="mt-4 space-y-6 text-sm text-muted-foreground">
            {/* Health Score Formula */}
            <div>
              <h3 className="font-semibold text-foreground mb-2">Health Score Calculation</h3>
              <p className="mb-2">
                The composite health score (0-100) is computed from 6 weighted components using linear
                interpolation between empirically-set breakpoints:
              </p>
              <p className="font-mono text-xs bg-muted px-3 py-2 rounded-md">
                Composite = &Sigma;(component_score &times; weight)
              </p>
            </div>

            {/* Component Weights */}
            <div>
              <h3 className="font-semibold text-foreground mb-2">Components &amp; Weights</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium">Component</th>
                      <th className="pb-2 pr-4 font-medium text-right">Weight</th>
                      <th className="pb-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-medium text-foreground">Growth</td>
                      <td className="py-2 pr-4 text-right tabular-nums">25%</td>
                      <td className="py-2">Average of tournament count and player entry YoY % change</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-medium text-foreground">Attendance</td>
                      <td className="py-2 pr-4 text-right tabular-nums">20%</td>
                      <td className="py-2">Average players per tournament event</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-medium text-foreground">Retention</td>
                      <td className="py-2 pr-4 text-right tabular-nums">20%</td>
                      <td className="py-2">Percentage of prior-year players who competed again</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-medium text-foreground">Momentum</td>
                      <td className="py-2 pr-4 text-right tabular-nums">15%</td>
                      <td className="py-2">Average of last 3 months' event count YoY % change</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-medium text-foreground">Geographic Diversity</td>
                      <td className="py-2 pr-4 text-right tabular-nums">10%</td>
                      <td className="py-2">Blend of US concentration (inverted) and active country count</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium text-foreground">Youth</td>
                      <td className="py-2 pr-4 text-right tabular-nums">10%</td>
                      <td className="py-2">Percentage of active players under age 30</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Data Sources */}
            <div>
              <h3 className="font-semibold text-foreground mb-2">Data Sources</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Badge variant="default" className="mt-0.5 shrink-0 bg-emerald-600 hover:bg-emerald-600">High</Badge>
                  <span>
                    <strong className="text-foreground">Tournament &amp; event data</strong> - IFPA API calendar and results endpoints.
                    Direct counts with full historical coverage.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="default" className="mt-0.5 shrink-0 bg-emerald-600 hover:bg-emerald-600">High</Badge>
                  <span>
                    <strong className="text-foreground">WPPR rankings</strong> - IFPA API player rankings endpoint.
                    Official rankings updated regularly.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20">Moderate</Badge>
                  <span>
                    <strong className="text-foreground">Player demographics</strong> - IFPA API stats endpoint.
                    Age data is self-reported and incomplete for some players.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20">Moderate</Badge>
                  <span>
                    <strong className="text-foreground">Geographic distribution</strong> - IFPA API country stats.
                    Coverage is good but some regions may be underrepresented.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">Derived</Badge>
                  <span>
                    <strong className="text-foreground">Retention rate</strong> - Calculated by comparing unique player IDs across
                    consecutive years. Approximation based on available data.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">Derived</Badge>
                  <span>
                    <strong className="text-foreground">Forecast projections</strong> - Linear extrapolation from year-to-date
                    monthly event counts, adjusted for seasonal patterns.
                  </span>
                </li>
              </ul>
            </div>

            {/* Known Limitations */}
            <div>
              <h3 className="font-semibold text-foreground mb-2">Known Limitations</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>IFPA data only covers sanctioned events; unsanctioned leagues and casual play are not tracked.</li>
                <li>Player age demographics rely on self-reported data and may be incomplete.</li>
                <li>Retention calculations use a year-over-year window and may miss players who skip a year and return.</li>
                <li>Geographic data reflects IFPA-registered events, which skew heavily toward the United States.</li>
                <li>Forecast accuracy improves as more months of data become available in the current year.</li>
                <li>The health score breakpoints are calibrated to historical norms and may need periodic recalibration.</li>
              </ul>
            </div>

            {/* Score Bands */}
            <div>
              <h3 className="font-semibold text-foreground mb-2">Score Bands</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">80-100: Thriving</Badge>
                <Badge variant="default" className="bg-green-600 hover:bg-green-600">65-79: Healthy</Badge>
                <Badge variant="default" className="bg-amber-500 hover:bg-amber-500 text-black">50-64: Stable</Badge>
                <Badge variant="default" className="bg-orange-500 hover:bg-orange-500 text-black">35-49: Concerning</Badge>
                <Badge variant="destructive">0-34: Critical</Badge>
              </div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
