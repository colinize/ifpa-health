# Projected 2026 Health Score — Design

## What We're Building

A projected 2026 health score that sits below the existing backward-looking gauge. It answers: "If current trends hold, where is competitive pinball heading this year?"

The projected score uses real 2026 YTD data from the IFPA API — not guesses — extrapolated to a full-year projection using the same seasonal-ratio method we already use for tournament forecasting. All three health pillars (player growth, retention, tournament growth) are projected. A confidence range is shown that narrows as more months of data come in.

## Why This Approach

- **Separate score, not blended.** The backward-looking score stays honest (based on complete 2025 data). The projected score is clearly labeled as a projection with uncertainty.
- **Same algorithm, more inputs.** We extend the existing seasonal-ratio forecast engine to project players and returning players, not just tournaments. No new forecasting methodology to build or validate.
- **Tournament weights as proxy for player seasonality.** Months with more tournaments have proportionally more players. This avoids needing monthly player count collection — the existing pipeline suffices.

## Key Decisions

- **Separate projected score** (not blended into the main score): keeps the backward-looking score trustworthy
- **Project all 3 pillars** (players, retention, tournaments): fully data-driven, no held values
- **Confidence band on the score** as a range arc on the mini gauge: communicates uncertainty visually without text clutter
- **Mini gauge at 60% size** below main gauge: same visual language, visually subordinate
- **Don't show until 2+ months of data** (same threshold as existing tournament forecast)
- **No second narrative**: the confidence band communicates enough for the projection

## Data Pipeline

| Metric | Source | 2026 YTD |
|--------|--------|----------|
| Tournaments | `monthly_event_counts` (already collected) | Monthly counts |
| Unique players | `/stats/players_by_year` → `annual_snapshots` | `current_year_count` for 2026 |
| Returning players | `/stats/players_by_year` → `annual_snapshots` | `previous_year_count` for 2026 |

Projection method (same for all 3):
1. Historical monthly weights from reference years (2019, 2022-2025)
2. `projected_full_year = ytd_actual / cumulative_weight_so_far`
3. Back-test against historical years for 68% CI
4. Convert to health score inputs → `computeHealthScore()`

CI scores: run `computeHealthScore()` on pessimistic (all CI lows) and optimistic (all CI highs) inputs.

## Visual Layout

```
[Main Gauge: 84 Thriving]        ← backward-looking (existing)
[Mini Gauge: 78 (72-84)]         ← projected 2026 (NEW)
    2026 Projected
"Competitive pinball is..."      ← narrative (existing)
[Players] [Retention] [Tourns]   ← answer cards (existing)
```

Mini gauge: same semi-circle SVG, ~60% size, band-colored arc with faded CI range arc behind it. No count-up animation. Label "2026 Projected" in muted text.

## Technical Changes

| File | Change |
|------|--------|
| `lib/forecast.ts` | Extend to project players + returning players using tournament weights as proxy |
| `lib/projected-score.ts` | New — compute projected health score + CI band scores from forecast data |
| `lib/collectors/forecaster.ts` | Extend to project players/retention, store in `forecasts` table |
| `components/projected-gauge.tsx` | New — mini gauge with confidence arc |
| `app/page.tsx` | Read forecast data, render projected gauge |
| `forecasts` table | Add columns: `projected_unique_players`, `projected_returning_players`, CI columns |

No new tables, no new cron jobs. Extends existing daily forecaster run.
