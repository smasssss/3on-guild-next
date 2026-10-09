CREATE TABLE `backups` (
	`mutation` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`saved_at` text NOT NULL,
	`actor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`hash` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`kind` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL,
	`last_mutation` text NOT NULL
);
