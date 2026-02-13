CREATE TABLE `vault` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_root` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_workspace_root_unique` ON `vault` (`workspace_root`);
--> statement-breakpoint
CREATE TABLE `doc` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vault_id` integer NOT NULL,
	`rel_path` text NOT NULL,
	`content` text NOT NULL,
	`chunking_version` integer NOT NULL,
	`last_hash` text,
	`last_source_size` integer,
	`last_source_mtime_ns` integer,
	`last_embedding_model` text,
	`last_embedding_dim` integer,
	FOREIGN KEY (`vault_id`) REFERENCES `vault`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_doc_vault_rel_path` ON `doc` (`vault_id`,`rel_path`);
--> statement-breakpoint
CREATE INDEX `idx_doc_vault_embedding` ON `doc` (`vault_id`,`last_embedding_model`,`last_embedding_dim`);
--> statement-breakpoint
CREATE INDEX `idx_doc_indexed_count` ON `doc` (`vault_id`) WHERE `last_hash` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `segment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`last_hash` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `segment_vec` (
	`rowid` integer PRIMARY KEY NOT NULL,
	`embedding` blob NOT NULL,
	FOREIGN KEY (`rowid`) REFERENCES `segment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_seg_doc_ord` ON `segment` (`doc_id`,`ordinal`);
--> statement-breakpoint
CREATE TABLE `link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_doc_id` integer NOT NULL,
	`target_doc_id` integer,
	`target_path` text NOT NULL,
	FOREIGN KEY (`source_doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_link_source_target_path` ON `link` (`source_doc_id`,`target_path`);
--> statement-breakpoint
CREATE INDEX `idx_link_source` ON `link` (`source_doc_id`);
--> statement-breakpoint
CREATE INDEX `idx_link_target_source` ON `link` (`target_doc_id`,`source_doc_id`);
--> statement-breakpoint
CREATE INDEX `idx_link_unresolved_target_path_source` ON `link` (`target_path`,`source_doc_id`) WHERE `target_doc_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `wiki_link_ref` (
	`source_doc_id` integer NOT NULL,
	`query_key` text NOT NULL,
	FOREIGN KEY (`source_doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_wiki_link_ref_source_query` ON `wiki_link_ref` (`source_doc_id`,`query_key`);
--> statement-breakpoint
CREATE INDEX `idx_wiki_link_ref_query_source` ON `wiki_link_ref` (`query_key`,`source_doc_id`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `doc_fts` USING fts5(
	`content`,
	content='doc',
	content_rowid='id',
	tokenize='unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `doc_ai` AFTER INSERT ON `doc` BEGIN
	INSERT INTO `doc_fts`(`rowid`,`content`) VALUES (new.`id`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `doc_ad` AFTER DELETE ON `doc` BEGIN
	INSERT INTO `doc_fts`(`doc_fts`,`rowid`,`content`) VALUES ('delete', old.`id`, old.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `doc_au` AFTER UPDATE OF `content` ON `doc` BEGIN
	INSERT INTO `doc_fts`(`doc_fts`,`rowid`,`content`) VALUES ('delete', old.`id`, old.`content`);
	INSERT INTO `doc_fts`(`rowid`,`content`) VALUES (new.`id`, new.`content`);
END;
