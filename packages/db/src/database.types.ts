// Generated-shape types for the shared Supabase project. Regenerate with `pnpm db:types`
// (local) or `pnpm db:types:remote` (hosted) after every migration and commit the result.
// Until the hosted project exists this file is maintained by hand in the generator's format.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          business_name: string | null;
          trade: string | null;
          city: string | null;
          phone: string | null;
          logo_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          business_name?: string | null;
          trade?: string | null;
          city?: string | null;
          phone?: string | null;
          logo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          business_name?: string | null;
          trade?: string | null;
          city?: string | null;
          phone?: string | null;
          logo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: Database['public']['Enums']['membership_role'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: Database['public']['Enums']['membership_role'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: Database['public']['Enums']['membership_role'];
          created_at?: string;
          updated_at?: string;
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
      tool_usage: {
        Row: {
          id: string;
          user_id: string;
          tool_slug: string;
          first_used_at: string;
          last_used_at: string;
          uses: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tool_slug: string;
          first_used_at?: string;
          last_used_at?: string;
          uses?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tool_slug?: string;
          first_used_at?: string;
          last_used_at?: string;
          uses?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          tool_slug: string;
          helped: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          tool_slug: string;
          helped: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          tool_slug?: string;
          helped?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      record_tool_usage: { Args: { slug: string }; Returns: undefined };
      is_org_member: { Args: { org_id: string }; Returns: boolean };
      is_org_owner: { Args: { org_id: string }; Returns: boolean };
    };
    Enums: { membership_role: 'owner' | 'member' };
    CompositeTypes: Record<never, never>;
  };
  rain_day: {
    Tables: {
      customers: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          phone: string;
          service_day: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          phone: string;
          service_day: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          phone?: string;
          service_day?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      help_replies: {
        Row: {
          phone: string;
          last_sent_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          phone: string;
          last_sent_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          phone?: string;
          last_sent_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opt_outs: {
        Row: {
          id: string;
          owner_id: string;
          phone: string;
          opted_out_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          phone: string;
          opted_out_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          phone?: string;
          opted_out_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reschedules: {
        Row: {
          id: string;
          owner_id: string;
          from_date: string;
          to_date: string;
          template: string;
          idempotency_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          from_date: string;
          to_date: string;
          template: string;
          idempotency_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          from_date?: string;
          to_date?: string;
          template?: string;
          idempotency_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reschedule_messages: {
        Row: {
          id: string;
          reschedule_id: string;
          customer_id: string | null;
          customer_name: string;
          body: string;
          status: string;
          provider: string | null;
          provider_message_id: string | null;
          error_code: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reschedule_id: string;
          customer_id?: string | null;
          customer_name: string;
          body: string;
          status?: string;
          provider?: string | null;
          provider_message_id?: string | null;
          error_code?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reschedule_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          body?: string;
          status?: string;
          provider?: string | null;
          provider_message_id?: string | null;
          error_code?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      owner_settings: {
        Row: {
          owner_id: string;
          owner_cell: string | null;
          owner_cell_verified_at: string | null;
          sender_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          owner_cell?: string | null;
          owner_cell_verified_at?: string | null;
          sender_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          owner_id?: string;
          owner_cell?: string | null;
          owner_cell_verified_at?: string | null;
          sender_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      phone_verifications: {
        Row: {
          owner_id: string;
          phone: string;
          code_hash: string;
          salt: string;
          expires_at: string;
          attempts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          phone: string;
          code_hash: string;
          salt: string;
          expires_at: string;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          owner_id?: string;
          phone?: string;
          code_hash?: string;
          salt?: string;
          expires_at?: string;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      verification_sends: {
        Row: {
          id: string;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      replies: {
        Row: {
          id: string;
          owner_id: string;
          customer_id: string | null;
          customer_name: string;
          reschedule_message_id: string | null;
          body: string;
          provider_message_id: string | null;
          forward_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          customer_id?: string | null;
          customer_name: string;
          reschedule_message_id?: string | null;
          body: string;
          provider_message_id?: string | null;
          forward_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          reschedule_message_id?: string | null;
          body?: string;
          provider_message_id?: string | null;
          forward_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      contacted_customers: { Args: Record<PropertyKey, never>; Returns: string[] };
      claim_help_reply: {
        Args: { p_phone: string };
        Returns: boolean;
      };
      consume_verification_attempt: {
        Args: { p_owner_id: string };
        Returns: number | null;
      };
      record_reply: {
        Args: {
          p_owner_id: string;
          p_from: string;
          p_provider_message_id: string;
          p_body: string;
          p_forward_cap: number;
        };
        Returns: {
          matched: boolean;
          duplicate: boolean;
          reply_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          owner_cell: string | null;
          forward: boolean;
        }[];
      };
      reserve_verification_send: {
        Args: {
          p_owner_id: string;
          p_limit: number;
          p_window_seconds: number;
          p_daily_limit: number;
        };
        Returns: boolean;
      };
      previously_texted: {
        Args: { p_reschedule_id: string };
        Returns: string[];
      };
      create_reschedule: {
        Args: {
          p_idempotency_key: string;
          p_from_date: string;
          p_to_date: string;
          p_template: string;
          p_messages: Json;
        };
        Returns: { reschedule_id: string; created: boolean }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertOf<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateOf<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** Row types for a tool's own schema, e.g. `SchemaTables<'rain_day', 'customers'>`. */
export type SchemaTables<
  S extends keyof Database,
  T extends keyof Database[S]['Tables'],
> = Database[S]['Tables'][T] extends { Row: infer R } ? R : never;
export type SchemaInsertOf<
  S extends keyof Database,
  T extends keyof Database[S]['Tables'],
> = Database[S]['Tables'][T] extends { Insert: infer I } ? I : never;
export type SchemaUpdateOf<
  S extends keyof Database,
  T extends keyof Database[S]['Tables'],
> = Database[S]['Tables'][T] extends { Update: infer U } ? U : never;
