// Phase 2: a drop-in replacement for the tRPC client, built on Supabase
// instead of the old Express/tRPC/MySQL server. Every existing call site
// (Home.tsx, ProjectIndex.tsx, Invite.tsx, useAuth.ts) keeps calling
// `trpc.<router>.<procedure>.useQuery(...)` / `.useMutation(...)` exactly as
// before — none of those files change. Only what happens underneath changes:
//
//   - Read-only, RLS-safe lookups (list/get/members/activity/shares) go
//     straight to PostgREST via the user-scoped Supabase client, so Postgres
//     RLS enforces the same visibility rules a server-side check would.
//   - Anything requiring authorization logic RLS can't express on its own
//     (create/update/delete/archive/restore/invite/accept/revoke/share, plus
//     the two public preview endpoints) calls the matching Supabase Edge
//     Function, which re-verifies auth/role/project on every call itself
//     (see supabase/functions/*/index.ts + _shared/db.ts) — the client never
//     has to be trusted for authorization, only for which button was clicked.
//
// Every `.useQuery`/`.useMutation` here is a thin wrapper around TanStack
// Query's own `useQuery`/`useMutation`, so `.data`, `.error`, `.isLoading`,
// `.isPending`, `.isSuccess`, `.isError`, `.refetch`, `.mutate`, and
// `.mutateAsync` all behave exactly as react-query defines them — nothing
// about that contract is reimplemented here.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { requireSupabaseClient } from "./supabaseClient";
import { previewPayloadToClientShape, projectRowToClientShape, rowToCamelCase, rowsToCamelCase } from "./caseMapping";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function currentUserId(): Promise<string | null> {
  const supabase = requireSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function currentUserEmail(): Promise<string | null> {
  const supabase = requireSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

/**
 * Invokes a Supabase Edge Function. supabase-js attaches the current
 * session's access token automatically (falling back to the anon key for the
 * two genuinely public functions), so this never has to touch auth headers
 * itself — but every function re-derives and re-checks the caller's identity
 * and role server-side regardless of what this sends.
 */
async function callFunction<TOutput = unknown>(name: string, body: unknown): Promise<TOutput> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    let message = error.message || "サーバーエラーが発生しました。";
    try {
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === "function") {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      }
    } catch {
      // Response body wasn't JSON (or already consumed) — fall back to error.message.
    }
    throw new Error(message);
  }
  return data as TOutput;
}

type ProjectAccessRole = "owner" | "editor" | "viewer";

// ---------------------------------------------------------------------------
// Explicit return-shape types.
//
// The original tRPC AppRouter gave every call site precise, inferred types
// for free. Nothing here infers automatically the same way, so each shape is
// spelled out explicitly and used as this module's functions' declared
// return types — that's what lets Home.tsx/ProjectIndex.tsx/Invite.tsx
// (unchanged) keep typechecking against field access like
// `remoteProjectQuery.data?.project`, `project.createdAt.toISOString()`, or
// `member.invitedEmail` exactly as they did against the old router.
// ---------------------------------------------------------------------------

export type ClientProject = {
  id: string;
  publicId: string;
  organizationId: string;
  ownerId: string;
  title: string;
  client: string | null;
  eventMonth: string | null;
  data: string; // JSON string — see caseMapping.ts's projectRowToClientShape
  dataSchemaVersion: number;
  archivedAt: Date | null;
  archiveExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectGetResult = { project: ClientProject; accessRole: ProjectAccessRole } | null;
export type ProjectListItem = { project: ClientProject; accessRole: ProjectAccessRole };
export type ArchivedProjectListItem = {
  project: ClientProject;
  accessRole: ProjectAccessRole;
  expiresAt: Date;
  daysRemaining: number;
};

export type ClientProjectMember = {
  id: string;
  projectId: string;
  userId: string | null;
  invitedEmail: string;
  role: "editor" | "viewer";
  status: "pending" | "active" | "revoked";
  inviteExpiresAt: Date | null;
  invitedByUserId: string;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type ProjectMembersResult = { accessRole: ProjectAccessRole; members: ClientProjectMember[] } | null;

export type ClientProjectActivity = {
  id: string;
  projectId: string;
  actorUserId: string | null;
  action: string;
  detail: string;
  createdAt: Date;
};

export type ClientProjectShare = {
  id: string;
  projectId: string;
  createdByUserId: string | null; // null for a viewer-forwarded child link
  expiresAt: Date;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
  createdAt: Date;
  parentShareLinkId: string | null; // set for a viewer-forwarded child link
};

export type InvitePreviewResult = {
  role: "editor" | "viewer";
  status: string;
  project: ClientProject | null;
  expiresAt: string;
} | null;
export type SharePreviewResult = { project: ClientProject; expiresAt: string } | null;

export type CreateProjectResult = { publicId: string };
export type SimpleSuccessResult = { success: true };
// applied: false = 送った内容に、進行メンバーが変更してよい項目の差分が無かった
// (＝サーバーは何も書き込んでいない)。エラーではない。
export type TaskProgressUpdateResult = { success: true; applied: boolean };
export type CreateInviteResult = { inviteUrl: string; tempPassword: string; role: "editor" | "viewer"; invitedBy: ProjectAccessRole; expiresAt: string };
export type AcceptInviteResult = { publicId: string; role: "editor" | "viewer" };
export type CreateShareResult = { shareUrl: string; expiresAt: string };
// create-forwarded-share-link returns a relative path (not an absolute URL —
// this public, no-JWT function accepts no `origin` input at all, see its own
// comment) — the caller must prefix it with window.location.origin + the
// app's base path before showing/copying it.
export type ForwardedShareResult = { shareUrl: string; expiresAt: string };

async function resolveProjectAndAccessRole(publicId: string) {
  const supabase = requireSupabaseClient();
  const userId = await currentUserId();
  if (!userId || !publicId) return null;

  const { data: project } = await supabase.from("projects").select("*").eq("public_id", publicId).maybeSingle();
  if (!project) return null; // not found, or RLS hid it — either way, nothing to show

  if (project.owner_id === userId) return { project, accessRole: "owner" as ProjectAccessRole };

  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return null;
  return { project, accessRole: member.role as ProjectAccessRole };
}

// ---------------------------------------------------------------------------
// auth.*
// ---------------------------------------------------------------------------

export type ShimUser = { id: string; email: string | null; name: string | null; role: "user" | "admin" };

async function fetchMe(): Promise<ShimUser | null> {
  const supabase = requireSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const authUser = data.session?.user;
  if (!authUser) return null;

  const { data: profile } = await supabase.from("profiles").select("id, email, full_name, role").eq("id", authUser.id).maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email ?? authUser.email ?? null,
    name: profile.full_name ?? profile.email ?? authUser.email ?? null,
    role: (profile.role as "user" | "admin") ?? "user",
  };
}

async function doLogout(): Promise<{ success: true }> {
  const supabase = requireSupabaseClient();
  await supabase.auth.signOut();
  return { success: true };
}

// ---------------------------------------------------------------------------
// projects.*
// ---------------------------------------------------------------------------

async function fetchProjectsList(archived: false): Promise<ProjectListItem[]>;
async function fetchProjectsList(archived: true): Promise<ArchivedProjectListItem[]>;
async function fetchProjectsList(archived: boolean): Promise<ProjectListItem[] | ArchivedProjectListItem[]> {
  const supabase = requireSupabaseClient();
  const userId = await currentUserId();
  if (!userId) return [];

  const archivedFilterCol = "archived_at";
  const [{ data: owned }, { data: memberRows }] = await Promise.all([
    archived
      ? supabase.from("projects").select("*").eq("owner_id", userId).not(archivedFilterCol, "is", null)
      : supabase.from("projects").select("*").eq("owner_id", userId).is(archivedFilterCol, null),
    supabase.from("project_members").select("project_id, role").eq("user_id", userId).eq("status", "active"),
  ]);

  const byPublicId = new Map<string, { project: ClientProject; accessRole: ProjectAccessRole; raw: Record<string, unknown> }>();
  (owned ?? []).forEach((row) => {
    byPublicId.set(row.public_id as string, { project: projectRowToClientShape(row) as ClientProject, accessRole: "owner", raw: row });
  });

  const invitedIds = (memberRows ?? []).map((r) => r.project_id as string).filter((id) => !owned?.some((o) => o.id === id));
  if (invitedIds.length) {
    let q = supabase.from("projects").select("*").in("id", invitedIds);
    q = archived ? q.not(archivedFilterCol, "is", null) : q.is(archivedFilterCol, null);
    const { data: invitedProjects } = await q;
    const roleById = new Map((memberRows ?? []).map((r) => [r.project_id as string, r.role as ProjectAccessRole]));
    (invitedProjects ?? []).forEach((row) => {
      if (byPublicId.has(row.public_id as string)) return;
      byPublicId.set(row.public_id as string, {
        project: projectRowToClientShape(row) as ClientProject,
        accessRole: roleById.get(row.id as string) ?? "viewer",
        raw: row,
      });
    });
  }

  const entries = Array.from(byPublicId.values());
  entries.sort((a, b) => new Date(b.raw.updated_at as string).getTime() - new Date(a.raw.updated_at as string).getTime());

  if (!archived) {
    return entries.map(({ project, accessRole }) => ({ project, accessRole }));
  }

  const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  return entries.map(({ project, accessRole, raw }) => {
    const archivedAt = raw.archived_at as string;
    const expiresAtIso = (raw.archive_expires_at as string | null) ?? new Date(new Date(archivedAt).getTime() + ARCHIVE_RETENTION_MS).toISOString();
    const expiresAt = new Date(expiresAtIso); // see caseMapping.ts's reviveDates comment: callers expect a real Date here (`.toISOString()` with no `new Date(...)` wrapper)
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    return { project, accessRole, expiresAt, daysRemaining };
  });
}

async function fetchProjectGet(input: { publicId: string }): Promise<ProjectGetResult> {
  const resolved = await resolveProjectAndAccessRole(input.publicId);
  if (!resolved) return null;
  return { project: projectRowToClientShape(resolved.project) as ClientProject, accessRole: resolved.accessRole };
}

async function fetchProjectMembers(input: { publicId: string }): Promise<ProjectMembersResult> {
  const resolved = await resolveProjectAndAccessRole(input.publicId);
  if (!resolved) return null;
  const supabase = requireSupabaseClient();
  const { data } = await supabase
    .from("project_members")
    .select("id, project_id, user_id, invited_email, role, status, invite_expires_at, invited_by_user_id, accepted_at, created_at, updated_at")
    .eq("project_id", resolved.project.id);
  return { accessRole: resolved.accessRole, members: rowsToCamelCase<ClientProjectMember>(data) };
}

async function fetchProjectActivity(input: { publicId: string }): Promise<ClientProjectActivity[]> {
  const resolved = await resolveProjectAndAccessRole(input.publicId);
  if (!resolved) return [];
  const supabase = requireSupabaseClient();
  const { data } = await supabase
    .from("project_activity")
    .select("id, project_id, actor_user_id, action, detail, created_at")
    .eq("project_id", resolved.project.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return rowsToCamelCase<ClientProjectActivity>(data);
}

async function fetchProjectShares(input: { publicId: string }): Promise<ClientProjectShare[]> {
  const resolved = await resolveProjectAndAccessRole(input.publicId);
  if (!resolved || resolved.accessRole === "viewer") return [];
  const supabase = requireSupabaseClient();
  const { data } = await supabase
    .from("project_share_links")
    .select(
      "id, project_id, created_by_user_id, expires_at, revoked_at, last_accessed_at, access_count, created_at, parent_share_link_id",
    )
    .eq("project_id", resolved.project.id)
    .order("created_at", { ascending: false });
  return rowsToCamelCase<ClientProjectShare>(data);
}

/**
 * Public, unauthenticated: mints a viewer-forwarded child share link for the
 * SAME project a valid share token already grants read access to — no login
 * required (see supabase/functions/create-forwarded-share-link/index.ts).
 * Input is ONLY the parent token; the server derives everything else
 * (project, expiry ceiling, ancestor validity) itself.
 */
async function createForwardedShare(input: { parentToken: string }): Promise<ForwardedShareResult> {
  return callFunction<ForwardedShareResult>("create-forwarded-share-link", input);
}

// invite-preview and get-shared-project are the two public, no-JWT endpoints,
// and both hand back the raw `projects` row: snake_case keys with `data` still
// a jsonb OBJECT. Every other query in this shim runs its rows through
// projectRowToClientShape first; these two did not, so `JSON.parse(remote.data)`
// in Home.tsx threw on "[object Object]" and the screen silently kept whatever
// project was already in local storage — i.e. a share link rendered the WRONG
// project. Map them at the same boundary as everything else.

async function fetchInvitePreview(input: { token: string }): Promise<InvitePreviewResult> {
  if (!input.token) return null;
  const result = await callFunction<Record<string, unknown> | null>("invite-preview", input);
  return previewPayloadToClientShape(result) as InvitePreviewResult;
}

async function fetchSharePreview(input: { token: string }): Promise<SharePreviewResult> {
  if (!input.token) return null;
  const result = await callFunction<Record<string, unknown> | null>("get-shared-project", input);
  return previewPayloadToClientShape(result) as SharePreviewResult;
}

// ---------------------------------------------------------------------------
// react-query wiring
// ---------------------------------------------------------------------------

function makeQuery<TInput, TOutput>(baseKey: string, fn: (input: TInput) => Promise<TOutput>) {
  return {
    useQuery(input: TInput, options?: Partial<UseQueryOptions<TOutput>>) {
      return useQuery<TOutput>({
        queryKey: [baseKey, input],
        queryFn: () => fn(input),
        retry: false,
        ...options,
      });
    },
  };
}

function makeMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  return {
    useMutation(options?: UseMutationOptions<TOutput, Error, TInput>) {
      return useMutation<TOutput, Error, TInput>({ mutationFn: fn, ...options });
    },
  };
}

export const trpc = {
  useUtils() {
    const queryClient = useQueryClient();
    return {
      auth: {
        me: {
          setData: (_input: undefined, data: ShimUser | null) => queryClient.setQueryData(["auth.me", undefined], data),
          invalidate: () => queryClient.invalidateQueries({ queryKey: ["auth.me"] }),
        },
      },
    };
  },
  auth: {
    me: makeQuery<undefined, ShimUser | null>("auth.me", fetchMe),
    logout: makeMutation<undefined, SimpleSuccessResult>(doLogout),
  },
  projects: {
    list: makeQuery("projects.list", () => fetchProjectsList(false)),
    listArchived: makeQuery("projects.listArchived", () => fetchProjectsList(true)),
    get: makeQuery("projects.get", fetchProjectGet),
    members: makeQuery("projects.members", fetchProjectMembers),
    activity: makeQuery("projects.activity", fetchProjectActivity),
    shares: makeQuery("projects.shares", fetchProjectShares),
    invitePreview: makeQuery("projects.invitePreview", fetchInvitePreview),
    sharePreview: makeQuery("projects.sharePreview", fetchSharePreview),

    create: makeMutation((input: { title: string; client?: string | null; eventMonth?: string | null; data: string }) =>
      callFunction<CreateProjectResult>("create-project", input),
    ),
    update: makeMutation((input: { publicId: string; title: string; client?: string | null; eventMonth?: string | null; data: string }) =>
      callFunction<SimpleSuccessResult>("update-project", input),
    ),
    // 進行メンバー(project_members.role = "viewer")の保存口。送る形は update と
    // 同じだが、実際に保存されるのはタスクの状態・担当者・担当引継ぎの記録だけで、
    // それ以外はサーバー側で捨てられる。どちらを呼ぶかは Home.tsx が役割で決める。
    updateTaskProgress: makeMutation((input: { publicId: string; title: string; client?: string | null; eventMonth?: string | null; data: string }) =>
      callFunction<TaskProgressUpdateResult>("update-task-progress", input),
    ),
    delete: makeMutation((input: { publicId: string }) => callFunction<SimpleSuccessResult>("delete-project", input)),
    archive: makeMutation((input: { publicId: string }) => callFunction<SimpleSuccessResult>("archive-project", input)),
    restore: makeMutation((input: { publicId: string }) => callFunction<SimpleSuccessResult>("restore-project", input)),
    invite: makeMutation((input: { publicId: string; email: string; role: "editor" | "viewer"; origin: string }) =>
      callFunction<CreateInviteResult>("create-invite", input),
    ),
    acceptInvite: makeMutation((input: { token: string }) => callFunction<AcceptInviteResult>("accept-invite", input)),
    revokeInvite: makeMutation((input: { publicId: string; memberId: string }) =>
      callFunction<SimpleSuccessResult>("revoke-invite", input),
    ),
    createShare: makeMutation((input: { publicId: string; origin: string; expiresInDays?: 1 | 7 | 30 }) =>
      callFunction<CreateShareResult>("create-share-link", input),
    ),
    revokeShare: makeMutation((input: { publicId: string; shareId: string }) =>
      callFunction<SimpleSuccessResult>("revoke-share-link", input),
    ),
    // Public, unauthenticated — see createForwardedShare's own comment above.
    createForwardedShare: makeMutation((input: { parentToken: string }) => createForwardedShare(input)),
  },
};

export { currentUserEmail };
