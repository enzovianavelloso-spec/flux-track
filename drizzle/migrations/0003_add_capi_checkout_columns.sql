ALTER TABLE "sales" ADD COLUMN "capi_checkout_status" text DEFAULT 'not_applicable';--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "capi_checkout_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "capi_checkout_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "capi_checkout_response" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_capi_checkout_status_idx" ON "sales" USING btree ("capi_checkout_status");