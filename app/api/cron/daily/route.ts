import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyBearer } from '@/lib/auth'
import { sanitizeErrorMessage } from '@/lib/sanitize'
import { runDailyCollection } from '@/lib/collectors/daily-collector'
import { runHealthScorer } from '@/lib/collectors/health-scorer'
import { runForecaster } from '@/lib/collectors/forecaster'

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
    .insert({ run_type: 'daily', status: 'running', started_at: startedAt })
    .select()
    .single()

  try {
    // Run collectors in sequence
    const dailyResult = await runDailyCollection()
    const healthResult = await runHealthScorer()
    const forecastResult = await runForecaster()

    const totalRecords =
      dailyResult.records_affected +
      healthResult.records_affected +
      forecastResult.records_affected

    // Update collection_runs to success
    await supabase
      .from('collection_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        records_affected: totalRecords,
        details: {
          daily: dailyResult.details,
          health: healthResult.details,
          forecast: forecastResult.details,
        },
      })
      .eq('id', run!.id)

    return NextResponse.json({ status: 'success', records_affected: totalRecords })
  } catch (error) {
    // Log the raw error server-side for Vercel Runtime Logs (owner only);
    // only a sanitized, length-capped string is persisted to collection_runs
    // (anon-readable) and returned in the HTTP response (no stack traces).
    console.error('Daily cron failed:', error)

    const sanitized = sanitizeErrorMessage(error)

    await supabase
      .from('collection_runs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: sanitized,
      })
      .eq('id', run!.id)

    return NextResponse.json({ error: 'Collection failed' }, { status: 500 })
  }
}
