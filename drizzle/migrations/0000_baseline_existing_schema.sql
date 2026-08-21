-- Baseline snapshot of the schema this project's production database
-- already had before drizzle-kit migration tracking was introduced
-- (2026-08-20). Every table below is expected to already exist there.
--
-- DO NOT run this file directly against the real database — it would try
-- to CREATE TABLE things that already exist. It exists only so
-- `drizzle-kit generate` has a correct starting point to diff future
-- schema changes (like 0001_project_archive.sql) against.
--
-- Before running `pnpm db:migrate` for the first time on that database,
-- run `pnpm db:baseline` once — it records this file as already applied
-- (by hash) without executing its SQL. See scripts/db-baseline.ts for the
-- full explanation. A brand-new, empty database does not need this step;
-- `pnpm db:migrate` alone is correct there.

CREATE TABLE `organization_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_members_organization_user_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_public_id_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `project_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(80) NOT NULL,
	`detail` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int,
	`invitedEmail` varchar(320) NOT NULL,
	`role` enum('editor','viewer') NOT NULL,
	`status` enum('pending','active','revoked') NOT NULL DEFAULT 'pending',
	`inviteToken` varchar(96),
	`inviteTokenHash` varchar(64),
	`inviteExpiresAt` timestamp,
	`invitedByUserId` int NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_members_invite_token_unique` UNIQUE(`inviteToken`),
	CONSTRAINT `project_members_invite_token_hash_unique` UNIQUE(`inviteTokenHash`),
	CONSTRAINT `project_members_project_email_unique` UNIQUE(`projectId`,`invitedEmail`)
);
--> statement-breakpoint
CREATE TABLE `project_share_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`lastAccessedAt` timestamp,
	`accessCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_share_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_share_links_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`organizationId` int NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`client` varchar(255),
	`eventMonth` varchar(7),
	`data` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_public_id_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `security_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int,
	`projectId` int,
	`actorUserId` int,
	`eventType` varchar(96) NOT NULL,
	`outcome` enum('success','denied','failure') NOT NULL,
	`metadata` text NOT NULL,
	`ipHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `organization_members_user_id_idx` ON `organization_members` (`userId`);--> statement-breakpoint
CREATE INDEX `organizations_owner_id_idx` ON `organizations` (`ownerId`);--> statement-breakpoint
CREATE INDEX `project_activity_project_id_created_at_idx` ON `project_activity` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `project_members_user_id_idx` ON `project_members` (`userId`);--> statement-breakpoint
CREATE INDEX `project_members_project_id_idx` ON `project_members` (`projectId`);--> statement-breakpoint
CREATE INDEX `project_share_links_project_id_idx` ON `project_share_links` (`projectId`);--> statement-breakpoint
CREATE INDEX `project_share_links_expires_at_idx` ON `project_share_links` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `projects_organization_id_idx` ON `projects` (`organizationId`);--> statement-breakpoint
CREATE INDEX `projects_owner_id_idx` ON `projects` (`ownerId`);--> statement-breakpoint
CREATE INDEX `security_audit_logs_organization_created_at_idx` ON `security_audit_logs` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `security_audit_logs_project_created_at_idx` ON `security_audit_logs` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `security_audit_logs_event_created_at_idx` ON `security_audit_logs` (`eventType`,`createdAt`);