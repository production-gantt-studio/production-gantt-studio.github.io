ALTER TABLE `projects` ADD `archivedAt` timestamp;--> statement-breakpoint
CREATE INDEX `projects_archived_at_idx` ON `projects` (`archivedAt`);