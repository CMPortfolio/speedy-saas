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
        Row: { id: string; name: string; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; created_by: string; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; created_by?: string; created_at?: string; updated_at?: string };
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
  missed_call: {
    Tables: {
      lines: {
        Row: {
          id: string;
          owner_id: string;
          provider_number: string | null;
          owner_cell: string;
          business_name: string;
          template: string;
          after_hours_template: string | null;
          quiet_hours: Json | null;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          provider_number?: string | null;
          owner_cell: string;
          business_name: string;
          template: string;
          after_hours_template?: string | null;
          quiet_hours?: Json | null;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          provider_number?: string | null;
          owner_cell?: string;
          business_name?: string;
          template?: string;
          after_hours_template?: string | null;
          quiet_hours?: Json | null;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          line_id: string;
          caller_number: string;
          provider_call_sid: string;
          received_at: string;
          status: 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';
          texted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          line_id: string;
          caller_number: string;
          provider_call_sid: string;
          received_at?: string;
          status?: 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';
          texted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          line_id?: string;
          caller_number?: string;
          provider_call_sid?: string;
          received_at?: string;
          status?: 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';
          texted_at?: string | null;
          created_at?: string;
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
      messages: {
        Row: {
          id: string;
          call_id: string;
          direction: 'in' | 'out';
          body: string;
          provider_message_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          call_id: string;
          direction: 'in' | 'out';
          body: string;
          provider_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          call_id?: string;
          direction?: 'in' | 'out';
          body?: string;
          provider_message_id?: string | null;
          created_at?: string;
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
      blocked_numbers: {
        Row: {
          id: string;
          line_id: string;
          number: string;
          reason: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          line_id: string;
          number: string;
          reason?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          line_id?: string;
          number?: string;
          reason?: string;
          created_at?: string;
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
    };
    Views: Record<never, never>;
    Functions: {
      log_missed_call: {
        Args: { p_line_id: string; p_caller: string; p_call_sid: string; p_cooldown?: string };
        Returns: { call_id: string; outcome: string; first_contact: boolean }[];
      };
    };
    Enums: {
      call_status: 'missed' | 'texted' | 'replied' | 'called_back' | 'booked' | 'junk';
      message_direction: 'in' | 'out';
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertOf<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateOf<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
