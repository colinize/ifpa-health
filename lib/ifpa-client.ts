// ---------- Types ----------

export interface StatsOverall {
  type: string
  system_code: string
  stats: {
    overall_player_count: number
    active_player_count: number
    tournament_count: number
    tournament_count_last_month: number
    tournament_count_this_year: number
    tournament_player_count: number
    tournament_player_count_average: number
    age: {
      age_under_18: number
      age_18_to_29: number
      age_30_to_39: number
      age_40_to_49: number
      age_50_to_99: number
    }
  }
}

export interface EventsByYearEntry {
  year: string
  country_count: string
  tournament_count: string
  player_count: string
  stats_rank: number
}

export interface PlayersByYearEntry {
  year: string
  current_year_count: string
  previous_year_count: string
  previous_2_year_count: string
  stats_rank: number
}

export interface CountryPlayer {
  country_name: string
  country_code: string
  player_count: string
  stats_rank: number
}

export interface WPPRRanking {
  player_id: string
  name: string
  country_name: string
  country_code: string
  wppr_points: string
  current_rank: string
  rating_value: string
  event_count: string
  city: string
  stateprov: string
}

export interface TournamentSearchResult {
  total_results: string
}

// ---------- Client ----------

export class IFPAClient {
  private baseUrl = 'https://api.ifpapinball.com/'
  private apiKey: string

  constructor() {
    this.apiKey = process.env.IFPA_API_KEY!
  }

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, this.baseUrl)
    url.searchParams.set('api_key', this.apiKey)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }
    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new Error(`IFPA API error: ${res.status} ${res.statusText} for ${endpoint}`)
    }
    return res.json()
  }

  async getStatsOverall(): Promise<StatsOverall> {
    return this.fetch('/stats/overall')
  }

  async getEventsByYear(): Promise<{ type: string; rank_type: string; stats: EventsByYearEntry[] }> {
    return this.fetch('/stats/events_by_year')
  }

  async getPlayersByYear(): Promise<{ type: string; rank_type: string; stats: PlayersByYearEntry[] }> {
    return this.fetch('/stats/players_by_year')
  }

  async getCountryPlayers(): Promise<{ type: string; rank_type: string; stats: CountryPlayer[] }> {
    return this.fetch('/stats/country_players')
  }

  async getWPPRRankings(startPos = 1, count = 50): Promise<{ ranking_type: string; start_position: number; return_count: number; total_count: string; rankings: WPPRRanking[] }> {
    return this.fetch('/rankings/wppr', {
      start_pos: String(startPos),
      count: String(count),
    })
  }

  async searchTournaments(startDate: string, endDate: string): Promise<TournamentSearchResult> {
    return this.fetch('/tournament/search', {
      start_date: startDate,
      end_date: endDate,
    })
  }
}

export const ifpaClient = new IFPAClient()
