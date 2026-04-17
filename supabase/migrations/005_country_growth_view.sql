-- 005_country_growth_view.sql
-- Frontend Audit Pass 5 + DB Audit Pass 2 (both sweeps).
-- Expose a pre-aggregated view of per-country first/latest snapshots so the
-- dashboard never fetches all raw `country_snapshots` rows.
--
-- Why:
--   The dashboard renders "growth since we started tracking" per country:
--   first active_players value vs latest active_players value. Previous
--   implementation read every row and collapsed in JS. `country_snapshots`
--   grows by ~50 rows/week (one per country per weekly cron), so at
--   current pace the query would cross the Supabase JS client's silent
--   1000-row cap in ~12 weeks.
--
--   This view returns one row per country (51 today, grows only when IFPA
--   adds a new country) so the page query is constant-sized.
--
-- Shape:
--   country_name, country_code, first_snapshot, latest_snapshot,
--   first_active_players, latest_active_players, snapshot_count
--
-- Security:
--   View is `security_invoker = true` so it respects the caller's RLS on
--   `country_snapshots`. anon's existing SELECT policy on the underlying
--   table still gates access.

CREATE OR REPLACE VIEW public.country_growth_v
WITH (security_invoker = true) AS
SELECT
  country_name,
  (array_agg(country_code     ORDER BY snapshot_date DESC))[1] AS country_code,
  min(snapshot_date)                                           AS first_snapshot,
  max(snapshot_date)                                           AS latest_snapshot,
  (array_agg(active_players   ORDER BY snapshot_date ASC))[1]  AS first_active_players,
  (array_agg(active_players   ORDER BY snapshot_date DESC))[1] AS latest_active_players,
  count(*)                                                     AS snapshot_count
FROM public.country_snapshots
GROUP BY country_name;

-- Explicit grant for clarity (anon already has default SELECT on new public
-- views, but the security scan removed broad grants; spell it out).
GRANT SELECT ON public.country_growth_v TO anon, authenticated;
