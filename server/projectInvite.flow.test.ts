import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const getDb = vi.hoisted(() => vi.fn());
const getProjectAccess = vi.hoisted(() => vi.fn());
const getProjectByInviteToken = vi.hoisted(() => vi.fn());
const listProjectsForUser = vi.hoisted(() => vi.fn());
const ensureOrganizationForOwner = vi.hoisted(() => vi.fn());
const ensureOrganizationMember = vi.hoisted(() => vi.fn());
const getProjectByShareToken = vi.hoisted(() => vi.fn());
const recordSecurityAudit = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({ getDb, getProjectAccess, getProjectByInviteToken, getProjectByShareToken, listProjectsForUser, ensureOrganizationForOwner, ensureOrganizationMember, recordSecurityAudit }));

import { appRouter } from "./routers";

const now = new Date("2026-08-20T00:00:00.000Z");
const project = { id: 10, publicId: "project-invite-test", organizationId: 5, ownerId: 1, title: "招待検証案件", client: null, eventMonth: null, data: "{}", createdAt: now, updatedAt: now };
const member = { id: 20, projectId: 10, userId: null, invitedEmail: "editor@example.com", role: "editor" as const, status: "pending" as const, inviteToken: null, inviteTokenHash: "hash", inviteExpiresAt: new Date("2026-08-27T00:00:00.000Z"), invitedByUserId: 1, acceptedAt: null, createdAt: now, updatedAt: now };

function context(email = "editor@example.com"): TrpcContext {
  return {
    user: { id: 2, openId: "editor-open-id", email, name: "Editor", loginMethod: "oauth", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now, authenticatedAt: now },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("project invitation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the project payload only through a viewer invitation", async () => {
    getProjectByInviteToken.mockResolvedValue({ project, member: { ...member, role: "viewer" } });
    const viewer = await appRouter.createCaller({ ...context(), user: null }).projects.invitePreview({ token: "a".repeat(43) });
    expect(viewer.role).toBe("viewer");
    expect(viewer.project?.publicId).toBe(project.publicId);

    getProjectByInviteToken.mockResolvedValue({ project, member });
    const editor = await appRouter.createCaller({ ...context(), user: null }).projects.invitePreview({ token: "a".repeat(43) });
    expect(editor.role).toBe("editor");
    expect(editor.project).toBeNull();
  });

  it("accepts an editor invitation only for the invited email and activates membership", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })), insert: vi.fn(() => ({ values })) };
    getDb.mockResolvedValue(db);
    getProjectByInviteToken.mockResolvedValue({ project, member });

    const result = await appRouter.createCaller(context()).projects.acceptInvite({ token: "a".repeat(43) });
    expect(result).toEqual({ publicId: project.publicId, role: "editor" });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(ensureOrganizationMember).toHaveBeenCalledWith(project.organizationId, 2);
  });
});
