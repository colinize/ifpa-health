import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runAnnualCollection } from '@/lib/collectors/annual-collector'
import { runMonthlyCollection } from '@/lib/collectors/monthly-collector'
import { runCountryCollection } from '@/lib/collectors/country-collector'

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET header (Vercel cron pattern)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  const annualResult = await runAnnualCollection().catch((e: Error) => {
    errors.push(`annual: ${e.message}`)
    return { records_affected: 0, details: { error: e.message } }
  })

  const monthlyResult = await runMonthlyCollection().catch((e: Error) => {
    errors.push(`monthly: ${e.message}`)
    return { records_affected: 0, details: { error: e.message } }
  })

  const countryResult = await runCountryCollection().catch((e: Error) => {
    errors.push(`country: ${e.message}`)
    return { records_affected: 0, details: { error: e.message } }
  })

  const totalRecords =
    annualResult.records_affected +
    monthlyResult.records_affected +
    countryResult.records_affected

  const status = errors.length === 0 ? 'success' : errors.length === 3 ? 'error' : 'partial'

  await supabase
    .from('collection_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      records_affected: totalRecords,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      details: {
        annual: annualResult.details,
        monthly: monthlyResult.details,
        country: countryResult.details,
      },
    })
    .eq('id', run!.id)

  return NextResponse.json({ status, records_affected: totalRecords, errors })
}
