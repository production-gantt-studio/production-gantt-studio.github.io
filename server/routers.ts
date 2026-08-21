import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { archiveProject, ensureOrganizationForOwner, ensureOrganizationMember, getDb, getProjectAccess, getProjectByInviteToken, getProjectByShareToken, listArchivedProjectsForUser, listProjectsForUser, restoreProject, recordSecurityAudit } from "./db";
import { projectActivity, projectMembers, projectShareLinks, projects } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createOpaqueToken, hashIpAddress, hashOpaqueToken } from "./securityTokens";

const projectInput = z.object({
  title: z.string().trim().min(1).max(255),
  client: z.string().trim().max(255).optional().nullable(),
  eventMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  data: z.string().min(2).max(3_000_000),
});

const inviteInput = z.object({
  publicId: z.string().min(1).max(64),
  email: z.string().trim().email().max(320),
  role: z.enum(["editor", "viewer"]),
  origin: z.string().url(),
});

const shareInput = z.object({
  publicId: z.string().min(1).max(64),
  origin: z.string().url(),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
});

const tokenInput = z.string().min(40).max(96);
const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000;

function requireRecentAuthentication(user: { authenticatedAt?: Date | null }) {
  const authenticatedAt = user.authenticatedAt?.getTime() ?? 0;
  if (Date.now() - authenticatedAt > RECENT_AUTH_WINDOW_MS) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "安全のため、ログインし直してからこの操作を行ってください。" });
  }
}

async function requireProjectRole(publicId: string, userId: number, required: "viewer" | "editor") {
  const access = await getProjectAccess(publicId, userId);
  if (!access || (required === "editor" && access.accessRole === "viewer")) {
    await recordSecurityAudit({ actorUserId: userId, eventType: "project.access", outcome: "denied", metadata: { publicId, required } });
    throw new TRPCError({ code: "FORBIDDEN", message: "この案件を編集する権限がありません。" });
  }
  return access;
}

async function recordProjectActivity(projectId: number, actorUserId: number | null, action: string, detail: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(projectActivity).values({ projectId, actorUserId, action, detail });
}

async function recordSecurityEvent(ctx: { user: { id: number } | null; req: { ip?: string } }, input: { eventType: string; outcome: "success" | "denied" | "failure"; projectId?: number; organizationId?: number; metadata: Record<string, unknown> }) {
  await recordSecurityAudit({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorUserId: ctx.user?.id ?? null,
    eventType: input.eventType,
    outcome: input.outcome,
    metadata: input.metadata,
    ipHash: hashIpAddress(ctx.req.ip),
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => listProjectsForUser(ctx.user.id)),
    get: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).query(async ({ ctx, input }) => requireProjectRole(input.publicId, ctx.user.id, "viewer")),
    create: protectedProcedure.input(projectInput).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "新規案件を作成する権限がありません。" });
      requireRecentAuthentication(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      const organization = await ensureOrganizationForOwner(ctx.user.id);
      const publicId = `project-${randomUUID().slice(0, 12)}`;
      await db.insert(projects).values({ publicId, organizationId: organization.id, ownerId: ctx.user.id, title: input.title, client: input.client ?? null, eventMonth: input.eventMonth ?? null, data: input.data });
      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.publicId, publicId)).limit(1);
      if (project) await recordProjectActivity(project.id, ctx.user.id, "案件作成", `「${input.title}」を作成しました。`);
      await recordSecurityEvent(ctx, { eventType: "project.create", outcome: "success", organizationId: organization.id, projectId: project?.id, metadata: { publicId } });
      return { publicId };
    }),
    update: protectedProcedure.input(projectInput.extend({ publicId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      await db.update(projects).set({ title: input.title, client: input.client ?? null, eventMonth: input.eventMonth ?? null, data: input.data }).where(eq(projects.publicId, input.publicId));
      await recordProjectActivity(access.project.id, ctx.user.id, "案件更新", `「${input.title}」の内容を更新しました。`);
      await recordSecurityEvent(ctx, { eventType: "project.update", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { publicId: input.publicId } });
      return { success: true } as const;
    }),
    delete: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      if (access.accessRole !== "owner" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "案件を削除する権限がありません。" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      await db.delete(projectActivity).where(eq(projectActivity.projectId, access.project.id));
      await db.delete(projectShareLinks).where(eq(projectShareLinks.projectId, access.project.id));
      await db.delete(projectMembers).where(eq(projectMembers.projectId, access.project.id));
      await db.delete(projects).where(eq(projects.id, access.project.id));
      await recordSecurityEvent(ctx, { eventType: "project.delete", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { publicId: input.publicId } });
      return { success: true } as const;
    }),
    listArchived: protectedProcedure.query(async ({ ctx }) => listArchivedProjectsForUser(ctx.user.id)),
    archive: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      // Same authority tier as hard delete: archiving starts the 30-day
      // countdown toward the same outcome, so it gets the same protection.
      if (access.accessRole !== "owner" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "案件をアーカイブする権限がありません。" });
      await archiveProject(access.project.id);
      await recordProjectActivity(access.project.id, ctx.user.id, "案件アーカイブ", `「${access.project.title}」をアーカイブへ移しました。30日以内は復元できます。`);
      await recordSecurityEvent(ctx, { eventType: "project.archive", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { publicId: input.publicId } });
      return { success: true } as const;
    }),
    restore: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      await restoreProject(access.project.id);
      await recordProjectActivity(access.project.id, ctx.user.id, "案件復元", `「${access.project.title}」をアーカイブから復元しました。`);
      await recordSecurityEvent(ctx, { eventType: "project.restore", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { publicId: input.publicId } });
      return { success: true } as const;
    }),
    members: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
      const access = await requireProjectRole(input.publicId, ctx.user.id, "viewer");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      const rows = await db.select({ member: projectMembers }).from(projectMembers).innerJoin(projects, eq(projectMembers.projectId, projects.id)).where(eq(projects.publicId, input.publicId));
      return { accessRole: access.accessRole, members: rows.map(({ member }) => member) };
    }),
    invite: protectedProcedure.input(inviteInput).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      const [project] = await db.select().from(projects).where(eq(projects.publicId, input.publicId)).limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "案件が見つかりません。" });
      const email = input.email.toLowerCase();
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const existing = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.invitedEmail, email))).limit(1);
      const nextInvite = { role: input.role, status: "pending" as const, userId: null, acceptedAt: null, inviteToken: null, inviteTokenHash: hashOpaqueToken(token), inviteExpiresAt: expiresAt, invitedByUserId: ctx.user.id };
      if (existing[0]) await db.update(projectMembers).set(nextInvite).where(eq(projectMembers.id, existing[0].id));
      else await db.insert(projectMembers).values({ projectId: project.id, invitedEmail: email, ...nextInvite });
      await recordProjectActivity(project.id, ctx.user.id, "招待作成", `${email} を${input.role === "editor" ? "編集者" : "閲覧者"}として招待しました。`);
      await recordSecurityEvent(ctx, { eventType: "project.invite.create", outcome: "success", organizationId: project.organizationId, projectId: project.id, metadata: { role: input.role } });
      const url = new URL("/invite", input.origin);
      url.searchParams.set("token", token);
      return { inviteUrl: url.toString(), role: input.role, invitedBy: access.accessRole, expiresAt };
    }),
    acceptInvite: protectedProcedure.input(z.object({ token: tokenInput })).mutation(async ({ ctx, input }) => {
      const target = await getProjectByInviteToken(input.token);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "招待リンクが見つからないか、期限切れです。" });
      if (!ctx.user.email || ctx.user.email.toLowerCase() !== target.member.invitedEmail.toLowerCase()) throw new TRPCError({ code: "FORBIDDEN", message: "招待されたメールアドレスでログインしてください。" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      await db.update(projectMembers).set({ userId: ctx.user.id, status: "active", acceptedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null }).where(eq(projectMembers.id, target.member.id));
      await ensureOrganizationMember(target.project.organizationId, ctx.user.id);
      await recordProjectActivity(target.project.id, ctx.user.id, "招待受諾", `招待を受諾し、${target.member.role === "editor" ? "編集者" : "閲覧者"}として参加しました。`);
      await recordSecurityEvent(ctx, { eventType: "project.invite.accept", outcome: "success", organizationId: target.project.organizationId, projectId: target.project.id, metadata: { role: target.member.role } });
      return { publicId: target.project.publicId, role: target.member.role };
    }),
    revokeInvite: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64), memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      await db.update(projectMembers).set({ status: "revoked", inviteTokenHash: null, inviteExpiresAt: null }).where(and(eq(projectMembers.id, input.memberId), eq(projectMembers.projectId, access.project.id)));
      await recordProjectActivity(access.project.id, ctx.user.id, "招待取消", "メンバー招待を取り消しました。");
      await recordSecurityEvent(ctx, { eventType: "project.invite.revoke", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { memberId: input.memberId } });
      return { success: true } as const;
    }),
    activity: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
      const access = await requireProjectRole(input.publicId, ctx.user.id, "viewer");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      return db.select().from(projectActivity).where(eq(projectActivity.projectId, access.project.id)).orderBy(desc(projectActivity.createdAt)).limit(100);
    }),
    invitePreview: publicProcedure.input(z.object({ token: tokenInput })).query(async ({ ctx, input }) => {
      const target = await getProjectByInviteToken(input.token);
      if (!target) {
        await recordSecurityEvent(ctx, { eventType: "project.invite.preview", outcome: "denied", metadata: { reason: "invalid_or_expired" } });
        throw new TRPCError({ code: "NOT_FOUND", message: "招待リンクが見つからないか、期限切れです。" });
      }
      await recordSecurityEvent(ctx, { eventType: "project.invite.preview", outcome: "success", organizationId: target.project.organizationId, projectId: target.project.id, metadata: { role: target.member.role } });
      return { role: target.member.role, status: target.member.status, project: target.member.role === "viewer" ? target.project : null, expiresAt: target.member.inviteExpiresAt };
    }),
    createShare: protectedProcedure.input(shareInput).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
      await db.insert(projectShareLinks).values({ projectId: access.project.id, tokenHash: hashOpaqueToken(token), createdByUserId: ctx.user.id, expiresAt });
      await recordProjectActivity(access.project.id, ctx.user.id, "共有リンク作成", `${input.expiresInDays}日で期限切れになる閲覧専用リンクを作成しました。`);
      await recordSecurityEvent(ctx, { eventType: "project.share.create", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { expiresInDays: input.expiresInDays } });
      const url = new URL("/project", input.origin);
      url.searchParams.set("share", token);
      return { shareUrl: url.toString(), expiresAt };
    }),
    revokeShare: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64), shareId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      requireRecentAuthentication(ctx.user);
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      await db.update(projectShareLinks).set({ revokedAt: new Date() }).where(and(eq(projectShareLinks.id, input.shareId), eq(projectShareLinks.projectId, access.project.id)));
      await recordSecurityEvent(ctx, { eventType: "project.share.revoke", outcome: "success", organizationId: access.project.organizationId, projectId: access.project.id, metadata: { shareId: input.shareId } });
      return { success: true } as const;
    }),
    shares: protectedProcedure.input(z.object({ publicId: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
      const access = await requireProjectRole(input.publicId, ctx.user.id, "editor");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベースへ接続できません。" });
      return db.select({ id: projectShareLinks.id, expiresAt: projectShareLinks.expiresAt, revokedAt: projectShareLinks.revokedAt, lastAccessedAt: projectShareLinks.lastAccessedAt, accessCount: projectShareLinks.accessCount, createdAt: projectShareLinks.createdAt }).from(projectShareLinks).where(eq(projectShareLinks.projectId, access.project.id)).orderBy(desc(projectShareLinks.createdAt));
    }),
    sharePreview: publicProcedure.input(z.object({ token: tokenInput })).query(async ({ ctx, input }) => {
      const target = await getProjectByShareToken(input.token);
      if (!target) {
        await recordSecurityEvent(ctx, { eventType: "project.share.access", outcome: "denied", metadata: { reason: "invalid_expired_or_revoked" } });
        throw new TRPCError({ code: "NOT_FOUND", message: "共有リンクが無効、失効、または取り消されています。" });
      }
      await recordSecurityEvent(ctx, { eventType: "project.share.access", outcome: "success", organizationId: target.project.organizationId, projectId: target.project.id, metadata: { shareId: target.share.id } });
      return { project: target.project, expiresAt: target.share.expiresAt };
    }),
  }),
});

export type AppRouter = typeof appRouter;
