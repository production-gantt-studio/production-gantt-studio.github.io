import { index, int, longtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("organizations_public_id_unique").on(table.publicId),
  index("organizations_owner_id_idx").on(table.ownerId),
]);

export const organizationMembers = mysqlTable("organization_members", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("organization_members_organization_user_unique").on(table.organizationId, table.userId),
  index("organization_members_user_id_idx").on(table.userId),
]);

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull(),
  organizationId: int("organizationId").notNull(),
  ownerId: int("ownerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  client: varchar("client", { length: 255 }),
  eventMonth: varchar("eventMonth", { length: 7 }),
  data: longtext("data").notNull(),
  // Soft-delete: set when an admin/owner archives the project. Restorable for
  // ARCHIVE_RETENTION_MS (30 days) from this timestamp; null means active.
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("projects_public_id_unique").on(table.publicId),
  index("projects_organization_id_idx").on(table.organizationId),
  index("projects_owner_id_idx").on(table.ownerId),
  index("projects_archived_at_idx").on(table.archivedAt),
]);

export const projectMembers = mysqlTable("project_members", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId"),
  invitedEmail: varchar("invitedEmail", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["editor", "viewer"]).notNull(),
  status: mysqlEnum("status", ["pending", "active", "revoked"]).default("pending").notNull(),
  inviteToken: varchar("inviteToken", { length: 96 }),
  inviteTokenHash: varchar("inviteTokenHash", { length: 64 }),
  inviteExpiresAt: timestamp("inviteExpiresAt"),
  invitedByUserId: int("invitedByUserId").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("project_members_invite_token_unique").on(table.inviteToken),
  uniqueIndex("project_members_invite_token_hash_unique").on(table.inviteTokenHash),
  uniqueIndex("project_members_project_email_unique").on(table.projectId, table.invitedEmail),
  index("project_members_user_id_idx").on(table.userId),
  index("project_members_project_id_idx").on(table.projectId),
]);

export const projectShareLinks = mysqlTable("project_share_links", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  lastAccessedAt: timestamp("lastAccessedAt"),
  accessCount: int("accessCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("project_share_links_token_hash_unique").on(table.tokenHash),
  index("project_share_links_project_id_idx").on(table.projectId),
  index("project_share_links_expires_at_idx").on(table.expiresAt),
]);

export const projectActivity = mysqlTable("project_activity", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  actorUserId: int("actorUserId"),
  action: varchar("action", { length: 80 }).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("project_activity_project_id_created_at_idx").on(table.projectId, table.createdAt),
]);

export const securityAuditLogs = mysqlTable("security_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId"),
  projectId: int("projectId"),
  actorUserId: int("actorUserId"),
  eventType: varchar("eventType", { length: 96 }).notNull(),
  outcome: mysqlEnum("outcome", ["success", "denied", "failure"]).notNull(),
  metadata: text("metadata").notNull(),
  ipHash: varchar("ipHash", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("security_audit_logs_organization_created_at_idx").on(table.organizationId, table.createdAt),
  index("security_audit_logs_project_created_at_idx").on(table.projectId, table.createdAt),
  index("security_audit_logs_event_created_at_idx").on(table.eventType, table.createdAt),
]);

export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectShareLink = typeof projectShareLinks.$inferSelect;
export type ProjectActivity = typeof projectActivity.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type SecurityAuditLog = typeof securityAuditLogs.$inferSelect;
