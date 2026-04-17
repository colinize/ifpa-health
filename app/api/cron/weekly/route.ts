import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyBearer } from '@/lib/auth'
import { sanitizeErrorMessage } from '@/lib/sanitize'
import { runAnnualCollection } from '@/lib/collectors/annual-collector'
import { runMonthlyCollection } from '@/lib/collectors/monthly-collector'
import { runCountryCollection } from '@/lib/collectors/country-collector'
import type { Json } from '@/lib/database.types'
import type { CollectionRunDetails } from '@/lib/types'

export async function GET(request: NextRequest) {
  // Constant-time CRON_SECRET check (see lib/auth.ts).
  if (!verifyBearer(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startedAt = new Date().toISOString()

  // Insert collection_runs record with status 'running'
  const { data: run } = await supabase
    .from('collection_runs')
    .insert({ run_type: 'weekly', status: 'running', started_at: startedAt })
    .select()
    .single()

  // Run collectors independently so one failure doesn't block the others
  const errors: string[] = []

  // Collector errors are sanitized before touching `details` or
  // `error_message` — those surfaces are anon-readable via RLS, so raw
  // messages could leak an `api_key=...` fragment or stray bearer token.
  const annualResult = await runAnnualCollection().catch((e: Error) => {
    const msg = sanitizeErrorMessage(e)
    errors.push(`annual: ${msg}`)
    return { records_affected: 0, details: { error: msg } }
  })

  const monthlyResult = await runMonthlyCollection().catch((e: Error) => {
    const msg = sanitizeErrorMessage(e)
    errors.push(`monthly: ${msg}`)
    return { records_affected: 0, details: { error: msg } }
  })

  const countryResult = await runCountryCollection().catch((e: Error) => {
    const msg = sanitizeErrorMessage(e)
    errors.push(`country: ${msg}`)
    return { records_affected: 0, details: { error: msg } }
  })

  const totalRecords =
    annualResult.records_affected +
    monthlyResult.records_affected +
    countryResult.records_affected

  const status = errors.length === 0 ? 'success' : errors.length === 3 ? 'error' : 'partial'

  // `details` is typed `Json` by the Supabase generated types; our concrete
  // collector shapes don't carry Json's index signature. Content is JSON-
  // serializable — cast at the write boundary.
  const details: CollectionRunDetails = {
    annual: annualResult.details,
    monthly: monthlyResult.details,
    country: countryResult.details,
  }
  await supabase
    .from('collection_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      records_affected: totalRecords,
      error_message: errors.length > 0 ? sanitizeErrorMessage(errors.join('; ')) : null,
      details: details as unknown as Json,
    })
    .eq('id', run!.id)

  return NextResponse.json({ status, records_affected: totalRecords, errors })
}
