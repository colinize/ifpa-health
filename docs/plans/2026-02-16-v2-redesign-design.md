# V2 Redesign — Narrative Pulse Check

## Goal

Rebuild the IFPA Health Dashboard as a 5-second pulse check for pinball community insiders. One viewport, no scrolling, instant read.

## Audience

Competitive pinball insiders who know IFPA, WPPR, and tournament culture. No need to explain basics.

## Design Direction

Narrative + Evidence. Health score at top, auto-generated summary sentence, three answer cards. Everything above the fold.

---

## Page Structure

```
┌──────────────────────────────────────────────────┐
│  IFPA Health          [dark mode]    [last updated]│
├──────────────────────────────────────────────────┤
│                                                    │
│          ◐ 67 — Healthy                           │
│                                                    │
│  "Competitive pinball is growing steadily —        │
│   10% more tournaments in 2025, with strong        │
│   retention at 42%."                               │
│                                                    │
├──────────────┬──────────────┬─────────────────────┤
│  PLAYERS     │  RETENTION   │  TOURNAMENTS        │
│  43,740      │  42%         │  14,113             │
│  ▲ +8.3%     │  ▬ flat      │  ▲ +10.5%           │
│  (sparkline) │  (sparkline) │  (sparkline)        │
└──────────────┴──────────────┴─────────────────────┘
│  ▸ More detail                                     │
└────────────────────────────────────────────────────┘
```

### What gets cut from v1

- 4 metric cards (redundant with answer cards)
- Historical Trends line chart
- Monthly Momentum bar chart
- 2026 Forecast card (moved to detail drawer)
- Player Retention composed chart
- Age Demographics bar chart
- Geographic Distribution bar chart
- WPPR Top 25 table
- Methodology panel (replaced with one-liner + link)

---

## Health Score — 3 Pillars

Replace 6-component system with 3 equally weighted pillars.

| Pillar | Question | Metric | Source |
|--------|----------|--------|--------|
| Players | Are more people playing? | Unique player YoY % | `annual_snapshots.unique_players` |
| Retention | Are they coming back? | Returning / unique % | `annual_snapshots.retention_rate` |
| Tournaments | Is there more to compete in? | Tournament YoY % | `annual_snapshots.tournaments` |

### Scoring (0-100)

**Players & Tournaments (growth metrics):**
- -10% or worse = 0
- 0% (flat) = 50
- +15% or more = 100
- Linear interpolation between breakpoints

**Retention:**
- 25% or less = 0
- 35% = 50
- 50% or more = 100
- Linear interpolation between breakpoints

**Composite:** Simple average of the three pillar scores. Same band system:
- Thriving: 80+
- Healthy: 65-79
- Stable: 50-64
- Concerning: 35-49
- Critical: 0-34

### Why 3 not 6

The old system penalized pinball for being US-heavy (diversity) and skewing older (youth). Those are demographic facts, not health indicators. Growth and Momentum were measuring the same thing at different timescales. Three pillars, equal weight, no ambiguity.

---

## Narrative Engine

Auto-generated sentence using template system (conditional logic, not AI).

**Structure:** `"Competitive pinball is [overall trend] — [primary evidence], [secondary evidence]."`

### Overall trend (from band)

- Thriving: "thriving"
- Healthy: "growing steadily" / "in good shape"
- Stable: "holding steady"
- Concerning: "showing signs of strain"
- Critical: "in decline"

### Evidence selection

1. Sort 3 pillars by deviation from neutral (50)
2. Strongest signal = primary evidence
3. Second = secondary evidence
4. If all similar: "all three indicators are trending [up/flat/down]"

### Examples

> "Competitive pinball is growing steadily — tournament count is up 10.5% year over year, with a solid 42% player retention rate."

> "Competitive pinball is holding steady — retention has dipped to 31%, though tournament growth remains strong at +12%."

> "Competitive pinball is showing signs of strain — unique players dropped 8% and tournament count is flat, though retention holds at 40%."

### Edge case

Early in year (Jan-Feb) with thin YTD data, append: "Early 2026 data — based on [last complete year]."

### Tone

Matter-of-fact. No hype. Insiders don't want cheerleading.

---

## Answer Cards

Each card: one number, one trend, one sparkline. Nothing else.

```
┌─────────────────────────┐
│  Are more people playing?│
│                          │
│  43,740                  │
│  ▲ +8.3% vs 2024        │
│                          │
│  ┄┄┄┄╱╱╱                 │
└─────────────────────────┘
```

### Card specs

**Card 1 — Players:**
- Number: unique players, last complete year
- Trend: YoY % change, green/red/neutral
- Sparkline: unique players ~2017-2025

**Card 2 — Retention:**
- Number: retention rate as percentage
- Trend: change in percentage points ("+2 pts" / "-3 pts")
- Sparkline: retention rate ~2017-2025

**Card 3 — Tournaments:**
- Number: tournament count, last complete year
- Trend: YoY % change, green/red/neutral
- Sparkline: tournaments ~2017-2025

### Trend thresholds

- Green up arrow: > +2%
- Red down arrow: < -2%
- Neutral dash: -2% to +2%

### Sparkline style

- Tiny, no axes, no labels
- Thin, slightly rounded line
- Muted color, rightmost point highlighted with dot
- COVID dip (2020-2021) shows honestly

---

## Detail Drawer

Collapsible "More detail" at bottom. Closed by default.

### Contents

1. **2026 Forecast** — projected tournament count with confidence range. Text card format. Only shown with 2+ months of data.

2. **Year-over-year table** — one row per year (2017-2025), columns: tournaments, entries, unique players, retention rate. Clean table, no chart.

3. **Monthly pulse** — 12 compact cells (one per month), colored green/red/neutral by YoY tournament count change. GitHub-contribution-graph style.

### Excluded from drawer

- WPPR Top 25 (leaderboard, not health)
- Age Demographics (demographic fact, not health signal)
- Geographic Distribution (same)
- Methodology panel (replaced with one-liner + GitHub link)

### Interaction

- Chevron toggle: "More detail" / "Less detail"
- Smooth expand animation
- Remembers state in localStorage

---

## Visual Design

Dark-first, editorial, scoreboard. ESPN ticker meets Bloomberg terminal meets Linear status page.

### Key decisions

- **Dark mode default** — light mode available, dark is primary design target. Dark backgrounds make numbers pop.

- **Typography-driven** — health score number and narrative sentence are the hero, not charts. Large bold number. Sentence in slightly larger-than-body clean font.

- **Functional color palette:**
  - Green (~#4ade80): good / up
  - Red (~#f87171): bad / down
  - Neutral gray: flat
  - Accent color on health gauge shifts with band (green → amber → red)
  - No decorative gradients or chart rainbow

- **Sparklines** — thin, slightly rounded lines. Subtle. Not thick Recharts defaults.

- **Borderless cards** — spacing and subtle background differentiation only. No boxy bordered cards.

- **Minimal animation** — health score counts up on load (0 → 67). Sparklines draw in. Nothing else.

- **Single viewport** — no vertical scroll for full read on desktop. Mobile: cards stack, narrative and score still visible without scrolling.

---

## Data Changes

### Database

No new tables needed. Existing `annual_snapshots` and `health_scores` tables have all required data.

### Health score table

The `components` JSONB column changes from 6 keys to 3. The `methodology_version` increments to v2.

### Collectors

- `health-scorer.ts` updated: 3 pillars, equal weights, new breakpoints
- `narrative-generator.ts` new module: template-based sentence generation
- Daily collector unchanged
- Weekly collector unchanged

### Removed components

All chart components from v1 are deleted. New components: health gauge, narrative, answer cards, sparklines, detail drawer.
