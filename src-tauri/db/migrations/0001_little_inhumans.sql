CREATE TABLE `link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_doc_id` integer NOT NULL,
	`target_doc_id` integer,
	`target_path` text NOT NULL,
	`target_anchor` text,
	`alias` text,
	`is_embed` integer NOT NULL,
	`is_wiki` integer NOT NULL,
	`is_external` integer NOT NULL,
	FOREIGN KEY (`source_doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_link_source` ON `link` (`source_doc_id`);--> statement-breakpoint
CREATE INDEX `idx_link_target` ON `link` (`target_doc_id`);--> statement-breakpoint
CREATE INDEX `idx_link_target_path` ON `link` (`target_path`);--> statement-breakpoint
ALTER TABLE `doc` ADD `last_link_hash` text DEFAULT '' NOT NULL;