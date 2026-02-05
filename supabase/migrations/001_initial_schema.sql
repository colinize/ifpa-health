-- 001_initial_schema.sql
-- IFPA Health Dashboard - Initial Schema
-- Creates all tables, RLS policies, indexes, and seed data.

-- =============================================================================
-- 1. annual_snapshots
-- =============================================================================
CREATE TABLE annual_snapshots (
  id bigint generated always as identity primary key,
  year integer not null,
  tournaments integer not null,
  player_entries integer not null,
  unique_players integer not null,
  returning_players integer,
  new_players integer,
  countries integer,
  tournament_yoy_pct numeric(6,1),
  entry_yoy_pct numeric(6,1),
  avg_attendance numeric(5,1) generated always as (player_entries::numeric / nullif(tournaments, 0)) stored,
  retention_rate numeric(5,1) generated always as (
    case when unique_players > 0 then (returning_players::numeric / unique_players * 100) else null end
  ) stored,
  collected_at timestamptz not null default now(),
  unique(year)
);

-- =============================================================================
-- 2. monthly_event_counts
-- =============================================================================
CREATE TABLE monthly_event_counts (
  id bigint generated always as identity primary key,
  year integer not null,
  month integer not null check (month between 1 and 12),
  event_count integer not null,
  prior_year_event_count integer,
  yoy_change_pct numeric(6,1),
  collected_at timestamptz not null default now(),
  unique(year, month)
);

-- =============================================================================
-- 3. overall_stats_snapshots
-- =============================================================================
CREATE TABLE overall_stats_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  ytd_tournaments integer,
  ytd_player_entries integer,
  ytd_unique_players integer,
  total_active_players integer,
  total_players_all_time integer,
  age_under_18_pct numeric(4,1),
  age_18_29_pct numeric(4,1),
  age_30_39_pct numeric(4,1),
  age_40_49_pct numeric(4,1),
  age_50_plus_pct numeric(4,1),
  collected_at timestamptz not null default now(),
  unique(snapshot_date)
);

-- =============================================================================
-- 4. country_snapshots
-- =============================================================================
CREATE TABLE country_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  country_name text not null,
  country_code text,
  active_players integer not null,
  pct_of_total numeric(5,2),
  collected_at timestamptz not null default now(),
  unique(snapshot_date, country_name)
);

-- =============================================================================
-- 5. wppr_rankings
-- =============================================================================
CREATE TABLE wppr_rankings (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  player_id integer not null,
  first_name text not null,
  last_name text not null,
  wppr_rank integer not null,
  wppr_points numeric(10,2) not null,
  ratings_value numeric(10,2),
  active_events integer,
  country_name text,
  country_code text,
  collected_at timestamptz not null default now(),
  unique(snapshot_date, player_id)
);

-- =============================================================================
-- 6. health_scores
-- =============================================================================
CREATE TABLE health_scores (
  id bigint generated always as identity primary key,
  score_date date not null,
  composite_score numeric(5,1) not null,
  band text not null check (band in ('thriving', 'healthy', 'stable', 'concerning', 'critical')),
  components jsonb not null,
  sensitivity jsonb,
  methodology_version integer not null default 1,
  collected_at timestamptz not null default now(),
  unique(score_date)
);

-- =============================================================================
-- 7. forecasts
-- =============================================================================
CREATE TABLE forecasts (
  id bigint generated always as identity primary key,
  forecast_date date not null,
  target_year integer not null,
  months_of_data integer not null,
  projected_tournaments integer,
  projected_entries integer,
  ci_68_low_tournaments integer,
  ci_68_high_tournaments integer,
  ci_95_low_tournaments integer,
  ci_95_high_tournaments integer,
  ci_68_low_entries integer,
  ci_68_high_entries integer,
  ci_95_low_entries integer,
  ci_95_high_entries integer,
  method text not null default 'seasonal_ratio',
  trend_reference jsonb,
  collected_at timestamptz not null default now(),
  unique(forecast_date, target_year)
);

-- =============================================================================
-- 8. observations
-- =============================================================================
CREATE TABLE observations (
  id bigint generated always as identity primary key,
  period_start date not null,
  period_end date not null,
  observed_health text not null check (observed_health in ('thriving', 'healthy', 'stable', 'concerning', 'critical')),
  observed_score numeric(5,1) not null check (observed_score between 0 and 100),
  notes text,
  evidence text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 9. methodology_versions
-- =============================================================================
CREATE TABLE methodology_versions (
  id bigint generated always as identity primary key,
  version_number integer not null unique,
  description text,
  weights jsonb not null,
  breakpoints jsonb not null,
  is_active boolean not null default false,
  backtest_mae numeric(6,2),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 10. shadow_scores
-- =============================================================================
CREATE TABLE shadow_scores (
  id bigint generated always as identity primary key,
  score_date date not null,
  methodology_version integer not null,
  composite_score numeric(5,1) not null,
  component_scores jsonb not null,
  collected_at timestamptz not null default now(),
  unique(score_date, methodology_version)
);

-- =============================================================================
-- 11. collection_runs
-- =============================================================================
CREATE TABLE collection_runs (
  id bigint generated always as identity primary key,
  run_type text not null,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_affected integer default 0,
  error_message text,
  details jsonb
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
ALTER TABLE annual_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_event_counts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE overall_stats_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wppr_rankings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE methodology_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_runs        ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Public read policies (anon role)
-- =============================================================================
CREATE POLICY "Allow public read" ON annual_snapshots       FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON monthly_event_counts   FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON overall_stats_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON country_snapshots      FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON wppr_rankings          FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON health_scores          FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON forecasts              FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON observations           FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON methodology_versions   FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON shadow_scores          FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON collection_runs        FOR SELECT TO anon USING (true);

-- =============================================================================
-- Service role write policies (insert, update, delete)
-- =============================================================================
CREATE POLICY "Allow service write" ON annual_snapshots       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON monthly_event_counts   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON overall_stats_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON country_snapshots      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON wppr_rankings          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON health_scores          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON forecasts              FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON observations           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON methodology_versions   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON shadow_scores          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write" ON collection_runs        FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Indexes on frequently queried columns
-- =============================================================================
CREATE INDEX idx_annual_snapshots_year           ON annual_snapshots (year);
CREATE INDEX idx_monthly_event_counts_year_month ON monthly_event_counts (year, month);
CREATE INDEX idx_overall_stats_snapshot_date      ON overall_stats_snapshots (snapshot_date);
CREATE INDEX idx_health_scores_score_date         ON health_scores (score_date);
CREATE INDEX idx_forecasts_forecast_date          ON forecasts (forecast_date);
CREATE INDEX idx_shadow_scores_score_date         ON shadow_scores (score_date);
CREATE INDEX idx_collection_runs_type_started     ON collection_runs (run_type, started_at);

-- =============================================================================
-- Seed: initial methodology version
-- =============================================================================
INSERT INTO methodology_versions (version_number, description, weights, breakpoints, is_active)
VALUES (
  1,
  'Initial methodology based on v2 analysis report',
  '{"growth": 0.25, "attendance": 0.20, "retention": 0.20, "momentum": 0.15, "diversity": 0.10, "youth": 0.10}',
  '{"growth": {"points": [[-20, 0], [0, 50], [20, 100]]}, "attendance": {"points": [[15, 0], [20, 55], [23, 85], [25, 100]]}, "retention": {"points": [[20, 0], [30, 50], [42, 85], [50, 100]]}, "momentum": {"points": [[-15, 0], [0, 50], [15, 100]]}, "diversity": {"points": [[90, 0], [70, 50], [50, 100]]}, "youth": {"points": [[5, 0], [13, 50], [30, 100]]}}',
  true
);
