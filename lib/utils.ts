import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Numeric coercion for Supabase `numeric` columns.
//
// PostgREST serializes Postgres `numeric` / `numeric(p, s)` to JSON *strings*
// to preserve arbitrary precision — the JS client surfaces them as `string`
// regardless of the TS type. Every read of a `numeric` column runs through
// one of these helpers.
//
// Affected columns today:
//   annual_snapshots.retention_rate, .tournament_yoy_pct
//   monthly_event_counts.yoy_change_pct
//   forecasts.projected_tournaments, .projected_entries,
//            .ci_68_* / .ci_95_* (tournaments + entries)
//
// Integer columns (e.g. forecasts.projected_unique_players) come back as real
// numbers — do NOT wrap those; the helper still works but signals the wrong
// intent.
// ---------------------------------------------------------------------------

/**
 * Coerce a possibly-stringified numeric value to a number, with a fallback.
 *
 * Use when the caller has a sensible default (usually 0) and wants a number
 * unconditionally. For "missing means null" semantics, use `toNumOrNull`.
 */
export function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback
  if (v == null) return fallback
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Coerce a possibly-stringified numeric value to `number | null`.
 *
 * Returns null when the input is null/undefined or parses to NaN. Use when a
 * missing value must NOT be conflated with a real 0 (trend deltas, YoY %s).
 */
export function toNumOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (v == null) return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// isStale
//
// Staleness check for timestamp strings. Extracted to `lib/` so the caller
// (a Server Component that ISR-rebuilds once per hour) isn't flagged by the
// `react-hooks/purity` lint rule for calling `Date.now()` inside the render
// body. The helper is pure at the call site — `Date.now()` resolves when the
// Server Component rebuilds, which is the correct semantic.
// ---------------------------------------------------------------------------

export function isStale(completedAt: string | null | undefined, thresholdMs: number): boolean {
  if (!completedAt) return false
  return Date.now() - new Date(completedAt).getTime() > thresholdMs
}
