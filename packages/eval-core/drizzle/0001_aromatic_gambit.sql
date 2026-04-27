CREATE TABLE `memory_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`device_id` text NOT NULL,
	`project` text NOT NULL,
	`agent` text,
	`timestamp` text NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`tags` text NOT NULL,
	`sensitivity` text NOT NULL,
	`hash` text NOT NULL,
	`embedding_ref` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_records_hash_unique` ON `memory_records` (`hash`);