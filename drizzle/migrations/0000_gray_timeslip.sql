CREATE TABLE IF NOT EXISTS "ad_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"currency" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_spend_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"ad_account_id" text,
	"campaign_id" text,
	"adset_id" text,
	"adset_name" text,
	"ad_id" text,
	"ad_name" text,
	"spend" numeric(12, 2),
	"impressions" integer,
	"clicks" integer,
	"currency" text,
	"synced_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ad_spend_unique_row" UNIQUE("date","ad_account_id","campaign_id","adset_id","ad_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_account_id" text,
	"name" text,
	"objective" text,
	"status" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"meta_campaign_name" text,
	"meta_adset_name" text,
	"meta_ad_name" text,
	"platform" text,
	"fbclid" text,
	"landing_page_url" text,
	"ip_address" text,
	"user_agent" text,
	"referer" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"meta_pixel_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now(),
	"event" text,
	"status" text,
	"amount" numeric(12, 2),
	"currency" text DEFAULT 'BRL',
	"payment_method" text,
	"gateway" text,
	"product_id" text,
	"customer_email" text,
	"customer_name" text,
	"customer_document" text,
	"customer_phone" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"clickid" text,
	"matched" boolean DEFAULT false,
	"fbp" text,
	"capi_status" text DEFAULT 'not_applicable',
	"capi_sent_at" timestamp with time zone,
	"capi_response" jsonb,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_spend_snapshots" ADD CONSTRAINT "ad_spend_snapshots_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_spend_snapshots" ADD CONSTRAINT "ad_spend_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_clickid_clicks_id_fk" FOREIGN KEY ("clickid") REFERENCES "public"."clicks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_spend_date_account_idx" ON "ad_spend_snapshots" USING btree ("date","ad_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_created_at_idx" ON "clicks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_meta_campaign_id_idx" ON "clicks" USING btree ("meta_campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_received_at_idx" ON "sales" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_status_idx" ON "sales" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_product_id_idx" ON "sales" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_clickid_idx" ON "sales" USING btree ("clickid");