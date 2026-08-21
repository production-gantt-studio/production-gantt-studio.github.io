import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomUUID } from "node:crypto";
import { InsertUser, organizationMembers, organizations, projectActivity, projectMembers, projects, projectShareLinks, securityAuditLogs, users } from "../drizzle/schema";
import { hashOpaqueToken } from "./securityTokens";
import { ARCHIVE_RETENTION_MS, archiveDaysRemaining, computeArchiveExpiresAt } from "../shared/projectArchive";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type ProjectAccessRole = "owner" | "editor" | "viewer";

export async function ensureOrganizationForOwner(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  const [existing] = await db.select().from(organizations).where(eq(organizations.ownerId, userId)).limit(1);
  if (existing) return existing;

  const publicId = `org-${randomUUID().slice(0, 12)}`;
  await db.insert(organizations).values({ publicId, name: "My Organization", ownerId: userId });
  const [organization] = await db.select().from(organizations).where(eq(organizations.publicId, publicId)).limit(1);
  if (!organization) throw new Error("組織を作成できませんでした。");
  await db.insert(organizationMembers).values({ organizationId: organization.id, userId, role: "owner" });
  return organization;
}

export async function ensureOrganizationMember(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  await db.insert(organizationMembers).values({ organizationId, userId, role: "member" }).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

export async function recordSecurityAudit(input: {
  organizationId?: number | null;
  projectId?: number | null;
  actorUserId?: number | null;
  eventType: string;
  outcome: "success" | "denied" | "failure";
  metadata: Record<string, unknown>;
  ipHash?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(securityAuditLogs).values({
    organizationId: input.organizationId ?? null,
    projectId: input.projectId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    outcome: input.outcome,
    metadata: JSON.stringify(input.metadata),
    ipHash: input.ipHash ?? null,
  });
}

export async function listProjectsForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  await purgeExpiredArchivedProjects();

  const owned = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .where(and(eq(projects.ownerId, userId), isNull(projects.archivedAt)));
  const invited = await db
    .select({ project: projects, member: projectMembers })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.status, "active"), isNull(projects.archivedAt)));

  const byPublicId = new Map<string, { project: typeof projects.$inferSelect; accessRole: ProjectAccessRole }>();
  owned.forEach(({ project }) => byPublicId.set(project.publicId, { project, accessRole: "owner" }));
  invited.forEach(({ project, member }) => {
    if (!byPublicId.has(project.publicId)) byPublicId.set(project.publicId, { project, accessRole: member.role });
  });
  return Array.from(byPublicId.values()).sort((a, b) => b.project.updatedAt.getTime() - a.project.updatedAt.getTime());
}

export async function listArchivedProjectsForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  await purgeExpiredArchivedProjects();

  const owned = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .where(and(eq(projects.ownerId, userId), isNotNull(projects.archivedAt)));
  const invited = await db
    .select({ project: projects, member: projectMembers })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.status, "active"), isNotNull(projects.archivedAt)));

  const byPublicId = new Map<string, { project: typeof projects.$inferSelect; accessRole: ProjectAccessRole }>();
  owned.forEach(({ project }) => byPublicId.set(project.publicId, { project, accessRole: "owner" }));
  invited.forEach(({ project, member }) => {
    if (!byPublicId.has(project.publicId)) byPublicId.set(project.publicId, { project, accessRole: member.role });
  });
  return Array.from(byPublicId.values())
    .filter((entry): entry is typeof entry & { project: { archivedAt: Date } } => Boolean(entry.project.archivedAt))
    .map(({ project, accessRole }) => ({
      project,
      accessRole,
      expiresAt: computeArchiveExpiresAt(project.archivedAt!),
      daysRemaining: archiveDaysRemaining(project.archivedAt!),
    }))
    .sort((a, b) => b.project.archivedAt!.getTime() - a.project.archivedAt!.getTime());
}

export async function archiveProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function restoreProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  await db.update(projects).set({ archivedAt: null }).where(eq(projects.id, projectId));
}

// No scheduled job: expiry is enforced lazily whenever a normal list or
// archive-list read happens (see listProjectsForUser / listArchivedProjectsForUser
// above), matching the original LocalStorage-only 30-day archive behavior.
export async function purgeExpiredArchivedProjects() {
  const db = await getDb();
  if (!db) return;
  const cutoff = new Date(Date.now() - ARCHIVE_RETENTION_MS);
  const expired = await db.select({ id: projects.id }).from(projects).where(and(isNotNull(projects.archivedAt), lt(projects.archivedAt, cutoff)));
  if (!expired.length) return;
  const ids = expired.map((row) => row.id);
  for (const id of ids) {
    await db.delete(projectActivity).where(eq(projectActivity.projectId, id));
    await db.delete(projectShareLinks).where(eq(projectShareLinks.projectId, id));
    await db.delete(projectMembers).where(eq(projectMembers.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }
}

export async function getProjectAccess(publicId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");

  const owned = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .where(and(eq(projects.publicId, publicId), eq(projects.ownerId, userId)))
    .limit(1);
  if (owned[0]) return { project: owned[0].project, accessRole: "owner" as const };

  const invited = await db
    .select({ project: projects, member: projectMembers })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .where(and(eq(projects.publicId, publicId), eq(projectMembers.userId, userId), eq(projectMembers.status, "active")))
    .limit(1);
  if (!invited[0]) return null;
  return { project: invited[0].project, accessRole: invited[0].member.role as "editor" | "viewer" };
}

export async function getProjectByInviteToken(inviteToken: string) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  const tokenHash = hashOpaqueToken(inviteToken);
  const rows = await db
    .select({ project: projects, member: projectMembers })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.inviteTokenHash, tokenHash), eq(projectMembers.status, "pending"), gt(projectMembers.inviteExpiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProjectByShareToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("データベースへ接続できません。");
  const tokenHash = hashOpaqueToken(token);
  const [row] = await db
    .select({ project: projects, share: projectShareLinks })
    .from(projectShareLinks)
    .innerJoin(projects, eq(projectShareLinks.projectId, projects.id))
    .where(and(eq(projectShareLinks.tokenHash, tokenHash), isNull(projectShareLinks.revokedAt), gt(projectShareLinks.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  await db.update(projectShareLinks).set({
    lastAccessedAt: new Date(),
    accessCount: sql`${projectShareLinks.accessCount} + 1`,
  }).where(eq(projectShareLinks.id, row.share.id));
  return row;
}
