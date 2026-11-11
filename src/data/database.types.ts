export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      campaign_actions: {
        Row: {
          campaign_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string
          extras: Json
          function: Json | null
          id: number
          name: string
          private_to_pj: number | null
          table_key: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          extras?: Json
          function?: Json | null
          id?: number
          name: string
          private_to_pj?: number | null
          table_key: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          extras?: Json
          function?: Json | null
          id?: number
          name?: string
          private_to_pj?: number | null
          table_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_actions_private_to_pj_campaign_id_fkey"
            columns: ["private_to_pj", "campaign_id"]
            isOneToOne: false
            referencedRelation: "pjs"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      campaign_config: {
        Row: {
          campaign_id: string
          key: string
          updated_at: string
          value: Json
          visibility: string
        }
        Insert: {
          campaign_id: string
          key: string
          updated_at?: string
          value?: Json
          visibility?: string
        }
        Update: {
          campaign_id?: string
          key?: string
          updated_at?: string
          value?: Json
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_config_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invites: {
        Row: {
          campaign_id: string
          character_id: number | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number
          role: string
          uses: number
        }
        Insert: {
          campaign_id: string
          character_id?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number
          role?: string
          uses?: number
        }
        Update: {
          campaign_id?: string
          character_id?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number
          role?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invites_character_fk"
            columns: ["character_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "pjs"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "campaign_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_presence: {
        Row: {
          campaign_id: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_presence_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_requests: {
        Row: {
          accent_color: string | null
          campaign_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: number
          logo_url: string | null
          message: string | null
          name: string
          requester_id: string
          seeded_actions: number | null
          skipped_actions: number | null
          slug_wanted: string | null
          status: string
          system_id: string | null
          system_requested: boolean
          tagline: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          campaign_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: never
          logo_url?: string | null
          message?: string | null
          name: string
          requester_id?: string
          seeded_actions?: number | null
          skipped_actions?: number | null
          slug_wanted?: string | null
          status?: string
          system_id?: string | null
          system_requested?: boolean
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          campaign_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: never
          logo_url?: string | null
          message?: string | null
          name?: string
          requester_id?: string
          seeded_actions?: number | null
          skipped_actions?: number | null
          slug_wanted?: string | null
          status?: string
          system_id?: string | null
          system_requested?: boolean
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_requests_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          based_on_system: string | null
          branding: Json
          character_custom_fields: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          regions: Json
          settings: Json
          slug: string
          system: string
          system_profile: Json
          updated_at: string
        }
        Insert: {
          based_on_system?: string | null
          branding?: Json
          character_custom_fields?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          regions?: Json
          settings?: Json
          slug: string
          system?: string
          system_profile?: Json
          updated_at?: string
        }
        Update: {
          based_on_system?: string | null
          branding?: Json
          character_custom_fields?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          regions?: Json
          settings?: Json
          slug?: string
          system?: string
          system_profile?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_based_on_system_fkey"
            columns: ["based_on_system"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discarded_purge_log: {
        Row: {
          campaign_id: string
          characters_affected: number
          id: number
          key: string
          purged_at: string
        }
        Insert: {
          campaign_id: string
          characters_affected: number
          id?: never
          key: string
          purged_at?: string
        }
        Update: {
          campaign_id?: string
          characters_affected?: number
          id?: never
          key?: string
          purged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discarded_purge_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidad: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: number
          tipo: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: number
          tipo: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_dm_notes: {
        Row: {
          campaign_id: string
          created_at: string
          entity_id: number
          entity_type: string
          ganchos: string
          id: number
          notas: string
          secreto: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          entity_id: number
          entity_type: string
          ganchos?: string
          id?: number
          notas?: string
          secreto?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          entity_id?: number
          entity_type?: string
          ganchos?: string
          id?: number
          notas?: string
          secreto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_dm_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      facciones: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          imagen_url: string
          nombre: string
          region: string
          relacion: string
          tipo: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          region?: string
          relacion?: string
          tipo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          region?: string
          relacion?: string
          tipo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "facciones_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_logs: {
        Row: {
          actor_type: string
          campaign_id: string
          character_id: number | null
          created_at: string
          game: string
          id: number
          play_date: string
          prize: Json
          prize_target: string
          roll: number
        }
        Insert: {
          actor_type: string
          campaign_id: string
          character_id?: number | null
          created_at?: string
          game?: string
          id?: number
          play_date?: string
          prize?: Json
          prize_target: string
          roll: number
        }
        Update: {
          actor_type?: string
          campaign_id?: string
          character_id?: number | null
          created_at?: string
          game?: string
          id?: number
          play_date?: string
          prize?: Json
          prize_target?: string
          roll?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_logs_character_fk"
            columns: ["character_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "pjs"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      game_pot: {
        Row: {
          campaign_id: string
          cp: number
          ep: number
          gp: number
          pp: number
          sp: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          cp?: number
          ep?: number
          gp?: number
          pp?: number
          sp?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          cp?: number
          ep?: number
          gp?: number
          pp?: number
          sp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_pot_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      homebrew_rules: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          nombre: string
          texto: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          nombre?: string
          texto?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          nombre?: string
          texto?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "homebrew_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homebrew_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_owners: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          imagen_url: string
          nombre: string
          rareza: string
          tipo: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          rareza?: string
          tipo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          rareza?: string
          tipo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lore: {
        Row: {
          campaign_id: string
          categoria: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          titulo: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          titulo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          titulo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "lore_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lore_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lugares: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          imagen_url: string
          nombre: string
          region: string
          tipo: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          region?: string
          tipo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          region?: string
          tipo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "lugares_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lugares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_points: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          link_id: number | null
          link_type: string | null
          map_id: number
          nombre: string
          updated_at: string
          visible_to: number[]
          x: number
          y: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          link_id?: number | null
          link_type?: string | null
          map_id: number
          nombre?: string
          updated_at?: string
          visible_to?: number[]
          x?: number
          y?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          link_id?: number | null
          link_type?: string | null
          map_id?: number
          nombre?: string
          updated_at?: string
          visible_to?: number[]
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_points_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_points_map_fk"
            columns: ["map_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "mapas"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      mapas: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          imagen_url: string
          is_default: boolean
          nombre: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          is_default?: boolean
          nombre?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          is_default?: boolean
          nombre?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "mapas_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_backup_dnd5e_v2: {
        Row: {
          campaign_id: string
          inserted_action_ids: number[]
          inserted_links: Json
          migrated_at: string
          old_data: Json | null
          old_jugador: string | null
          old_sheet: Json | null
          pj_id: number | null
        }
        Insert: {
          campaign_id: string
          inserted_action_ids?: number[]
          inserted_links?: Json
          migrated_at?: string
          old_data?: Json | null
          old_jugador?: string | null
          old_sheet?: Json | null
          pj_id?: number | null
        }
        Update: {
          campaign_id?: string
          inserted_action_ids?: number[]
          inserted_links?: Json
          migrated_at?: string
          old_data?: Json | null
          old_jugador?: string | null
          old_sheet?: Json | null
          pj_id?: number | null
        }
        Relationships: []
      }
      pj_action_links: {
        Row: {
          action_id: number
          campaign_id: string
          created_at: string
          pj_id: number
          state: Json
          updated_at: string
        }
        Insert: {
          action_id: number
          campaign_id: string
          created_at?: string
          pj_id: number
          state?: Json
          updated_at?: string
        }
        Update: {
          action_id?: number
          campaign_id?: string
          created_at?: string
          pj_id?: number
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pj_action_links_action_id_campaign_id_fkey"
            columns: ["action_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_actions"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "pj_action_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pj_action_links_pj_id_campaign_id_fkey"
            columns: ["pj_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "pjs"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      pjs: {
        Row: {
          campaign_id: string
          clase: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          imagen_url: string
          jugador: string
          monedas: Json
          monedas_guardado: Json
          nivel: number
          nombre: string
          owner_id: string | null
          raza: string
          region: string
          sections_updated: Json
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          clase?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          jugador?: string
          monedas?: Json
          monedas_guardado?: Json
          nivel?: number
          nombre?: string
          owner_id?: string | null
          raza?: string
          region?: string
          sections_updated?: Json
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          clase?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          jugador?: string
          monedas?: Json
          monedas_guardado?: Json
          nivel?: number
          nombre?: string
          owner_id?: string | null
          raza?: string
          region?: string
          sections_updated?: Json
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "pjs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pjs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pjs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_availability: {
        Row: {
          campaign_id: string | null
          created_at: string
          fecha: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: number
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          fecha?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: number
          tipo: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          fecha?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: number
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_availability_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_notes: {
        Row: {
          campaign_id: string
          character_id: number | null
          created_at: string
          entity_id: number
          entity_type: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          character_id?: number | null
          created_at?: string
          entity_id: number
          entity_type: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          campaign_id?: string
          character_id?: number | null
          created_at?: string
          entity_id?: number
          entity_type?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_notes_character_fk"
            columns: ["character_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "pjs"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "player_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pnjs: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          id: number
          imagen_url: string
          nombre: string
          region: string
          relacion: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          region?: string
          relacion?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          id?: number
          imagen_url?: string
          nombre?: string
          region?: string
          relacion?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "pnjs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pnjs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      read_state: {
        Row: {
          campaign_id: string
          entity_id: number
          entity_type: string
          section: string
          seen_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          entity_id: number
          entity_type: string
          section?: string
          seen_at?: string
          user_id?: string
        }
        Update: {
          campaign_id?: string
          entity_id?: number
          entity_type?: string
          section?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "read_state_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "read_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          data: Json
          estado: string
          fecha: string | null
          id: number
          imagen_url: string
          numero: number | null
          orden: number
          tipo: string
          titulo: string
          updated_at: string
          visible_to: number[]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          fecha?: string | null
          id?: number
          imagen_url?: string
          numero?: number | null
          orden?: number
          tipo?: string
          titulo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          estado?: string
          fecha?: string | null
          id?: number
          imagen_url?: string
          numero?: number | null
          orden?: number
          tipo?: string
          titulo?: string
          updated_at?: string
          visible_to?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      systems: {
        Row: {
          actions: Json
          archived_at: string | null
          branched_from: string | null
          campaign_id: string | null
          created_at: string
          document: Json
          id: string
          kind: string
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          actions?: Json
          archived_at?: string | null
          branched_from?: string | null
          campaign_id?: string | null
          created_at?: string
          document: Json
          id?: string
          kind: string
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          actions?: Json
          archived_at?: string | null
          branched_from?: string | null
          campaign_id?: string | null
          created_at?: string
          document?: Json
          id?: string
          kind?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "systems_branched_from_fkey"
            columns: ["branched_from"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _discarded_at_ok: { Args: { p_at: string }; Returns: boolean }
      _discarded_data_keys: { Args: { p_item: Json }; Returns: string[] }
      _discarded_rename_roots: { Args: { p_item: Json }; Returns: string[] }
      _discarded_retention_days: { Args: never; Returns: number }
      _dnd5e_v2_custom_section: {
        Args: { p_fields: Json; p_sheet: Json }
        Returns: Json
      }
      _dnd5e_v2_flag: { Args: { v: Json }; Returns: boolean }
      _dnd5e_v2_flag_ok: { Args: { v: Json }; Returns: boolean }
      _dnd5e_v2_migrate_campaign: {
        Args: { p_campaign: string }
        Returns: Json
      }
      _dnd5e_v2_nontext: { Args: { v: Json }; Returns: boolean }
      _dnd5e_v2_norm: { Args: { p: string }; Returns: string }
      _dnd5e_v2_pj_data: {
        Args: { p_data: Json; p_keymap: Json; p_nivel: number }
        Returns: Json
      }
      _dnd5e_v2_recovery: { Args: { v: Json }; Returns: string }
      _dnd5e_v2_sheet_kind: { Args: { p: Json }; Returns: string }
      _dnd5e_v2_sheet_v1: { Args: never; Returns: Json }
      _dnd5e_v2_sheet_v2: { Args: never; Returns: Json }
      _dnd5e_v2_spell_entries: {
        Args: { p_rows: Json }
        Returns: {
          category: string
          description: string
          extras: Json
          name: string
          pj_id: number
          preparado: boolean
          private: boolean
        }[]
      }
      _dnd5e_v2_spell_rows: {
        Args: { p_pj: number; p_rows: Json }
        Returns: {
          category: string
          description: string
          dropped: boolean
          extras: Json
          flag_invalid: boolean
          name: string
          nivel_fallback: boolean
          not_text: boolean
          ord: number
          pj_id: number
          preparado: boolean
          problem: string
          truncated: boolean
        }[]
      }
      _dnd5e_v2_strip_custom: { Args: { p: Json }; Returns: Json }
      _dnd5e_v2_text: { Args: { v: Json }; Returns: string }
      _dnd5e_v2_whole: { Args: { v: Json }; Returns: number }
      _lottery_stale_keys: {
        Args: { p_cfg: Json; p_target: Json }
        Returns: string[]
      }
      _purge_discarded_entry: {
        Args: { p_campaign_id: string; p_key: string }
        Returns: number
      }
      _reward_normalize: {
        Args: { p_coins: Json; p_target: Json }
        Returns: Json
      }
      _reward_target: { Args: { p_campaign_id: string }; Returns: Json }
      _sheet_calc: { Args: { p_calc: Json; p_path: string }; Returns: Json }
      _sheet_columns: { Args: { p_path: string; v: Json }; Returns: Json }
      _sheet_data_keys: { Args: { p_sheet: Json }; Returns: string[] }
      _sheet_editor: { Args: { p_path: string; v: Json }; Returns: string }
      _sheet_fail: { Args: { p_path: string }; Returns: undefined }
      _sheet_formula: { Args: { p_path: string; v: Json }; Returns: string }
      _sheet_formula_uses: { Args: { p_text: string }; Returns: Json }
      _sheet_key: {
        Args: { p_path: string; p_scoped: boolean; v: Json }
        Returns: string
      }
      _sheet_label: { Args: { p_path: string; v: Json }; Returns: string }
      _sheet_mark_reward_destination: { Args: { p_sheet: Json }; Returns: Json }
      _sheet_options: { Args: { p_path: string; p_src: Json }; Returns: Json }
      _sheet_structural_keys: { Args: { p_sheet: Json }; Returns: string[] }
      _sheet_value_ok: { Args: { spec: Json; v: Json }; Returns: boolean }
      _system_summary: {
        Args: { s: Database["public"]["Tables"]["systems"]["Row"] }
        Returns: Database["public"]["CompositeTypes"]["system_summary"]
        SetofOptions: {
          from: "systems"
          to: "system_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _validate_sheet_core: { Args: { p: Json }; Returns: Json }
      _validate_sheet_nocard: { Args: { p: Json }; Returns: Json }
      _validate_sheet_noformats: { Args: { p: Json }; Returns: Json }
      accept_invite: { Args: { p_code: string }; Returns: Json }
      approve_campaign_request: {
        Args: { p_name?: string; p_request_id: number; p_slug?: string }
        Returns: string
      }
      archive_system: {
        Args: { p_archived: boolean; p_system_id: string }
        Returns: Database["public"]["CompositeTypes"]["system_summary"]
        SetofOptions: {
          from: "*"
          to: "system_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_pot_to_character: {
        Args: { p_campaign_id: string; p_character_id: number; p_coins: Json }
        Returns: Json
      }
      branch_system: {
        Args: { p_campaign_id: string; p_name: string }
        Returns: Database["public"]["CompositeTypes"]["system_summary"]
        SetofOptions: {
          from: "*"
          to: "system_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      campaign_busy_slots: {
        Args: { p_campaign_id: string }
        Returns: {
          fecha_fin: string
          fecha_inicio: string
          hora_fin: string
          hora_inicio: string
          user_id: string
        }[]
      }
      campaign_has_member: {
        Args: { cid: string; uid: string }
        Returns: boolean
      }
      can_see_entity: {
        Args: { cid: string; estado: string; visible_to: number[] }
        Returns: boolean
      }
      can_see_map: { Args: { cid: string; p_map_id: number }; Returns: boolean }
      coin_amounts: { Args: { src: Json }; Returns: Json }
      coin_value: { Args: { v: string }; Returns: number }
      create_campaign: {
        Args: {
          p_accent_color?: string
          p_logo_url?: string
          p_name: string
          p_slug: string
          p_tagline?: string
        }
        Returns: {
          based_on_system: string | null
          branding: Json
          character_custom_fields: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          regions: Json
          settings: Json
          slug: string
          system: string
          system_profile: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_campaign_for: {
        Args: {
          p_branding?: Json
          p_dm: string
          p_name: string
          p_slug: string
        }
        Returns: {
          based_on_system: string | null
          branding: Json
          character_custom_fields: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          regions: Json
          settings: Json
          slug: string
          system: string
          system_profile: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_origin_from_campaign: {
        Args: { p_campaign_id: string; p_name: string }
        Returns: Database["public"]["CompositeTypes"]["system_summary"]
        SetofOptions: {
          from: "*"
          to: "system_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_character_coins: {
        Args: {
          p_campaign_id: string
          p_character_id: number
          p_coins: Json
          p_now: string
        }
        Returns: undefined
      }
      delete_campaign: {
        Args: { p_campaign_id: string; p_confirm_slug: string }
        Returns: undefined
      }
      freeze_campaign_system: {
        Args: { p_campaign_id: string; p_user: string }
        Returns: undefined
      }
      get_entity_visibility: {
        Args: { p_entity_type: string; p_ids: number[] }
        Returns: {
          id: number
          visible_to: number[]
        }[]
      }
      get_system_actions: { Args: { p_system_id: string }; Returns: Json }
      is_campaign_dm: { Args: { cid: string }; Returns: boolean }
      is_campaign_member: { Args: { cid: string }; Returns: boolean }
      is_hub_owner: { Args: never; Returns: boolean }
      is_reserved_slug: { Args: { p_slug: string }; Returns: boolean }
      my_character_ids: { Args: { cid: string }; Returns: number[] }
      play_loteria: {
        Args: { p_campaign_id: string; p_character_id?: number }
        Returns: Json
      }
      preview_invite: { Args: { p_code: string }; Returns: Json }
      preview_invite_public: { Args: { p_code: string }; Returns: Json }
      promote_system: {
        Args: { p_name?: string; p_system_id: string }
        Returns: Database["public"]["CompositeTypes"]["system_summary"]
        SetofOptions: {
          from: "*"
          to: "system_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_discarded_item: {
        Args: { p_base: string; p_campaign_id: string; p_key: string }
        Returns: {
          based_on_system: string | null
          branding: Json
          character_custom_fields: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          regions: Json
          settings: Json
          slug: string
          system: string
          system_profile: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_expired_discarded: { Args: never; Returns: number }
      reject_campaign_request: {
        Args: { p_note?: string; p_request_id: number }
        Returns: undefined
      }
      rekey_discarded_item: {
        Args: {
          p_base: string
          p_campaign_id: string
          p_key: string
          p_profile: Json
          p_renames: Json
        }
        Returns: {
          based_on_system: string | null
          branding: Json
          character_custom_fields: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          regions: Json
          settings: Json
          slug: string
          system: string
          system_profile: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rename_system: {
        Args: { p_name: string; p_system_id: string }
        Returns: Database["public"]["CompositeTypes"]["system_summary"]
        SetofOptions: {
          from: "*"
          to: "system_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_entity_visibility: {
        Args: { p_entity_type: string; p_id: number; p_visible_to: number[] }
        Returns: number[]
      }
      set_system_profile: {
        Args: { p_base: string; p_campaign_id: string; p_profile: Json }
        Returns: {
          based_on_system: string | null
          branding: Json
          character_custom_fields: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          regions: Json
          settings: Json
          slug: string
          system: string
          system_profile: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shares_campaign_with: { Args: { uid: string }; Returns: boolean }
      sheet_guard_access: {
        Args: { p_campaign_id: string; p_new_data: Json; p_old_data: Json }
        Returns: Json
      }
      strip_control_chars: {
        Args: { p_keep_newlines?: boolean; p_text: string }
        Returns: string
      }
      system_capture_actions: { Args: { p_campaign_id: string }; Returns: Json }
      system_seed_actions: {
        Args: { p_actions: Json; p_campaign_id: string; p_created_by: string }
        Returns: number
      }
      system_template: { Args: { p: Json }; Returns: Json }
      system_usable_by:
        | { Args: { p_system_id: string }; Returns: boolean }
        | { Args: { p_system_id: string; p_user: string }; Returns: boolean }
      systems_actions_ok: { Args: { a: Json }; Returns: boolean }
      touch_campaign_presence: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      validate_sheet: { Args: { p: Json }; Returns: Json }
      validate_system_profile: { Args: { p: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      system_summary: {
        id: string | null
        name: string | null
        kind: string | null
        campaign_id: string | null
        owner_id: string | null
        branched_from: string | null
        archived_at: string | null
        created_at: string | null
        updated_at: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

