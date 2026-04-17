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
 * Minimal row shape consumed by `computeCountryGrowthData`. Matches the
 * `.select()` projection in `app/page.tsx`.
 */
export interface CountrySnapshotRow {
  snapshot_date: string
  country_name: string
  country_code: string | null
  active_players: number
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
 * Collapse per-country snapshot history into one row per country describing
 * the change from first observed snapshot to latest. Countries with a single
 * snapshot have `change` and `change_pct` set to `null` — not "growth since
 * we started tracking," but "insufficient data to compute growth."
 *
 * Input must be sorted ascending by `snapshot_date` (the page query does
 * this). Sorted output is by `active_players` descending.
 */
export function computeCountryGrowthData(
  snapshots: readonly CountrySnapshotRow[] | null | undefined,
): CountryGrowthRow[] {
  if (!snapshots || snapshots.length === 0) return []

  const byCountry = new Map<string, CountrySnapshotRow[]>()
  for (const s of snapshots) {
    const list = byCountry.get(s.country_name) ?? []
    list.push(s)
    byCountry.set(s.country_name, list)
  }

  return Array.from(byCountry.entries())
    .map(([name, rows]) => {
      const first = rows[0]
      const latest = rows[rows.length - 1]
      const hasMultiple = rows.length > 1
      const change = hasMultiple ? latest.active_players - first.active_players : null
      const changePct = hasMultiple && first.active_players > 0
        ? ((latest.active_players - first.active_players) / first.active_players) * 100
        : null

      return {
        country_name: name,
        country_code: latest.country_code ?? '',
        active_players: latest.active_players,
        change,
        change_pct: changePct,
        first_snapshot: first.snapshot_date,
        latest_snapshot: latest.snapshot_date,
      }
    })
    .sort((a, b) => b.active_players - a.active_players)
}
