// ---------------------------------------------------------------------------
// Health Scorer — runs daily after data collection
// Reads latest data from Supabase, computes the composite health score
// using the active methodology, stores the result. Also computes shadow
// scores for all methodology versions.
// ---------------------------------------------------------------------------

import { computeHealthScore, type HealthScoreInput } from '@/lib/health-score'
import { createServiceClient } from '@/lib/supabase'

export async function runHealthScorer(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()
  let records = 0

  // ---- 1. Get latest annual snapshot for the most recent year ---------------

  const { data: annualRow } = await supabase
    .from('annual_snapshots')
    .select('*')
    .order('year', { ascending: false })
    .limit(1)
    .single()

  // ---- 2. Get last 3 months from monthly_event_counts for momentum ---------

  const { data: recentMonths } = await supabase
    .from('monthly_event_counts')
    .select('year, month, yoy_change_pct')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(3)

  const monthlyMomentum: number[] = (recentMonths ?? [])
    .filter((m) => m.yoy_change_pct != null)
    .map((m) => parseFloat(String(m.yoy_change_pct)))

  // ---- 3. Get latest country snapshots for diversity -----------------------

  const { data: latestCountryDate } = await supabase
    .from('country_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  let usConcentrationPct = 70 // fallback
  let countryCount = 0

  if (latestCountryDate) {
    const { data: countryRows } = await supabase
      .from('country_snapshots')
      .select('country_name, pct_of_total')
      .eq('snapshot_date', latestCountryDate.snapshot_date)

    if (countryRows) {
      countryCount = countryRows.length
      const usRow = countryRows.find(
        (c) =>
          c.country_name === 'United States' ||
          c.country_name === 'USA' ||
          c.country_name === 'US'
      )
      if (usRow) {
        usConcentrationPct = parseFloat(String(usRow.pct_of_total))
      }
    }
  }

  // ---- 4. Get latest overall stats snapshot for youth % --------------------

  const { data: overallRow } = await supabase
    .from('overall_stats_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  // Youth % = under 18 + 18-29 age groups
  let youthPct = 0
  if (overallRow) {
    const under18 = overallRow.age_under_18_pct
      ? parseFloat(String(overallRow.age_under_18_pct))
      : 0
    const age18_29 = overallRow.age_18_29_pct
      ? parseFloat(String(overallRow.age_18_29_pct))
      : 0
    youthPct = under18 + age18_29
  }

  // ---- 5. Build HealthScoreInput -------------------------------------------

  const input: HealthScoreInput = {
    tournament_yoy_pct: annualRow?.tournament_yoy_pct
      ? parseFloat(String(annualRow.tournament_yoy_pct))
      : 0,
    entry_yoy_pct: annualRow?.entry_yoy_pct
      ? parseFloat(String(annualRow.entry_yoy_pct))
      : 0,
    avg_attendance: annualRow?.avg_attendance
      ? parseFloat(String(annualRow.avg_attendance))
      : 0,
    retention_rate: annualRow?.retention_rate
      ? parseFloat(String(annualRow.retention_rate))
      : 0,
    monthly_momentum: monthlyMomentum,
    us_concentration_pct: usConcentrationPct,
    country_count: countryCount,
    youth_pct: youthPct,
  }

  // ---- 6. Get active methodology version -----------------------------------

  const { data: methodology } = await supabase
    .from('methodology_versions')
    .select('*')
    .eq('is_active', true)
    .single()

  const breakpointsForCompute = methodology?.breakpoints
    ? Object.fromEntries(
        Object.entries(methodology.breakpoints as Record<string, { points: [number, number][] }>).map(
          ([k, v]) => [k, v.points]
        )
      )
    : undefined

  const result = computeHealthScore(
    input,
    methodology?.version_number ?? 1,
    methodology?.weights as Record<string, number> | undefined,
    breakpointsForCompute
  )

  // ---- 7. Upsert into health_scores ---------------------------------------

  const { error: scoreError } = await supabase
    .from('health_scores')
    .upsert(
      {
        score_date: today,
        composite_score: result.composite_score,
        band: result.band,
        components: result.components,
        sensitivity: result.sensitivity,
        methodology_version: result.methodology_version,
      },
      { onConflict: 'score_date' }
    )

  if (scoreError) {
    console.error('Failed to upsert health score:', scoreError.message)
  } else {
    records += 1
  }

  // ---- 8. Shadow scores for ALL methodology versions -----------------------

  const { data: allVersions } = await supabase
    .from('methodology_versions')
    .select('*')

  let shadowCount = 0

  for (const version of allVersions ?? []) {
    const versionBreakpoints = version.breakpoints
      ? Object.fromEntries(
          Object.entries(version.breakpoints as Record<string, { points: [number, number][] }>).map(
            ([k, v]) => [k, v.points]
          )
        )
      : undefined

    const shadowResult = computeHealthScore(
      input,
      version.version_number,
      version.weights as Record<string, number> | undefined,
      versionBreakpoints
    )

    const { error: shadowError } = await supabase
      .from('shadow_scores')
      .upsert(
        {
          score_date: today,
          methodology_version: version.version_number,
          composite_score: shadowResult.composite_score,
          component_scores: shadowResult.components,
        },
        { onConflict: 'score_date,methodology_version' }
      )

    if (shadowError) {
      console.error(
        `Failed to upsert shadow score for v${version.version_number}:`,
        shadowError.message
      )
    } else {
      shadowCount += 1
      records += 1
    }
  }

  return {
    records_affected: records,
    details: {
      score_date: today,
      composite_score: result.composite_score,
      band: result.band,
      methodology_version: result.methodology_version,
      shadow_versions_scored: shadowCount,
      input_summary: {
        tournament_yoy_pct: input.tournament_yoy_pct,
        entry_yoy_pct: input.entry_yoy_pct,
        avg_attendance: input.avg_attendance,
        retention_rate: input.retention_rate,
        monthly_momentum_count: input.monthly_momentum.length,
        us_concentration_pct: input.us_concentration_pct,
        country_count: input.country_count,
        youth_pct: input.youth_pct,
      },
    },
  }
}
