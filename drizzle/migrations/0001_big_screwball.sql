CREATE TABLE IF NOT EXISTS "webhook_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now(),
	"headers" jsonb,
	"payload" jsonb,
	"validated" boolean NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"sale_id" text
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "capi_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_logs_received_at_idx" ON "webhook_logs" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_logs_provider_idx" ON "webhook_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_logs_processed_idx" ON "webhook_logs" USING btree ("processed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_meta_adset_id_idx" ON "clicks" USING btree ("meta_adset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_meta_ad_id_idx" ON "clicks" USING btree ("meta_ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_capi_status_idx" ON "sales" USING btree ("capi_status");