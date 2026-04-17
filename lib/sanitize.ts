/**
 * Strip token-shaped fragments out of strings before they land in the
 * database or client responses. Used by the cron routes when writing
 * `collection_runs.error_message` — that column is readable by the anon
 * Supabase client (see RLS in Pass 4), so anything stored here is
 * effectively public.
 *
 * The patterns below cover the realistic leak paths for this project:
 *   - `api_key=...` query-string values (IFPA API)
 *   - `Bearer ...` header values (CRON_SECRET, Supabase JWTs)
 *   - `Authorization: ...` header serializations
 *
 * Max length cap keeps a runaway collector error (e.g. an IFPA 500 HTML
 * page bleeding into an error message) from bloating the row.
 *
 * Never echoes the original secret; replacements are fixed literal strings.
 */
const MAX_ERROR_MESSAGE_LEN = 2000

export function sanitizeErrorMessage(msg: unknown): string {
  const raw =
    msg instanceof Error
      ? msg.message
      : typeof msg === 'string'
        ? msg
        : 'Unknown error'

  const stripped = raw
    .replace(/api_key=[^&\s"']+/gi, 'api_key=***')
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer ***')
    .replace(/Authorization:\s*[^\n\r]+/gi, 'Authorization: ***')

  return stripped.length > MAX_ERROR_MESSAGE_LEN
    ? stripped.slice(0, MAX_ERROR_MESSAGE_LEN) + '…[truncated]'
    : stripped
}
