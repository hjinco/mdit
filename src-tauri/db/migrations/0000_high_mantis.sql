CREATE TABLE `doc` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rel_path` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_rel_path_unique` ON `doc` (`rel_path`);--> statement-breakpoint
CREATE TABLE `embedding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`segment_id` integer NOT NULL,
	`dim` integer NOT NULL,
	`vec` blob NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `embedding_segment_id_unique` ON `embedding` (`segment_id`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `segment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`last_hash` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_seg_doc_ord` ON `segment` (`doc_id`,`ordinal`);