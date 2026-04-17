export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      annual_snapshots: {
        Row: {
          avg_attendance: number | null
          collected_at: string
          countries: number | null
          entry_yoy_pct: number | null
          id: number
          new_players: number | null
          player_entries: number
          retention_rate: number | null
          returning_players: number | null
          tournament_yoy_pct: number | null
          tournaments: number
          unique_players: number
          year: number
        }
        Insert: {
          avg_attendance?: number | null
          collected_at?: string
          countries?: number | null
          entry_yoy_pct?: number | null
          id?: never
          new_players?: number | null
          player_entries: number
          retention_rate?: number | null
          returning_players?: number | null
          tournament_yoy_pct?: number | null
          tournaments: number
          unique_players: number
          year: number
        }
        Update: {
          avg_attendance?: number | null
          collected_at?: string
          countries?: number | null
          entry_yoy_pct?: number | null
          id?: never
          new_players?: number | null
          player_entries?: number
          retention_rate?: number | null
          returning_players?: number | null
          tournament_yoy_pct?: number | null
          tournaments?: number
          unique_players?: number
          year?: number
        }
        Relationships: []
      }
      collection_runs: {
        Row: {
          completed_at: string | null
          details: Json | null
          error_message: string | null
          id: number
          records_affected: number | null
          run_type: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: never
          records_affected?: number | null
          run_type: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: never
          records_affected?: number | null
          run_type?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      country_snapshots: {
        Row: {
          active_players: number
          collected_at: string
          country_code: string | null
          country_name: string
          id: number
          pct_of_total: number | null
          snapshot_date: string
        }
        Insert: {
          active_players: number
          collected_at?: string
          country_code?: string | null
          country_name: string
          id?: never
          pct_of_total?: number | null
          snapshot_date: string
        }
        Update: {
          active_players?: number
          collected_at?: string
          country_code?: string | null
          country_name?: string
          id?: never
          pct_of_total?: number | null
          snapshot_date?: string
        }
        Relationships: []
      }
      forecasts: {
        Row: {
          ci_68_high_entries: number | null
          ci_68_high_players: number | null
          ci_68_high_returning: number | null
          ci_68_high_tournaments: number | null
          ci_68_low_entries: number | null
          ci_68_low_players: number | null
          ci_68_low_returning: number | null
          ci_68_low_tournaments: number | null
          ci_95_high_entries: number | null
          ci_95_high_tournaments: number | null
          ci_95_low_entries: number | null
          ci_95_low_tournaments: number | null
          collected_at: string
          forecast_date: string
          id: number
          method: string
          months_of_data: number
          projected_entries: number | null
          projected_returning_players: number | null
          projected_tournaments: number | null
          projected_unique_players: number | null
          target_year: number
          trend_reference: Json | null
        }
        Insert: {
          ci_68_high_entries?: number | null
          ci_68_high_players?: number | null
          ci_68_high_returning?: number | null
          ci_68_high_tournaments?: number | null
          ci_68_low_entries?: number | null
          ci_68_low_players?: number | null
          ci_68_low_returning?: number | null
          ci_68_low_tournaments?: number | null
          ci_95_high_entries?: number | null
          ci_95_high_tournaments?: number | null
          ci_95_low_entries?: number | null
          ci_95_low_tournaments?: number | null
          collected_at?: string
          forecast_date: string
          id?: never
          method?: string
          months_of_data: number
          projected_entries?: number | null
          projected_returning_players?: number | null
          projected_tournaments?: number | null
          projected_unique_players?: number | null
          target_year: number
          trend_reference?: Json | null
        }
        Update: {
          ci_68_high_entries?: number | null
          ci_68_high_players?: number | null
          ci_68_high_returning?: number | null
          ci_68_high_tournaments?: number | null
          ci_68_low_entries?: number | null
          ci_68_low_players?: number | null
          ci_68_low_returning?: number | null
          ci_68_low_tournaments?: number | null
          ci_95_high_entries?: number | null
          ci_95_high_tournaments?: number | null
          ci_95_low_entries?: number | null
          ci_95_low_tournaments?: number | null
          collected_at?: string
          forecast_date?: string
          id?: never
          method?: string
          months_of_data?: number
          projected_entries?: number | null
          projected_returning_players?: number | null
          projected_tournaments?: number | null
          projected_unique_players?: number | null
          target_year?: number
          trend_reference?: Json | null
        }
        Relationships: []
      }
      health_scores: {
        Row: {
          band: string
          collected_at: string
          components: Json
          composite_score: number
          id: number
          methodology_version: number
          score_date: string
          sensitivity: Json | null
        }
        Insert: {
          band: string
          collected_at?: string
          components: Json
          composite_score: number
          id?: never
          methodology_version?: number
          score_date: string
          sensitivity?: Json | null
        }
        Update: {
          band?: string
          collected_at?: string
          components?: Json
          composite_score?: number
          id?: never
          methodology_version?: number
          score_date?: string
          sensitivity?: Json | null
        }
        Relationships: []
      }
      methodology_versions: {
        Row: {
          backtest_mae: number | null
          breakpoints: Json
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          version_number: number
          weights: Json
        }
        Insert: {
          backtest_mae?: number | null
          breakpoints: Json
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          version_number: number
          weights: Json
        }
        Update: {
          backtest_mae?: number | null
          breakpoints?: Json
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          version_number?: number
          weights?: Json
        }
        Relationships: []
      }
      monthly_event_counts: {
        Row: {
          collected_at: string
          event_count: number
          id: number
          month: number
          prior_year_event_count: number | null
          year: number
          yoy_change_pct: number | null
        }
        Insert: {
          collected_at?: string
          event_count: number
          id?: never
          month: number
          prior_year_event_count?: number | null
          year: number
          yoy_change_pct?: number | null
        }
        Update: {
          collected_at?: string
          event_count?: number
          id?: never
          month?: number
          prior_year_event_count?: number | null
          year?: number
          yoy_change_pct?: number | null
        }
        Relationships: []
      }
      observations: {
        Row: {
          created_at: string
          evidence: string | null
          id: number
          notes: string | null
          observed_health: string
          observed_score: number
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          evidence?: string | null
          id?: never
          notes?: string | null
          observed_health: string
          observed_score: number
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          evidence?: string | null
          id?: never
          notes?: string | null
          observed_health?: string
          observed_score?: number
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      overall_stats_snapshots: {
        Row: {
          age_18_29_pct: number | null
          age_30_39_pct: number | null
          age_40_49_pct: number | null
          age_50_plus_pct: number | null
          age_under_18_pct: number | null
          collected_at: string
          id: number
          snapshot_date: string
          total_active_players: number | null
          total_players_all_time: number | null
          ytd_player_entries: number | null
          ytd_tournaments: number | null
          ytd_unique_players: number | null
        }
        Insert: {
          age_18_29_pct?: number | null
          age_30_39_pct?: number | null
          age_40_49_pct?: number | null
          age_50_plus_pct?: number | null
          age_under_18_pct?: number | null
          collected_at?: string
          id?: never
          snapshot_date: string
          total_active_players?: number | null
          total_players_all_time?: number | null
          ytd_player_entries?: number | null
          ytd_tournaments?: number | null
          ytd_unique_players?: number | null
        }
        Update: {
          age_18_29_pct?: number | null
          age_30_39_pct?: number | null
          age_40_49_pct?: number | null
          age_50_plus_pct?: number | null
          age_under_18_pct?: number | null
          collected_at?: string
          id?: never
          snapshot_date?: string
          total_active_players?: number | null
          total_players_all_time?: number | null
          ytd_player_entries?: number | null
          ytd_tournaments?: number | null
          ytd_unique_players?: number | null
        }
        Relationships: []
      }
      shadow_scores: {
        Row: {
          collected_at: string
          component_scores: Json
          composite_score: number
          id: number
          methodology_version: number
          score_date: string
        }
        Insert: {
          collected_at?: string
          component_scores: Json
          composite_score: number
          id?: never
          methodology_version: number
          score_date: string
        }
        Update: {
          collected_at?: string
          component_scores?: Json
          composite_score?: number
          id?: never
          methodology_version?: number
          score_date?: string
        }
        Relationships: []
      }
      wppr_rankings: {
        Row: {
          active_events: number | null
          collected_at: string
          country_code: string | null
          country_name: string | null
          first_name: string
          id: number
          last_name: string
          player_id: number
          ratings_value: number | null
          snapshot_date: string
          wppr_points: number
          wppr_rank: number
        }
        Insert: {
          active_events?: number | null
          collected_at?: string
          country_code?: string | null
          country_name?: string | null
          first_name: string
          id?: never
          last_name: string
          player_id: number
          ratings_value?: number | null
          snapshot_date: string
          wppr_points: number
          wppr_rank: number
        }
        Update: {
          active_events?: number | null
          collected_at?: string
          country_code?: string | null
          country_name?: string | null
          first_name?: string
          id?: never
          last_name?: string
          player_id?: number
          ratings_value?: number | null
          snapshot_date?: string
          wppr_points?: number
          wppr_rank?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
