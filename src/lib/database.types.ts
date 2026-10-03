
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "brand_settings": {
                  Row: {
                    "handle": string,"niche": string,"platforms": (string)[],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "handle"?: string,"niche"?: string,"platforms"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "handle"?: string,"niche"?: string,"platforms"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"offers": {
                  Row: {
                    "created_at": string,"cta_destination": string,"cta_type": string,"id": string,"name": string,"price": number | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"cta_destination"?: string,"cta_type": string,"id"?: string,"name": string,"price"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"cta_destination"?: string,"cta_type"?: string,"id"?: string,"name"?: string,"price"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"personas": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string,"id": string,"name": string,"sort_order": number,"user_id": string,"voice": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string,"id"?: string,"name": string,"sort_order"?: number,"user_id"?: string,"voice"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"user_id"?: string,"voice"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_averages": {
                  Row: {
                    "avg_dms": number | null,"avg_hold_3s_pct": number | null,"avg_saves": number | null,"avg_shares": number | null,"avg_views": number | null,"avg_watch_pct": number | null,"id": string,"platform": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "avg_dms"?: number | null,"avg_hold_3s_pct"?: number | null,"avg_saves"?: number | null,"avg_shares"?: number | null,"avg_views"?: number | null,"avg_watch_pct"?: number | null,"id"?: string,"platform": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "avg_dms"?: number | null,"avg_hold_3s_pct"?: number | null,"avg_saves"?: number | null,"avg_shares"?: number | null,"avg_views"?: number | null,"avg_watch_pct"?: number | null,"id"?: string,"platform"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"posts": {
                  Row: {
                    "created_at": string,"external_post_id": string | null,"format": string,"goal": string,"hook": string,"id": string,"offer_id": string | null,"on_screen_text": string,"platform": string,"posted_at": string | null,"root_post_id": string | null,"script": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"external_post_id"?: string | null,"format": string,"goal": string,"hook": string,"id"?: string,"offer_id"?: string | null,"on_screen_text"?: string,"platform": string,"posted_at"?: string | null,"root_post_id"?: string | null,"script"?: string,"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"external_post_id"?: string | null,"format"?: string,"goal"?: string,"hook"?: string,"id"?: string,"offer_id"?: string | null,"on_screen_text"?: string,"platform"?: string,"posted_at"?: string | null,"root_post_id"?: string | null,"script"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_root_post_id_fkey"
      columns: ["root_post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "brain_version": string,"confidence": string,"created_at": string,"id": string,"model": string,"parsed": NonNullable<Json>,"post_id": string,"predicted_outcome": string | null,"predicted_tier": string,"provisional_format": boolean,"raw_response": string,"schema_version": number,"total_score": number,"usage": Json | null,"user_id": string
                  }
                  Insert: {
                    "brain_version": string,"confidence": string,"created_at"?: string,"id"?: string,"model": string,"parsed": NonNullable<Json>,"post_id": string,"predicted_outcome"?: string | null,"predicted_tier": string,"provisional_format"?: boolean,"raw_response": string,"schema_version": number,"total_score": number,"usage"?: Json | null,"user_id"?: string
                  }
                  Update: {
                    "brain_version"?: string,"confidence"?: string,"created_at"?: string,"id"?: string,"model"?: string,"parsed"?: NonNullable<Json>,"post_id"?: string,"predicted_outcome"?: string | null,"predicted_tier"?: string,"provisional_format"?: boolean,"raw_response"?: string,"schema_version"?: number,"total_score"?: number,"usage"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
