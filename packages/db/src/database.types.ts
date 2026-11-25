export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  job_photos: {
    Tables: {
      jobs: {
        Row: {
          business_name: string | null;
          claim_token_hash: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          logo_path: string | null;
          note: string | null;
          owner_id: string | null;
          review_url: string | null;
          share_slug: string;
          title: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          business_name?: string | null;
          claim_token_hash?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          logo_path?: string | null;
          note?: string | null;
          owner_id?: string | null;
          review_url?: string | null;
          share_slug: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          business_name?: string | null;
          claim_token_hash?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          logo_path?: string | null;
          note?: string | null;
          owner_id?: string | null;
          review_url?: string | null;
          share_slug?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      photos: {
        Row: {
          created_at: string;
          height: number;
          id: string;
          job_id: string;
          kind: Database['job_photos']['Enums']['photo_kind'];
          position: number;
          storage_path: string;
          updated_at: string;
          width: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          height: number;
          id?: string;
          job_id: string;
          kind: Database['job_photos']['Enums']['photo_kind'];
          position?: number;
          storage_path: string;
          updated_at?: string;
          width: number;
        };
        Update: {
          created_at?: string;
          height?: number;
          id?: string;
          job_id?: string;
          kind?: Database['job_photos']['Enums']['photo_kind'];
          position?: number;
          storage_path?: string;
          updated_at?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'photos_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      owns_job: { Args: { job: string }; Returns: boolean };
    };
    Enums: {
      photo_kind: 'before' | 'after';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  missed_call: {
    Tables: {
      blocked_numbers: {
        Row: {
          created_at: string;
          id: string;
          line_id: string;
          number: string;
          reason: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          line_id: string;
          number: string;
          reason?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          line_id?: string;
          number?: string;
          reason?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocked_numbers_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'lines';
            referencedColumns: ['id'];
          },
        ];
      };
      calls: {
        Row: {
          caller_number: string;
          created_at: string;
          id: string;
          line_id: string;
          provider_call_sid: string;
          received_at: string;
          status: Database['missed_call']['Enums']['call_status'];
          texted_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          caller_number: string;
          created_at?: string;
          id?: string;
          line_id: string;
          provider_call_sid: string;
          received_at?: string;
          status?: Database['missed_call']['Enums']['call_status'];
          texted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          caller_number?: string;
          created_at?: string;
          id?: string;
          line_id?: string;
          provider_call_sid?: string;
          received_at?: string;
          status?: Database['missed_call']['Enums']['call_status'];
          texted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calls_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'lines';
            referencedColumns: ['id'];
          },
        ];
      };
      cell_verification_sends: {
        Row: {
          created_at: string;
          id: string;
          owner_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cell_verifications: {
        Row: {
          attempts: number;
          code_hash: string;
          created_at: string;
          expires_at: string;
          owner_id: string;
          phone: string;
          salt: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          code_hash: string;
          created_at?: string;
          expires_at: string;
          owner_id: string;
          phone: string;
          salt: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          owner_id?: string;
          phone?: string;
          salt?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lines: {
        Row: {
          after_hours_template: string | null;
          business_name: string;
          created_at: string;
          id: string;
          owner_cell: string;
          owner_cell_verified: boolean;
          owner_id: string;
          provider_messaging_service_sid: string | null;
          provider_number: string | null;
          quiet_hours: Json | null;
          template: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          after_hours_template?: string | null;
          business_name: string;
          created_at?: string;
          id?: string;
          owner_cell: string;
          owner_cell_verified?: boolean;
          owner_id: string;
          provider_messaging_service_sid?: string | null;
          provider_number?: string | null;
          quiet_hours?: Json | null;
          template: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          after_hours_template?: string | null;
          business_name?: string;
          created_at?: string;
          id?: string;
          owner_cell?: string;
          owner_cell_verified?: boolean;
          owner_id?: string;
          provider_messaging_service_sid?: string | null;
          provider_number?: string | null;
          quiet_hours?: Json | null;
          template?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          body: string;
          call_id: string;
          created_at: string;
          direction: Database['missed_call']['Enums']['message_direction'];
          id: string;
          kind: string;
          provider_message_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          call_id: string;
          created_at?: string;
          direction: Database['missed_call']['Enums']['message_direction'];
          id?: string;
          kind?: string;
          provider_message_id?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: string;
          call_id?: string;
          created_at?: string;
          direction?: Database['missed_call']['Enums']['message_direction'];
          id?: string;
          kind?: string;
          provider_message_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_call_id_fkey';
            columns: ['call_id'];
            isOneToOne: false;
            referencedRelation: 'calls';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_help_reply: {
        Args: { p_body: string; p_caller: string; p_line_id: string };
        Returns: string;
      };
      clear_opt_out: { Args: { p_line_id: string; p_number: string }; Returns: undefined };
      confirm_owner_cell: { Args: { p_owner_id: string; p_phone: string }; Returns: boolean };
      consume_cell_attempt: { Args: { p_owner_id: string }; Returns: number };
      log_missed_call: {
        Args: {
          p_allow_text?: boolean;
          p_call_sid: string;
          p_caller: string;
          p_cooldown?: string;
          p_daily_cap?: number;
          p_hourly_cap?: number;
          p_line_id: string;
        };
        Returns: {
          call_id: string;
          first_contact: boolean;
          outcome: string;
        }[];
      };
      mark_call: {
        Args: { p_call_id: string; p_status: Database['missed_call']['Enums']['call_status'] };
        Returns: undefined;
      };
      record_reply: {
        Args: {
          p_body: string;
          p_caller: string;
          p_caller_daily_cap?: number;
          p_caller_hourly_cap?: number;
          p_caller_store_cap?: number;
          p_line_daily_cap?: number;
          p_line_hourly_cap?: number;
          p_line_id: string;
          p_provider_message_id: string;
        };
        Returns: {
          call_id: string;
          outcome: string;
        }[];
      };
      reserve_cell_code_send: {
        Args: {
          p_daily_limit?: number;
          p_limit: number;
          p_owner_id: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
    };
    Enums: {
      call_status: 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';
      message_direction: 'in' | 'out';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      feedback: {
        Row: {
          created_at: string;
          helped: boolean;
          id: string;
          note: string | null;
          tool_slug: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          helped: boolean;
          id?: string;
          note?: string | null;
          tool_slug: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          helped?: boolean;
          id?: string;
          note?: string | null;
          tool_slug?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: Database['public']['Enums']['membership_role'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: Database['public']['Enums']['membership_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database['public']['Enums']['membership_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          business_name: string | null;
          city: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          logo_path: string | null;
          phone: string | null;
          trade: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          business_name?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          logo_path?: string | null;
          phone?: string | null;
          trade?: string | null;
          updated_at?: string;
        };
        Update: {
          business_name?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          logo_path?: string | null;
          phone?: string | null;
          trade?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tool_usage: {
        Row: {
          created_at: string;
          first_used_at: string;
          id: string;
          last_used_at: string;
          tool_slug: string;
          updated_at: string;
          user_id: string;
          uses: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          first_used_at?: string;
          id?: string;
          last_used_at?: string;
          tool_slug: string;
          updated_at?: string;
          user_id: string;
          uses?: number;
        };
        Update: {
          created_at?: string;
          first_used_at?: string;
          id?: string;
          last_used_at?: string;
          tool_slug?: string;
          updated_at?: string;
          user_id?: string;
          uses?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_org_member: { Args: { org_id: string }; Returns: boolean };
      is_org_owner: { Args: { org_id: string }; Returns: boolean };
      org_has_members: { Args: { org_id: string }; Returns: boolean };
      record_tool_usage: { Args: { slug: string }; Returns: undefined };
    };
    Enums: {
      membership_role: 'owner' | 'member';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  job_photos: {
    Enums: {
      photo_kind: ['before', 'after'],
    },
  },
  missed_call: {
    Enums: {
      call_status: ['missed', 'texted', 'replied', 'called_back', 'booked', 'junk'],
      message_direction: ['in', 'out'],
    },
  },
  public: {
    Enums: {
      membership_role: ['owner', 'member'],
    },
  },
} as const;
