// ---------------------------------------------------------------------------
// Monthly Collector — runs weekly (Monday 9am UTC)
// For each month of the current year and the prior year, calls the IFPA
// tournament search API to get event counts, computes YoY change, and
// upserts into monthly_event_counts.
// ---------------------------------------------------------------------------

import { ifpaClient } from '@/lib/ifpa-client'
import { createServiceClient } from '@/lib/supabase'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runMonthlyCollection(): Promise<{
  records_affected: number
  details: Record<string, unknown>
}> {
  const supabase = createServiceClient()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  let records = 0

  // Collect raw event counts for current year and prior year
  // Store them in a map keyed by "year-month" for cross-referencing
  const countMap = new Map<string, number>()

  for (const year of [currentYear - 1, currentYear]) {
    const maxMonth = year === currentYear ? currentMonth : 12

    for (let month = 1; month <= maxMonth; month++) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]

      try {
        const result = await ifpaClient.searchTournaments(startDate, endDate)
        const eventCount = parseInt(result.total_results, 10) || 0
        countMap.set(`${year}-${month}`, eventCount)
      } catch (err) {
        console.error(`Failed to fetch tournaments for ${year}-${month}:`, err)
        // Continue with other months rather than failing entirely
      }

      // Be respectful of rate limits
      await delay(100)
    }
  }

  // Build upsert rows with YoY calculations
  const rows: Array<{
    year: number
    month: number
    event_count: number
    prior_year_event_count: number | null
    yoy_change_pct: number | null
  }> = []

  for (const [key, eventCount] of countMap) {
    const [yearStr, monthStr] = key.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)

    const priorYearCount = countMap.get(`${year - 1}-${month}`) ?? null

    let yoy_change_pct: number | null = null
    if (priorYearCount != null && priorYearCount > 0) {
      yoy_change_pct = parseFloat(
        (((eventCount - priorYearCount) / priorYearCount) * 100).toFixed(1)
      )
    }

    rows.push({
      year,
      month,
      event_count: eventCount,
      prior_year_event_count: priorYearCount,
      yoy_change_pct,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('monthly_event_counts')
      .upsert(rows, { onConflict: 'year,month' })

    if (error) {
      console.error('Failed to upsert monthly event counts:', error.message)
    } else {
      records = rows.length
    }
  }

  return {
    records_affected: records,
    details: {
      months_collected: rows.length,
      current_year: currentYear,
      prior_year: currentYear - 1,
    },
  }
}
