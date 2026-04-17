-- 004_seed_methodology_v2.sql
-- DB Audit Finding R-01.
-- Seed the v2 methodology row (3-pillar scorer) and flip v1 inactive.
--
-- Why:
--   `lib/health-score.ts` writes `methodology_version = 2` on every
--   `health_scores` row it produces. The v2 scorer shipped with the Feb 2026
--   redesign but no corresponding row was added to `methodology_versions`, so
--   47 of 48 `health_scores` rows reference a parent that doesn't exist.
--   `methodology_versions` has no FK constraint so the writes succeeded, but
--   any JOIN-based calibration / shadow-scoring flow finds nothing.
--
-- Source of truth for v2 values:
--   weights      — 1/3 per pillar, see `lib/health-score.ts:36`
--   breakpoints  — see `lib/health-score.ts:30-34`
--
-- Effect:
--   - v2 row inserted, marked active
--   - v1 row flipped inactive (kept for historical shadow-score comparison)
--
-- Reversible: `DELETE FROM methodology_versions WHERE version_number = 2;`
-- + `UPDATE methodology_versions SET is_active = true WHERE version_number = 1;`

INSERT INTO methodology_versions (version_number, description, weights, breakpoints, is_active)
VALUES (
  2,
  'Three-pillar methodology (players / retention / tournaments, equal weight)',
  '{"players": 0.3333, "retention": 0.3333, "tournaments": 0.3334}',
  '{"players": {"points": [[-10, 0], [0, 50], [15, 100]]}, "retention": {"points": [[25, 0], [35, 50], [50, 100]]}, "tournaments": {"points": [[-10, 0], [0, 50], [15, 100]]}}',
  true
)
ON CONFLICT (version_number) DO NOTHING;

UPDATE methodology_versions
SET is_active = false
WHERE version_number = 1;
