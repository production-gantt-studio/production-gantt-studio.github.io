// Phase 1 Supabase foundation.
//
// Hand-authored to match supabase/migrations/*.sql exactly, in the same
// shape the Supabase CLI's own generator produces. Once a session is
// actually connected to the real project, regenerate the authoritative
// version with:
//
//   pnpm db:types
//   (i.e. `supabase gen types typescript --linked --schema public`)
//
// and replace this file wholesale — do not hand-merge. Nothing in the
// existing app imports this file yet (Phase 1 does not wire the client over
// to Supabase); it exists so Phase 2 has type safety available from day one.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: "user" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: "user" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      organizations: {
        Row: {
          id: string;
          public_id: string;
          name: string;
          owner_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_id: string;
          name: string;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_members"]["Insert"]>;
      };
      projects: {
        Row: {
          id: string;
          public_id: string;
          organization_id: string;
          owner_id: string;
          title: string;
          client: string | null;
          event_month: string | null;
          data: Json;
          data_schema_version: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_id: string;
          organization_id: string;
          owner_id: string;
          title: string;
          client?: string | null;
          event_month?: string | null;
          data?: Json;
          data_schema_version?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string | null;
          invited_email: string;
          role: "editor" | "viewer";
          status: "pending" | "active" | "revoked";
          invite_token_hash: string | null;
          invite_expires_at: string | null;
          invited_by_user_id: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id?: string | null;
          invited_email: string;
          role: "editor" | "viewer";
          status?: "pending" | "active" | "revoked";
          invite_token_hash?: string | null;
          invite_expires_at?: string | null;
          invited_by_user_id: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        // invite_token_hash is intentionally omitted from Update: no
        // authenticated client can read or write it (see migrations
        // 20260821000005 and 20260821000007) — only service_role, via an
        // Edge Function, ever touches it.
        Update: Partial<Omit<Database["public"]["Tables"]["project_members"]["Insert"], "invite_token_hash">>;
      };
    };
    Functions: {
      is_org_member: { Args: { target_org_id: string }; Returns: boolean };
      is_org_owner_or_admin: { Args: { target_org_id: string }; Returns: boolean };
      is_project_member: { Args: { target_project_id: string }; Returns: boolean };
      is_project_owner: { Args: { target_project_id: string }; Returns: boolean };
    };
  };
}
