CREATE TABLE `sync_vault` (
	`vault_id` integer PRIMARY KEY NOT NULL,
	`remote_vault_id` text,
	`last_synced_commit_id` text,
	`current_key_version` integer NOT NULL DEFAULT 0,
	`last_remote_head_seen` text,
	`last_scan_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`vault_id`) REFERENCES `vault`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vault_id` integer NOT NULL,
	`entry_id` text NOT NULL,
	`parent_entry_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`local_path` text NOT NULL,
	`last_known_size` integer,
	`last_known_mtime_ns` integer,
	`last_known_content_hash` text,
	`last_synced_blob_id` text,
	`last_synced_content_hash` text,
	`sync_state` text NOT NULL DEFAULT 'pending',
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`vault_id`) REFERENCES `sync_vault`(`vault_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sync_entry_vault_entry_id` ON `sync_entry` (`vault_id`, `entry_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sync_entry_vault_local_path` ON `sync_entry` (`vault_id`, `local_path`);
--> statement-breakpoint
CREATE INDEX `idx_sync_entry_vault_parent` ON `sync_entry` (`vault_id`, `parent_entry_id`);
--> statement-breakpoint
CREATE TABLE `sync_conflict` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vault_id` integer NOT NULL,
	`entry_id` text,
	`original_path` text NOT NULL,
	`conflict_path` text NOT NULL,
	`base_commit_id` text,
	`remote_commit_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'open',
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`vault_id`) REFERENCES `sync_vault`(`vault_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sync_conflict_vault_status_created` ON `sync_conflict` (`vault_id`, `status`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `sync_exclusion_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vault_id` integer NOT NULL,
	`local_path` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`vault_id`) REFERENCES `sync_vault`(`vault_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sync_exclusion_vault_created` ON `sync_exclusion_event` (`vault_id`, `created_at` DESC);
--> statement-breakpoint
CREATE VIEW `sync_entry_abs_path` AS
SELECT
	id,
	vault_id,
	entry_id,
	substr(
		(SELECT workspace_root FROM vault WHERE id = sync_entry.vault_id) || '/' || local_path,
		length((SELECT workspace_root FROM vault WHERE id = sync_entry.vault_id)) + 2
	) AS `rel_path`
FROM `sync_entry`
WHERE EXISTS (
	SELECT 1 FROM vault
	WHERE id = sync_entry.vault_id
);
--> statement-breakpoint
CREATE VIEW `sync_exclusion_event_abs_path` AS
SELECT
	id,
	vault_id,
	substr(
		(SELECT workspace_root FROM vault WHERE id = sync_exclusion_event.vault_id) || '/' || local_path,
		length((SELECT workspace_root FROM vault WHERE id = sync_exclusion_event.vault_id)) + 2
	) AS `rel_path`
FROM `sync_exclusion_event`
WHERE EXISTS (
	SELECT 1 FROM vault
	WHERE id = sync_exclusion_event.vault_id
);
