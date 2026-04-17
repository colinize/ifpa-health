import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Defensive trims: `.env.local` has been seen with stray newline/whitespace
// on values (Vercel CLI round-trips quoted escape sequences). Mirrors the
// `.trim()` in lib/ifpa-client.ts. See _security/01-secrets.md.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

// NOTE: Supabase types are generated into `lib/database.types.ts` but NOT yet
// wired via `createClient<Database>(...)`. Wiring uncovered 6 cascading type
// errors in collectors (jsonb `details` columns typed as `Json` reject our
// `Record<string, unknown>` shapes, and `ComponentScore` / `TrendReference`
// writes need `as Json` coercions). That's beyond Pass 4 scope — see
// `_refactor/04-type-hygiene.md` for the deferral rationale and a follow-up
// plan. The generated file is kept for the `parseHealthScore` bridge in
// `lib/health-score.ts` and future wiring.
export type TypedSupabaseClient = SupabaseClient

// Public client for reading data (browser-safe)
export function createPublicClient(): TypedSupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Service role client for writing data (server-side only)
export function createServiceClient(): TypedSupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}
