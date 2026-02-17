-- 002_forecast_player_columns.sql
-- Add player and returning player projection columns to forecasts table

ALTER TABLE forecasts
  ADD COLUMN IF NOT EXISTS projected_unique_players integer,
  ADD COLUMN IF NOT EXISTS projected_returning_players integer,
  ADD COLUMN IF NOT EXISTS ci_68_low_players integer,
  ADD COLUMN IF NOT EXISTS ci_68_high_players integer,
  ADD COLUMN IF NOT EXISTS ci_68_low_returning integer,
  ADD COLUMN IF NOT EXISTS ci_68_high_returning integer;
