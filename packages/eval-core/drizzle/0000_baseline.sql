CREATE TABLE `agent_invocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_ppid` text NOT NULL,
	`session_id` text,
	`timestamp` text NOT NULL,
	`agent_type` text NOT NULL,
	`model` text NOT NULL,
	`outcome` text NOT NULL,
	`pattern_used` text,
	`skill_name` text,
	`description` text,
	`error_summary` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_trajectories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`baseline_id` integer,
	`agent_name` text NOT NULL,
	`model` text,
	`observed_steps` integer NOT NULL,
	`observed_tool_calls` integer NOT NULL,
	`observed_latency_ms` integer NOT NULL,
	`correctness` integer NOT NULL,
	`step_ratio` real,
	`tool_call_ratio` real,
	`latency_ratio` real,
	`session_id` text,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`baseline_id`) REFERENCES `eval_baselines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `eval_baselines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`capability` text NOT NULL,
	`ideal_steps` integer NOT NULL,
	`ideal_tool_calls` integer NOT NULL,
	`ideal_latency_ms` integer NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`turn_id` text,
	`session_id` text,
	`score` integer,
	`verdict` text,
	`tags` text,
	`comment` text,
	`evaluated_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`turn_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `improvement_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feedback_source` text NOT NULL,
	`target_type` text NOT NULL,
	`target_name` text NOT NULL,
	`action_type` text NOT NULL,
	`description` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`evidence` text,
	`priority` integer DEFAULT 0,
	`cooldown_days` integer DEFAULT 7,
	`conflict_resolved_by` text,
	`applied_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cwd` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_cwd_unique` ON `projects` (`cwd`);--> statement-breakpoint
CREATE TABLE `session_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`rating` integer,
	`tags` text,
	`comment` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`project_id` integer,
	`started_at` text NOT NULL,
	`ended_at` text,
	`cwd` text,
	`pid` integer,
	`duration_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`estimated_cost_usd` real,
	`token_source` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_id_unique` ON `sessions` (`session_id`);--> statement-breakpoint
CREATE TABLE `turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`input_preview` text,
	`output_preview` text,
	`input_chars` integer,
	`output_chars` integer,
	`estimated_input_tokens` integer,
	`estimated_output_tokens` integer,
	`timestamp` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turns_turn_id_unique` ON `turns` (`turn_id`);