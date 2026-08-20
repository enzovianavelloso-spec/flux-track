ALTER TABLE "campaigns" ADD COLUMN "effective_status" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "daily_budget" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "lifetime_budget" numeric(12, 2);