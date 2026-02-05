# IFPA Health Dashboard — Session Notes

## Session 1 (Feb 5, 2026)

### What was done
- Full project scaffolding: Next.js 16 + Tailwind v4 + shadcn/ui
- Database migration with 11 tables (annual_snapshots, monthly_event_counts, overall_stats_snapshots, country_snapshots, wppr_rankings, health_scores, forecasts, observations, methodology_versions, shadow_scores, collection_runs)
- IFPA API client with typed endpoints
- 6 data collectors (daily, annual, monthly, country, health-scorer, forecaster)
- Cron routes for daily and weekly collection
- Admin routes for observations and calibration
- Backfill script for historical data seeding
- Health score algorithm with 6 weighted components + sensitivity analysis
- Forecast system with seasonal ratio extrapolation + confidence intervals
- Full dashboard with 8 chart components + server components
- Dark mode toggle, OG meta tags

### Key decisions
- Used v2 analysis report as authoritative data source
- Health score ~70 (Healthy) expected with current data
- Methodology versioning from day 1 for calibration loop
- No monthly player entry display (API unreliable for this)

### Bugs / Issues
- Supabase project needs to be created in dashboard (user must provide URL + keys)
- Backfill script needs `.env.local` populated before running
- IFPA stats endpoints (/stats/overall, /stats/events_by_year, etc.) not in formal API docs but work

### Session 2 (Feb 5, 2026) — Deployment

#### What was done
- Created Supabase project `ifpa-health` (ref: ryteszuvasrfppgecnwe, region: us-west-1)
- Ran migration (11 tables, RLS, indexes, seed data)
- **Fixed IFPA API response mismatches** — the API field names differ from what the docs suggest:
  - `events_by_year`: response key is `stats` not `events_by_year`, fields are `tournament_count`/`player_count` (singular)
  - `players_by_year`: response key is `stats`, fields are `current_year_count`/`previous_year_count` (not `unique_players`/`returning_players`)
  - `country_players`: response key is `stats` not `country_list`
  - `stats/overall`: age nested under `stats.age` with different field names (`age_18_to_29` not `18_29`)
  - `rankings/wppr`: has `name` (full) not `first_name`/`last_name`, `current_rank` not `wppr_rank`, `rating_value` not `ratings_value`
- Fixed IFPA client, all 6 collectors, and backfill script to match real API
- Ran backfill: 211 records (10 annual, 86 monthly, 51 country, 50 WPPR, 10 observations, health score, forecast)
- Deployed to Vercel: https://ifpa-health.vercel.app
- Crons configured: daily 8am UTC, weekly Monday 9am UTC

#### Health score result
- Initial score: **48.9 (Concerning)** — lower than expected ~70
- Growth component is 0 because 2026 YTD (partial year) vs 2025 (full year) shows -94% "decline"
- This will self-correct as 2026 data accumulates through the year
- Other components: Attendance 92.5, Retention 64.6, Momentum 44.7, Diversity 64.0, Youth 44.3

#### Forecast
- 15,575 tournaments projected for 2026 (based on 2 months of data, wide CI expected)

### Session 3 (Feb 5, 2026) — Data Accuracy Fixes

#### Issues identified via Playwright inspection
1. Metric cards showed -94% YoY (comparing 2026 partial vs 2025 full year)
2. Unique Players showed 0 (no 2026 data yet)
3. WPPR table unsorted (random rank order)
4. Historical Trends chart showed 2026 as cliff-drop (partial year plotted with full years)
5. Geographic chart inverted (Slovenia at top, US at bottom)

#### Fixes applied
- **Metric cards + health scorer**: Use last complete year (2025) instead of current partial year (2026) for YoY and growth calculations
- **Historical charts**: Pass only complete years to AnnualTrendsChart and RetentionChart
- **WPPR query**: Added `.order('wppr_rank', { ascending: true })`
- **Geographic chart**: Removed `.reverse()` — Recharts vertical BarChart renders first array item at top, so descending sort is correct
- **Backfill script**: Same complete-year fix applied

#### Health score after fix
- **66.5 (Healthy)** — much more accurate than 48.9
- Growth 75 (+10.2% avg YoY), Attendance 82, Retention 85, Momentum 45, Diversity 30, Youth 44

### Session 4 (Feb 5, 2026) — UX Clarity Pass

#### Redesigned 3 components for clarity
- **Monthly Momentum**: Replaced confusing side-by-side year bar chart (mostly empty with only 2 months of 2026 data) with YoY change bars — green = growth, red = decline, last 12 months
- **Forecast**: Replaced broken CI-band Recharts chart with clean text card — big projected number, range, comparison to prior year, early-estimate disclaimer
- **Health Score Breakdown**: Replaced 6 dense progress bars (weight %, sensitivity arrows, scores) with 2x3 grid of simple tiles — icon, name, rating (Strong/Good/Fair/Weak), key metric value

#### Terminology consistency
- Audited all user-facing text for tournament vs event consistency
- Fixed 7 instances: "event" → "tournament" in health breakdown, monthly momentum subtitle, methodology panel
- WPPR "Events" column left as-is (correct IFPA term for player event count)

### Next steps
- Mobile responsive testing
- Monitor cron jobs running correctly
- Custom domain (optional)
