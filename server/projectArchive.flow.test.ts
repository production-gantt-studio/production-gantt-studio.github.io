import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const getDb = vi.hoisted(() => vi.fn());
const getProjectAccess = vi.hoisted(() => vi.fn());
const listProjectsForUser = vi.hoisted(() => vi.fn());
const listArchivedProjectsForUser = vi.hoisted(() => vi.fn());
const archiveProject = vi.hoisted(() => vi.fn());
const restoreProject = vi.hoisted(() => vi.fn());
const ensureOrganizationForOwner = vi.hoisted(() => vi.fn());
const ensureOrganizationMember = vi.hoisted(() => vi.fn());
const getProjectByInviteToken = vi.hoisted(() => vi.fn());
const getProjectByShareToken = vi.hoisted(() => vi.fn());
const recordSecurityAudit = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  getDb,
  getProjectAccess,
  listProjectsForUser,
  listArchivedProjectsForUser,
  archiveProject,
  restoreProject,
  ensureOrganizationForOwner,
  ensureOrganizationMember,
  getProjectByInviteToken,
  getProjectByShareToken,
  recordSecurityAudit,
}));

import { appRouter } from "./routers";

const now = new Date("2026-08-20T00:00:00.000Z");
const activeProject = { id: 10, publicId: "project-archive-test", organizationId: 5, ownerId: 1, title: "アーカイブ検証案件", client: null, eventMonth: null, data: "{}", archivedAt: null, createdAt: now, updatedAt: now };

function context(role: "user" | "admin" = "user") {
  return {
    // authenticatedAt must be "just now" (wall-clock), not the fixed `now`
    // fixture above — requireRecentAuthentication compares it against a live
    // Date.now() with a 15-minute window.
    user: { id: 1, openId: "owner-open-id", email: "owner@example.com", name: "Owner", loginMethod: "oauth", role, createdAt: now, updatedAt: now, lastSignedIn: now, authenticatedAt: new Date() },
    req: { ip: "203.0.113.5" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

describe("project archive flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // recordProjectActivity() (called on every successful archive/restore)
    // reaches through getDb() to insert an activity-log row.
    getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })) });
  });

  it("lets the owner archive their active project, starting the 30-day retention window", async () => {
    getProjectAccess.mockResolvedValue({ project: activeProject, accessRole: "owner" });
    archiveProject.mockResolvedValue(undefined);

    const result = await appRouter.createCaller(context()).projects.archive({ publicId: activeProject.publicId });

    expect(result).toEqual({ success: true });
    expect(archiveProject).toHaveBeenCalledWith(activeProject.id);
  });

  it("lets an organization admin archive a project they don't own", async () => {
    getProjectAccess.mockResolvedValue({ project: activeProject, accessRole: "editor" });
    archiveProject.mockResolvedValue(undefined);

    const result = await appRouter.createCaller(context("admin")).projects.archive({ publicId: activeProject.publicId });

    expect(result).toEqual({ success: true });
  });

  it("blocks an editor (non-owner, non-admin) from archiving", async () => {
    getProjectAccess.mockResolvedValue({ project: activeProject, accessRole: "editor" });

    await expect(appRouter.createCaller(context()).projects.archive({ publicId: activeProject.publicId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(archiveProject).not.toHaveBeenCalled();
  });

  it("blocks a viewer from archiving or restoring", async () => {
    getProjectAccess.mockResolvedValue({ project: activeProject, accessRole: "viewer" });

    await expect(appRouter.createCaller(context()).projects.archive({ publicId: activeProject.publicId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).projects.restore({ publicId: activeProject.publicId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(archiveProject).not.toHaveBeenCalled();
    expect(restoreProject).not.toHaveBeenCalled();
  });

  it("lets an editor restore an archived project", async () => {
    getProjectAccess.mockResolvedValue({ project: { ...activeProject, archivedAt: now }, accessRole: "editor" });
    restoreProject.mockResolvedValue(undefined);

    const result = await appRouter.createCaller(context()).projects.restore({ publicId: activeProject.publicId });

    expect(result).toEqual({ success: true });
    expect(restoreProject).toHaveBeenCalledWith(activeProject.id);
  });

  it("rejects archive/restore for a user with no access at all (different organization)", async () => {
    getProjectAccess.mockResolvedValue(null);

    await expect(appRouter.createCaller(context()).projects.archive({ publicId: activeProject.publicId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).projects.restore({ publicId: activeProject.publicId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(archiveProject).not.toHaveBeenCalled();
    expect(restoreProject).not.toHaveBeenCalled();
  });

  it("routes projects.list and projects.listArchived to their respective db-layer queries, scoped to the caller", async () => {
    listProjectsForUser.mockResolvedValue([{ project: activeProject, accessRole: "owner" }]);
    listArchivedProjectsForUser.mockResolvedValue([]);

    await appRouter.createCaller(context()).projects.list();
    await appRouter.createCaller(context()).projects.listArchived();

    expect(listProjectsForUser).toHaveBeenCalledWith(1);
    expect(listArchivedProjectsForUser).toHaveBeenCalledWith(1);
  });
});
