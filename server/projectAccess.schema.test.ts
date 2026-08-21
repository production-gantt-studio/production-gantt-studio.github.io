import { describe, expect, it } from "vitest";
import { organizationMembers, organizations, projectActivity, projectMembers, projects, projectShareLinks, securityAuditLogs } from "../drizzle/schema";

describe("project access schema", () => {
  it("stores one durable project payload with an owner and a public identifier", () => {
    expect(projects.publicId.notNull).toBeTruthy();
    expect(projects.organizationId.notNull).toBeTruthy();
    expect(projects.ownerId.notNull).toBeTruthy();
    expect(projects.data.notNull).toBeTruthy();
  });

  it("supports a nullable archivedAt for server-side 30-day soft delete", () => {
    expect(projects.archivedAt.notNull).toBeFalsy();
  });

  it("supports editor and viewer invitations with revocable status", () => {
    expect(projectMembers.invitedEmail.notNull).toBeTruthy();
    expect(projectMembers.inviteTokenHash.notNull).toBeFalsy();
    expect(projectMembers.inviteExpiresAt.notNull).toBeFalsy();
    expect(projectMembers.role.enumValues).toEqual(["editor", "viewer"]);
    expect(projectMembers.status.enumValues).toEqual(["pending", "active", "revoked"]);
  });

  it("records project activity with a durable action and detail", () => {
    expect(projectActivity.projectId.notNull).toBeTruthy();
    expect(projectActivity.action.notNull).toBeTruthy();
    expect(projectActivity.detail.notNull).toBeTruthy();
  });

  it("scopes persisted work to an organization and supports expiring hashed share tokens", () => {
    expect(organizations.ownerId.notNull).toBeTruthy();
    expect(organizationMembers.organizationId.notNull).toBeTruthy();
    expect(projectShareLinks.tokenHash.notNull).toBeTruthy();
    expect(projectShareLinks.expiresAt.notNull).toBeTruthy();
  });

  it("stores security audit outcomes without keeping raw IP addresses", () => {
    expect(securityAuditLogs.eventType.notNull).toBeTruthy();
    expect(securityAuditLogs.outcome.notNull).toBeTruthy();
    expect(securityAuditLogs.ipHash.notNull).toBeFalsy();
  });
});
