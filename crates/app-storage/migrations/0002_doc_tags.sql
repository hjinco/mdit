CREATE TABLE `doc_tag` (
	`doc_id` integer NOT NULL,
	`tag` text NOT NULL,
	`normalized_tag` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `doc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_doc_tag_doc_normalized` ON `doc_tag` (`doc_id`,`normalized_tag`);
--> statement-breakpoint
CREATE INDEX `idx_doc_tag_normalized_doc` ON `doc_tag` (`normalized_tag`,`doc_id`);
