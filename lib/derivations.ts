// ---------------------------------------------------------------------------
// Page-local derivations promoted to `lib/` because they deserve unit tests.
//
// Both functions operate over already-filtered "complete year" data — the
// caller (`app/page.tsx`) strips the current (partial) year before passing
// rows in, so these helpers don't re-do that filter.
// ---------------------------------------------------------------------------

/**
 * Subset of an `annual_snapshots` row needed to compute the lifecycle
 * waterfall. `returning_players` is nullable in the DB and the math silently
 * produces garbage when null → see `computeLifecycleData`'s null guard.
 */
export interface LifecycleYearRow {
  year: number
  unique_players: number
  returning_players: number | null
}

export interface LifecycleData {
  priorYear: number
  currentYear: number
  priorTotal: number
  churned: number
  newPlayers: number
  currentTotal: number
}

/**
 * Build the player lifecycle waterfall from the two most recent complete
 * years. Returns `null` when either year is missing OR when the current year
 * has no `returning_players` value (the DB allows `NULL`, and without it we
 * cannot compute churn or new-player counts).
 *
 * NOTE: `returning_players === 0` is a legitimate value (everyone new), so
 * the null check must be explicit — a `> 0` truthiness check would drop
 * that edge case.
 */
export function computeLifecycleData(
  priorYear: LifecycleYearRow | undefined,
  latestYear: LifecycleYearRow | undefined,
): LifecycleData | null {
  if (!priorYear || !latestYear) return null
  if (latestYear.returning_players === null) return null

  const returning = latestYear.returning_players
  return {
    priorYear: priorYear.year,
    currentYear: latestYear.year,
    priorTotal: priorYear.unique_players,
    churned: priorYear.unique_players - returning,
    newPlayers: latestYear.unique_players - returning,
    currentTotal: latestYear.unique_players,
  }
}

/**
 * Pre-aggregated row from the `country_growth_v` view — one row per country.
 * The view (see `supabase/migrations/005_country_growth_view.sql`) does the
 * grouping in SQL so the page never fetches raw `country_snapshots` rows.
 */
export interface CountryGrowthViewRow {
  country_name: string | null
  country_code: string | null
  first_active_players: number | null
  latest_active_players: number | null
  first_snapshot: string | null
  latest_snapshot: string | null
  snapshot_count: number | null
}

export interface CountryGrowthRow {
  country_name: string
  country_code: string
  active_players: number
  change: number | null
  change_pct: number | null
  first_snapshot: string
  latest_snapshot: string
}

/**
 * Normalize the pre-aggregated country-growth view rows into the dashboard's
 * shape. Countries with a single snapshot have `change` and `change_pct` set
 * to `null` — not "growth since we started tracking," but "insufficient data
 * to compute growth." Output is sorted by current `active_players` desc.
 */
export function computeCountryGrowthData(
  rows: readonly CountryGrowthViewRow[] | null | undefined,
): CountryGrowthRow[] {
  if (!rows || rows.length === 0) return []

  return rows
    .filter((r): r is CountryGrowthViewRow & {
      country_name: string
      latest_active_players: number
      latest_snapshot: string
      first_snapshot: string
    } =>
      r.country_name !== null &&
      r.latest_active_players !== null &&
      r.latest_snapshot !== null &&
      r.first_snapshot !== null,
    )
    .map((r) => {
      const hasMultiple = (r.snapshot_count ?? 1) > 1
      const first = r.first_active_players ?? r.latest_active_players
      const change = hasMultiple ? r.latest_active_players - first : null
      const changePct = hasMultiple && first > 0
        ? ((r.latest_active_players - first) / first) * 100
        : null

      return {
        country_name: r.country_name,
        country_code: r.country_code ?? '',
        active_players: r.latest_active_players,
        change,
        change_pct: changePct,
        first_snapshot: r.first_snapshot,
        latest_snapshot: r.latest_snapshot,
      }
    })
    .sort((a, b) => b.active_players - a.active_players)
}
