import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyBearer } from '@/lib/auth'
import { sanitizeErrorMessage } from '@/lib/sanitize'

// Observation POST body shape. Kept as a plain validator rather than adding
// Zod as a new dependency for a single admin route; if a second route needs
// validation, move to Zod. See _security/03-validation-errors.md.
const VALID_BANDS = ['thriving', 'healthy', 'stable', 'concerning', 'critical'] as const
type ValidBand = (typeof VALID_BANDS)[number]

type ObservationInput = {
  period_start: string
  period_end: string
  observed_health: ValidBand
  observed_score: number
  notes: string | null
  evidence: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/
const MAX_TEXT_LEN = 5000

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function validateObservation(
  body: unknown
): { ok: true; value: ObservationInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (!isNonEmptyString(b.period_start) || !ISO_DATE.test(b.period_start)) {
    return { ok: false, error: 'period_start must be an ISO date string (YYYY-MM-DD)' }
  }
  if (!isNonEmptyString(b.period_end) || !ISO_DATE.test(b.period_end)) {
    return { ok: false, error: 'period_end must be an ISO date string (YYYY-MM-DD)' }
  }
  if (new Date(b.period_start) > new Date(b.period_end)) {
    return { ok: false, error: 'period_start must be on or before period_end' }
  }
  if (!isNonEmptyString(b.observed_health) || !VALID_BANDS.includes(b.observed_health as ValidBand)) {
    return { ok: false, error: `observed_health must be one of: ${VALID_BANDS.join(', ')}` }
  }
  const score = Number(b.observed_score)
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return { ok: false, error: 'observed_score must be a finite number between 0 and 100' }
  }

  const notes = b.notes == null ? null : String(b.notes)
  const evidence = b.evidence == null ? null : String(b.evidence)
  if (notes !== null && notes.length > MAX_TEXT_LEN) {
    return { ok: false, error: `notes must be ${MAX_TEXT_LEN} chars or fewer` }
  }
  if (evidence !== null && evidence.length > MAX_TEXT_LEN) {
    return { ok: false, error: `evidence must be ${MAX_TEXT_LEN} chars or fewer` }
  }

  return {
    ok: true,
    value: {
      period_start: b.period_start,
      period_end: b.period_end,
      observed_health: b.observed_health as ValidBand,
      observed_score: score,
      notes,
      evidence,
    },
  }
}

// GET: List all observations
export async function GET(request: NextRequest) {
  if (!verifyBearer(request, 'ADMIN_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('observations')
    .select('*')
    .order('period_start', { ascending: true })

  if (error) {
    // Don't leak Supabase's raw message (column/constraint names) to the
    // caller. Log server-side; respond generically.
    console.error('admin/observations GET failed:', sanitizeErrorMessage(error.message))
    return NextResponse.json({ error: 'Failed to fetch observations' }, { status: 500 })
  }
  return NextResponse.json({ observations: data })
}

// POST: Add new observation
export async function POST(request: NextRequest) {
  if (!verifyBearer(request, 'ADMIN_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = validateObservation(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('observations')
    .insert({
      period_start: result.value.period_start,
      period_end: result.value.period_end,
      observed_health: result.value.observed_health,
      observed_score: result.value.observed_score,
      notes: result.value.notes,
      evidence: result.value.evidence,
    })
    .select()
    .single()

  if (error) {
    console.error('admin/observations POST failed:', sanitizeErrorMessage(error.message))
    return NextResponse.json({ error: 'Failed to create observation' }, { status: 500 })
  }
  return NextResponse.json({ observation: data }, { status: 201 })
}
