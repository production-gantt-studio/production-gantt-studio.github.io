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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
          archive_expires_at: string | null;
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
          archive_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
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
        Relationships: [];
      };
      // --- Phase 2 additions (see supabase/migrations/20260821000008-000011) ---
      project_activity: {
        Row: {
          id: string;
          project_id: string;
          actor_user_id: string | null;
          action: string;
          detail: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          actor_user_id?: string | null;
          action: string;
          detail: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_activity"]["Insert"]>;
        Relationships: [];
      };
      project_share_links: {
        Row: {
          id: string;
          project_id: string;
          // token_hash intentionally omitted from Row: no authenticated
          // client can ever read it (column-level REVOKE in migration
          // 20260821000009) — only service_role, via an Edge Function.
          // created_by_user_id is nullable as of migration 20260821000014:
          // a viewer-forwarded child link (created by
          // create-forwarded-share-link, which is public/no-JWT) has no
          // authenticated creator.
          created_by_user_id: string | null;
          expires_at: string;
          revoked_at: string | null;
          last_accessed_at: string | null;
          access_count: number;
          created_at: string;
          // Null for a normal owner/editor-issued link; set to the parent's
          // id for a viewer-forwarded child (migration 20260821000014).
          parent_share_link_id: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          token_hash: string;
          created_by_user_id?: string | null;
          expires_at: string;
          revoked_at?: string | null;
          last_accessed_at?: string | null;
          access_count?: number;
          created_at?: string;
          parent_share_link_id?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["project_share_links"]["Insert"], "token_hash">>;
        Relationships: [];
      };
      security_audit_logs: {
        // No Row type exported: zero SELECT policies/grants exist for
        // anon/authenticated on this table (see migration 20260821000010) —
        // it is never read through the client-side Supabase client at all,
        // only written/read by Edge Functions running as service_role.
        Row: never;
        Insert: {
          id?: string;
          organization_id?: string | null;
          project_id?: string | null;
          actor_user_id?: string | null;
          event_type: string;
          outcome: "success" | "denied" | "failure";
          metadata?: Json;
          ip_hash?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["security_audit_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      is_org_member: { Args: { target_org_id: string }; Returns: boolean };
      is_org_owner_or_admin: { Args: { target_org_id: string }; Returns: boolean };
      is_project_member: { Args: { target_project_id: string }; Returns: boolean };
      is_project_owner: { Args: { target_project_id: string }; Returns: boolean };
      is_project_editor_or_owner: { Args: { target_project_id: string }; Returns: boolean };
      bootstrap_admin: { Args: { target_user_id: string }; Returns: Database["public"]["Tables"]["profiles"]["Row"] | null };
    };
  };
}
