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
      campaigns: {
        Row: {
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
          updated_at: string
        }
        Insert: {
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
          updated_at?: string
        }
        Update: {
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
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: Json }
      assign_pot_to_character: {
        Args: { p_campaign_id: string; p_character_id: number; p_coins: Json }
        Returns: Json
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
        Args: { p_name: string; p_slug: string }
        Returns: {
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
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
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
      get_entity_visibility: {
        Args: { p_entity_type: string; p_ids: number[] }
        Returns: {
          id: number
          visible_to: number[]
        }[]
      }
      is_campaign_dm: { Args: { cid: string }; Returns: boolean }
      is_campaign_member: { Args: { cid: string }; Returns: boolean }
      my_character_ids: { Args: { cid: string }; Returns: number[] }
      play_loteria: {
        Args: { p_campaign_id: string; p_character_id?: number }
        Returns: Json
      }
      set_entity_visibility: {
        Args: { p_entity_type: string; p_id: number; p_visible_to: number[] }
        Returns: number[]
      }
      shares_campaign_with: { Args: { uid: string }; Returns: boolean }
      touch_campaign_presence: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
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

