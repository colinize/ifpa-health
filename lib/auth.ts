import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time bearer-token verification for internal write routes.
 *
 * Accepts a `secretEnvName` so admin routes can be migrated to a separate
 * `ADMIN_SECRET` later without changing call sites in the cron routes.
 * Today both the cron and admin routes pass `'CRON_SECRET'`. See
 * `_security/02-api-surface.md` for the follow-up that splits them.
 *
 * Implementation notes:
 * - Uses `crypto.timingSafeEqual` to avoid the byte-at-a-time timing leak
 *   of plain `!==` on strings. `timingSafeEqual` THROWS if the buffers are
 *   different lengths, so we short-circuit on the length mismatch first —
 *   that length check itself is not constant-time, but it only reveals the
 *   token length (not its contents), which is already implied by the
 *   generator anyway.
 * - Trims the env value (`.env.local` has historically had trailing `\n`
 *   on some values — see `_security/01-secrets.md`).
 * - Missing secret (env var unset) fails closed. Without this guard,
 *   `Bearer ${undefined}` would become the accepted header.
 * - Missing `authorization` header and invalid value both return `false`
 *   with no branching difference in the response — no information leak
 *   between the "no header" and "wrong secret" cases.
 */
export function verifyBearer(
  request: Request,
  secretEnvName: 'CRON_SECRET' | 'ADMIN_SECRET'
): boolean {
  const expected = (process.env[secretEnvName] ?? '').trim()
  const header = request.headers.get('authorization')
  if (!expected || !header) return false

  if (!header.startsWith('Bearer ')) return false
  const token = header.slice('Bearer '.length)

  // timingSafeEqual requires equal-length buffers; bail early on mismatch.
  if (token.length !== expected.length) return false

  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return timingSafeEqual(a, b)
}
