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

  try {
    // Run collectors in sequence
    const annualResult = await runAnnualCollection()
    const monthlyResult = await runMonthlyCollection()
    const countryResult = await runCountryCollection()

    const totalRecords =
      annualResult.records_affected +
      monthlyResult.records_affected +
      countryResult.records_affected

    // Update collection_runs to success
    await supabase
      .from('collection_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        records_affected: totalRecords,
        details: {
          annual: annualResult.details,
          monthly: monthlyResult.details,
          country: countryResult.details,
        },
      })
      .eq('id', run!.id)

    return NextResponse.json({ status: 'success', records_affected: totalRecords })
  } catch (error) {
    // Update collection_runs to error
    await supabase
      .from('collection_runs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', run!.id)

    return NextResponse.json(
      {
        error: 'Collection failed',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    )
  }
}
