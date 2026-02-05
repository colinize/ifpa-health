/**
 * Seasonal Ratio Extrapolation Forecasting System
 *
 * Method: Each month historically accounts for a certain percentage of the
 * annual total. If January historically represents ~7.5% of annual tournaments,
 * and we have 861 tournaments in January 2026, then the projected annual total
 * is 861 / 0.075 = 11,480.
 *
 * Display rules:
 * - Don't show forecast until 2+ months of data exist
 * - Always show "Based on N months of data" qualifier
 * - 68% CI (shaded) and 95% CI (faint shaded) bands
 * - Overlay actual YTD progress
 *
 * All functions are pure -- no database calls. Everything is exported for testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForecastResult {
  target_year: number
  months_of_data: number
  projected_tournaments: number
  projected_entries: number
  ci_68_low_tournaments: number
  ci_68_high_tournaments: number
  ci_95_low_tournaments: number
  ci_95_high_tournaments: number
  ci_68_low_entries: number
  ci_68_high_entries: number
  ci_95_low_entries: number
  ci_95_high_entries: number
  method: 'seasonal_ratio'
  trend_reference: TrendReference | null
}

export interface TrendReference {
  slope: number
  intercept: number
  r_squared: number
  projected_value: number // what the linear trend predicts for target_year
}

export interface AnnualData {
  year: number
  tournaments: number
  entries: number
}

export interface MonthlyData {
  year: number
  month: number // 1-12
  event_count: number
}

export interface MonthlyWeights {
  tournament_weights: number[] // length 12, index 0 = January
  entry_weights: number[]     // length 12, index 0 = January
  weight_std: number[]        // std dev of tournament weights across ref years
}

// Default reference years -- skip 2020-2021 due to COVID distortion
const DEFAULT_REFERENCE_YEARS = [2019, 2022, 2023, 2024, 2025]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Build a lookup: year -> number[12] of monthly event counts.
 */
function buildMonthlyLookup(monthlyData: MonthlyData[]): Map<number, number[]> {
  const lookup = new Map<number, number[]>()
  for (const d of monthlyData) {
    if (!lookup.has(d.year)) {
      lookup.set(d.year, new Array(12).fill(0))
    }
    lookup.get(d.year)![d.month - 1] += d.event_count
  }
  return lookup
}

/**
 * Build a lookup: year -> AnnualData.
 */
function buildAnnualLookup(annualData: AnnualData[]): Map<number, AnnualData> {
  const lookup = new Map<number, AnnualData>()
  for (const d of annualData) {
    lookup.set(d.year, d)
  }
  return lookup
}

// ---------------------------------------------------------------------------
// computeMonthlyWeights
// ---------------------------------------------------------------------------

/**
 * For each reference year, compute the fraction of the annual total that
 * occurred in each month. Average across reference years to get the expected
 * monthly weight. Also compute std dev of each month's weight across years
 * (used downstream for confidence intervals).
 *
 * @param annualData      Full-year totals per year
 * @param monthlyData     Per-month event counts (tournament counts)
 * @param referenceYears  Which years to use; defaults to [2019, 2022, 2023, 2024, 2025]
 */
export function computeMonthlyWeights(
  annualData: AnnualData[],
  monthlyData: MonthlyData[],
  referenceYears: number[] = DEFAULT_REFERENCE_YEARS
): MonthlyWeights {
  const annualByYear = buildAnnualLookup(annualData)
  const monthlyByYear = buildMonthlyLookup(monthlyData)

  // For each month, collect the fraction across reference years
  // tournamentFractions[monthIndex] = array of fractions, one per ref year
  const tournamentFractions: number[][] = Array.from({ length: 12 }, () => [])
  const entryFractions: number[][] = Array.from({ length: 12 }, () => [])

  for (const year of referenceYears) {
    const annual = annualByYear.get(year)
    const monthly = monthlyByYear.get(year)
    if (!annual || !monthly) continue
    if (annual.tournaments === 0) continue

    for (let m = 0; m < 12; m++) {
      const tournFrac = monthly[m] / annual.tournaments
      tournamentFractions[m].push(tournFrac)

      // Entry weights use the same seasonal shape as tournaments. In practice,
      // the monthly distribution of entries closely mirrors that of tournaments
      // because more tournaments in a month means more entries. If separate
      // monthly entry counts are available, the caller can pass them via a
      // second monthlyData array and call this function twice.
      const entryFrac = annual.entries > 0 ? monthly[m] / annual.tournaments : 0
      entryFractions[m].push(entryFrac)
    }
  }

  const tournament_weights = tournamentFractions.map((fracs) => mean(fracs))
  const entry_weights = entryFractions.map((fracs) => mean(fracs))
  const weight_std = tournamentFractions.map((fracs) => stddev(fracs))

  return { tournament_weights, entry_weights, weight_std }
}

// ---------------------------------------------------------------------------
// computeForecast
// ---------------------------------------------------------------------------

/**
 * Project the annual total from year-to-date actuals using seasonal weights.
 *
 * Steps:
 * 1. Sum the weights for months 1..completedMonths -> cumulative_weight
 * 2. projected_annual = ytd_actual / cumulative_weight
 * 3. Confidence intervals via historical back-testing:
 *    - For each reference year, reconstruct the YTD at `completedMonths` from
 *      monthlyData, project the annual total using the same weights, then
 *      compute the ratio: actual_annual / projected_at_this_point
 *    - 68% CI = mean +/- 1 std dev of this ratio, applied to the projection
 *    - 95% CI = mean +/- 2 std dev
 * 4. If completedMonths < 2, return zeroed-out projections (too early).
 *
 * @param ytdTournaments  Total tournaments so far in target_year
 * @param ytdEntries      Total entries so far in target_year
 * @param completedMonths How many full months of data we have (1-12)
 * @param monthlyWeights  Output of computeMonthlyWeights
 * @param annualData      Historical annual totals (used for back-testing CI)
 * @param monthlyData     Historical monthly data (used to reconstruct YTD per year for CI)
 * @param targetYear      The year we are forecasting
 */
export function computeForecast(
  ytdTournaments: number,
  ytdEntries: number,
  completedMonths: number,
  monthlyWeights: MonthlyWeights,
  annualData: AnnualData[],
  monthlyData: MonthlyData[],
  targetYear: number
): ForecastResult {
  const emptyResult: ForecastResult = {
    target_year: targetYear,
    months_of_data: completedMonths,
    projected_tournaments: 0,
    projected_entries: 0,
    ci_68_low_tournaments: 0,
    ci_68_high_tournaments: 0,
    ci_95_low_tournaments: 0,
    ci_95_high_tournaments: 0,
    ci_68_low_entries: 0,
    ci_68_high_entries: 0,
    ci_95_low_entries: 0,
    ci_95_high_entries: 0,
    method: 'seasonal_ratio',
    trend_reference: null,
  }

  // Don't forecast with fewer than 2 months of data
  if (completedMonths < 2) {
    return emptyResult
  }

  // Cumulative weight for completed months
  const cumulativeTournamentWeight = monthlyWeights.tournament_weights
    .slice(0, completedMonths)
    .reduce((sum, w) => sum + w, 0)

  const cumulativeEntryWeight = monthlyWeights.entry_weights
    .slice(0, completedMonths)
    .reduce((sum, w) => sum + w, 0)

  // Guard against zero/near-zero cumulative weight
  if (cumulativeTournamentWeight < 0.001 || cumulativeEntryWeight < 0.001) {
    return emptyResult
  }

  const projectedTournaments = ytdTournaments / cumulativeTournamentWeight
  const projectedEntries = ytdEntries / cumulativeEntryWeight

  // -----------------------------------------------------------------------
  // Confidence intervals via historical back-testing
  //
  // For each historical reference year (non-COVID, not the target year):
  //   1. Reconstruct what the YTD total was at `completedMonths`
  //   2. Project the annual total using the same seasonal weights
  //   3. Compute the ratio: actual_annual / projected_annual
  // The distribution of these ratios quantifies our model error.
  // -----------------------------------------------------------------------

  const annualByYear = buildAnnualLookup(annualData)
  const monthlyByYear = buildMonthlyLookup(monthlyData)

  const backTestYears = annualData
    .map((d) => d.year)
    .filter((y) => y !== 2020 && y !== 2021 && y !== targetYear)

  const tournamentRatios: number[] = []
  const entryRatios: number[] = []

  for (const year of backTestYears) {
    const annual = annualByYear.get(year)
    const monthly = monthlyByYear.get(year)
    if (!annual || !monthly || annual.tournaments === 0) continue

    // Reconstruct YTD for this historical year at the same point
    const ytdHistorical = monthly
      .slice(0, completedMonths)
      .reduce((sum, count) => sum + count, 0)

    if (ytdHistorical === 0) continue

    // What would we have projected from this YTD using the averaged weights?
    const projectedHistorical = ytdHistorical / cumulativeTournamentWeight

    // Ratio of what actually happened to what we would have projected
    const ratio = annual.tournaments / projectedHistorical
    tournamentRatios.push(ratio)

    // Same for entries (using tournament weights as proxy for seasonal shape)
    if (annual.entries > 0) {
      const projectedHistoricalEntries = ytdHistorical / cumulativeEntryWeight
      const entryRatio = annual.entries / projectedHistoricalEntries
      entryRatios.push(entryRatio)
    }
  }

  // Compute CI from back-test ratios
  let ci68LowTournaments: number
  let ci68HighTournaments: number
  let ci95LowTournaments: number
  let ci95HighTournaments: number
  let ci68LowEntries: number
  let ci68HighEntries: number
  let ci95LowEntries: number
  let ci95HighEntries: number

  if (tournamentRatios.length >= 2) {
    // Back-test based CI: apply ratio distribution to our projection
    const ratioMean = mean(tournamentRatios)
    const ratioStd = stddev(tournamentRatios)

    ci68LowTournaments = Math.round(projectedTournaments * (ratioMean - ratioStd))
    ci68HighTournaments = Math.round(projectedTournaments * (ratioMean + ratioStd))
    ci95LowTournaments = Math.round(projectedTournaments * (ratioMean - 2 * ratioStd))
    ci95HighTournaments = Math.round(projectedTournaments * (ratioMean + 2 * ratioStd))
  } else {
    // Fallback: weight-based CI when insufficient back-test data
    const cumulativeWeightStd = Math.sqrt(
      monthlyWeights.weight_std
        .slice(0, completedMonths)
        .reduce((sum, s) => sum + s * s, 0)
    )
    const relativeUncertainty = cumulativeWeightStd / cumulativeTournamentWeight

    ci68LowTournaments = Math.round(projectedTournaments * (1 - relativeUncertainty))
    ci68HighTournaments = Math.round(projectedTournaments * (1 + relativeUncertainty))
    ci95LowTournaments = Math.round(projectedTournaments * (1 - 2 * relativeUncertainty))
    ci95HighTournaments = Math.round(projectedTournaments * (1 + 2 * relativeUncertainty))
  }

  if (entryRatios.length >= 2) {
    const entryRatioMean = mean(entryRatios)
    const entryRatioStd = stddev(entryRatios)

    ci68LowEntries = Math.round(projectedEntries * (entryRatioMean - entryRatioStd))
    ci68HighEntries = Math.round(projectedEntries * (entryRatioMean + entryRatioStd))
    ci95LowEntries = Math.round(projectedEntries * (entryRatioMean - 2 * entryRatioStd))
    ci95HighEntries = Math.round(projectedEntries * (entryRatioMean + 2 * entryRatioStd))
  } else {
    // Fallback: same relative uncertainty as tournaments
    const cumulativeWeightStd = Math.sqrt(
      monthlyWeights.weight_std
        .slice(0, completedMonths)
        .reduce((sum, s) => sum + s * s, 0)
    )
    const relativeUncertainty = cumulativeWeightStd / cumulativeTournamentWeight

    ci68LowEntries = Math.round(projectedEntries * (1 - relativeUncertainty))
    ci68HighEntries = Math.round(projectedEntries * (1 + relativeUncertainty))
    ci95LowEntries = Math.round(projectedEntries * (1 - 2 * relativeUncertainty))
    ci95HighEntries = Math.round(projectedEntries * (1 + 2 * relativeUncertainty))
  }

  // Compute trend reference for context
  const trendRef = computeTrendLine(annualData, 'tournaments', targetYear)

  return {
    target_year: targetYear,
    months_of_data: completedMonths,
    projected_tournaments: Math.round(projectedTournaments),
    projected_entries: Math.round(projectedEntries),
    ci_68_low_tournaments: ci68LowTournaments,
    ci_68_high_tournaments: ci68HighTournaments,
    ci_95_low_tournaments: ci95LowTournaments,
    ci_95_high_tournaments: ci95HighTournaments,
    ci_68_low_entries: ci68LowEntries,
    ci_68_high_entries: ci68HighEntries,
    ci_95_low_entries: ci95LowEntries,
    ci_95_high_entries: ci95HighEntries,
    method: 'seasonal_ratio',
    trend_reference: trendRef,
  }
}

// ---------------------------------------------------------------------------
// computeTrendLine
// ---------------------------------------------------------------------------

/**
 * Simple linear regression on the last 4 non-COVID years (skip 2020-2021).
 * Returns slope, intercept, r_squared, and projected value for target_year.
 *
 * @param annualData  Historical annual totals
 * @param metric      Which metric to regress: 'tournaments' or 'entries'
 * @param targetYear  Year to project to
 */
export function computeTrendLine(
  annualData: AnnualData[],
  metric: 'tournaments' | 'entries',
  targetYear: number
): TrendReference {
  // Filter out COVID years and sort descending, then take the most recent 4
  const eligible = annualData
    .filter((d) => d.year !== 2020 && d.year !== 2021)
    .sort((a, b) => b.year - a.year)
    .slice(0, 4)
    .sort((a, b) => a.year - b.year) // re-sort ascending for regression

  if (eligible.length < 2) {
    return { slope: 0, intercept: 0, r_squared: 0, projected_value: 0 }
  }

  const xs = eligible.map((d) => d.year)
  const ys = eligible.map((d) => d[metric])

  const n = xs.length
  const xMean = mean(xs)
  const yMean = mean(ys)

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - xMean) * (ys[i] - yMean)
    denominator += (xs[i] - xMean) ** 2
  }

  const slope = denominator !== 0 ? numerator / denominator : 0
  const intercept = yMean - slope * xMean

  // R-squared
  const ssRes = ys.reduce((sum, y, i) => {
    const predicted = slope * xs[i] + intercept
    return sum + (y - predicted) ** 2
  }, 0)
  const ssTot = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0)
  const r_squared = ssTot !== 0 ? 1 - ssRes / ssTot : 0

  const projected_value = Math.round(slope * targetYear + intercept)

  return { slope, intercept, r_squared, projected_value }
}
