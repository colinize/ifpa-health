// lib/types.ts
// App-level types bridging Supabase's generic `Json` typing and the concrete
// shapes that flow through the code. Import these when reading from or writing
// to a jsonb column so the compiler can help instead of hand-waving.
//
// Keep in sync with:
// - `collection_runs.details`      — populated by the two cron routes
// - `health_scores.components`     — `HealthScoreResult['components']`
// - `forecasts.trend_reference`    — `ForecastResult['trend_reference']`

import type { ComponentScore } from '@/lib/health-score'
import type { TrendReference } from '@/lib/forecast'
import type { Database } from '@/lib/database.types'

// ---------------------------------------------------------------------------
// Row aliases (shorter to read than Database['public']['Tables'][...]['Row'])
// ---------------------------------------------------------------------------

type Tables = Database['public']['Tables']

export type AnnualSnapshot = Tables['annual_snapshots']['Row']
export type MonthlyEventCount = Tables['monthly_event_counts']['Row']
export type CountrySnapshot = Tables['country_snapshots']['Row']
export type OverallStatsSnapshot = Tables['overall_stats_snapshots']['Row']
export type WpprRanking = Tables['wppr_rankings']['Row']
export type HealthScoreRow = Tables['health_scores']['Row']
export type ForecastRow = Tables['forecasts']['Row']
export type Observation = Tables['observations']['Row']
export type MethodologyVersion = Tables['methodology_versions']['Row']
export type ShadowScore = Tables['shadow_scores']['Row']
export type CollectionRun = Tables['collection_runs']['Row']

// ---------------------------------------------------------------------------
// jsonb shapes
// ---------------------------------------------------------------------------

/**
 * `collection_runs.details` — written by the cron routes. Each cron groups its
 * collectors' own `details` bags by key.
 */
export interface CollectionRunDetails {
  [collector: string]: Record<string, unknown> | undefined
}

/** `health_scores.components` — three-pillar score breakdown. */
export type HealthScoreComponents = Record<string, ComponentScore>

/** `forecasts.trend_reference` — null when forecast isn't trend-bounded. */
export type ForecastTrendReference = TrendReference | null
