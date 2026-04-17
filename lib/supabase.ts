import { createClient } from '@supabase/supabase-js'

// Defensive trims: `.env.local` has been seen with stray newline/whitespace
// on values (Vercel CLI round-trips quoted escape sequences). Mirrors the
// `.trim()` in lib/ifpa-client.ts. See _security/01-secrets.md.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

// Public client for reading data (browser-safe)
export function createPublicClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Service role client for writing data (server-side only)
export function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}
