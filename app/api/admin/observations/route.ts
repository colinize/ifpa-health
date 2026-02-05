import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET: List all observations
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('observations')
    .select('*')
    .order('period_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ observations: data })
}

// POST: Add new observation
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { period_start, period_end, observed_health, observed_score, notes, evidence } = body

  // Validate required fields
  if (!period_start || !period_end || !observed_health || observed_score === undefined) {
    return NextResponse.json({ error: 'Missing required fields: period_start, period_end, observed_health, observed_score' }, { status: 400 })
  }

  // Validate observed_health enum
  const validBands = ['thriving', 'healthy', 'stable', 'concerning', 'critical']
  if (!validBands.includes(observed_health)) {
    return NextResponse.json(
      { error: `observed_health must be one of: ${validBands.join(', ')}` },
      { status: 400 }
    )
  }

  // Validate observed_score range
  const score = Number(observed_score)
  if (isNaN(score) || score < 0 || score > 100) {
    return NextResponse.json(
      { error: 'observed_score must be a number between 0 and 100' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('observations')
    .insert({
      period_start,
      period_end,
      observed_health,
      observed_score: score,
      notes: notes ?? null,
      evidence: evidence ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ observation: data }, { status: 201 })
}
