# IFPA Ecosystem Health Dashboard

## Goal
Public-facing single-page dashboard answering "is competitive pinball growing or dying?" with data from the IFPA API.

## Stack
- Next.js 16 + TypeScript + App Router
- Tailwind v4 + shadcn/ui
- Supabase (PostgreSQL + RLS)
- Recharts for data visualization
- Vercel for hosting + cron

## Architecture

### Data Flow
```
IFPA API → Cron Routes → Collectors → Supabase → Server Component → Client Charts
```

### Cron Schedule
- **Daily 8am UTC**: Overall stats, WPPR rankings, health score, forecast
- **Weekly Monday 9am**: Annual snapshots, monthly events, country data

### Health Score (0-100)
Composite of 6 weighted components:
- Growth (0.25) — tournament + entry YoY
- Attendance (0.20) — avg vs 23.0 baseline
- Retention (0.20) — player retention rate
- Momentum (0.15) — last 3 months event YoY
- Diversity (0.10) — US concentration + country count
- Youth (0.10) — % under 30

### Calibration System
- Observations table for ground truth labels
- Methodology versioning with shadow scores
- MAE-based backtesting against observations

## Decisions Made

1. **Tournament counts from `/stats/events_by_year` only** — never use search endpoint event counts as tournament counts (events ≠ tournaments)
2. **No monthly player entry display** — API lacks reliable monthly aggregate
3. **Avg attendance = entries ÷ tournaments** from events_by_year endpoint
4. **ISR with 1-hour revalidation** — no client-side data fetching
5. **Dark mode via class toggle** — inline script to prevent flash
6. **Reference years for forecast: 2019, 2022-2025** — skip COVID years

## Phases
- [x] Phase 1: Project setup & database
- [x] Phase 2: Data pipeline (IFPA client, collectors, cron routes)
- [x] Phase 3: Health score algorithm + calibration
- [x] Phase 4: Forecasting system
- [x] Phase 5: Frontend dashboard
- [ ] Phase 6: Polish, deploy, verification
