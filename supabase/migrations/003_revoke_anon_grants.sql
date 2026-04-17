-- 003_revoke_anon_grants.sql
-- Security Scan Pass 4 (+ DB Audit Finding R-01).
-- Revoke DML + TRUNCATE + REFERENCES + TRIGGER grants from `anon` and
-- `authenticated` on all 11 public tables.
--
-- Why:
--   Supabase bootstraps every new table with a broad default GRANT to both API
--   roles and relies on RLS to gate row-level DML. That works for
--   INSERT/UPDATE/DELETE (RLS has no permitting anon policy, so the statement
--   fails at row-check time). But `TRUNCATE` is a table-level operation that
--   bypasses row security entirely -- if the role holds the grant, the command
--   succeeds. Same for `REFERENCES` (can side-channel constraint info via FKs).
--
-- Effect:
--   - anon/authenticated keep SELECT (required -- the dashboard reads via anon
--     and RLS's "Allow public read" policy lets each row through).
--   - All write and destructive table-level privileges are removed for both
--     API roles.
--   - service_role is unaffected; it bypasses RLS and retains full access via
--     its default grants.
--
-- Reversible: `GRANT ... TO anon, authenticated;` reinstates each removed
-- privilege. Statement is short-lock DDL on tiny tables; no pooler timeout
-- risk.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.annual_snapshots        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.collection_runs         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.country_snapshots       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.forecasts               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.health_scores           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.methodology_versions    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.monthly_event_counts    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.observations            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.overall_stats_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.shadow_scores           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.wppr_rankings           FROM anon, authenticated;
