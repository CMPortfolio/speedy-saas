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
  job_photos: {
    Tables: {
      jobs: {
        Row: {
          id: string;
          owner_id: string | null;
          share_slug: string;
          title: string | null;
          note: string | null;
          business_name: string | null;
          logo_path: string | null;
          review_url: string | null;
          claim_token_hash: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          share_slug: string;
          title?: string | null;
          note?: string | null;
          business_name?: string | null;
          logo_path?: string | null;
          review_url?: string | null;
          claim_token_hash?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          share_slug?: string;
          title?: string | null;
          note?: string | null;
          business_name?: string | null;
          logo_path?: string | null;
          review_url?: string | null;
          claim_token_hash?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      photos: {
        Row: {
          id: string;
          job_id: string;
          kind: Database['job_photos']['Enums']['photo_kind'];
          storage_path: string;
          width: number;
          height: number;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          kind: Database['job_photos']['Enums']['photo_kind'];
          storage_path: string;
          width: number;
          height: number;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          kind?: Database['job_photos']['Enums']['photo_kind'];
          storage_path?: string;
          width?: number;
          height?: number;
          position?: number;
          created_at?: string;
          updated_at?: string;
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
    Views: Record<never, never>;
    Functions: {
      owns_job: { Args: { job: string }; Returns: boolean };
    };
    Enums: { photo_kind: 'before' | 'after' };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertOf<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateOf<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
