import { pgTable, text, timestamp, numeric, boolean, jsonb, integer, bigserial, date, index, unique } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(), // GGCheckout product.id
  name: text("name").notNull(),
  metaPixelId: text("meta_pixel_id"), // pixel Meta específico dessa oferta
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const adAccounts = pgTable("ad_accounts", {
  id: text("id").primaryKey(), // "act_123..."
  name: text("name"),
  currency: text("currency"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  adAccountId: text("ad_account_id").references(() => adAccounts.id),
  name: text("name"),
  objective: text("objective"),
  status: text("status"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const clicks = pgTable("clicks", {
  id: text("id").primaryKey(), // clickid = base64url token
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  metaCampaignId: text("meta_campaign_id"),
  metaAdsetId: text("meta_adset_id"),
  metaAdId: text("meta_ad_id"),
  metaCampaignName: text("meta_campaign_name"),
  metaAdsetName: text("meta_adset_name"),
  metaAdName: text("meta_ad_name"),
  platform: text("platform"), // facebook/instagram/audience_network via {{site_source_name}}
  fbclid: text("fbclid"),
  landingPageUrl: text("landing_page_url"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  referer: text("referer"),
}, (t) => [
  index("clicks_created_at_idx").on(t.createdAt),
  index("clicks_meta_campaign_id_idx").on(t.metaCampaignId),
  index("clicks_meta_adset_id_idx").on(t.metaAdsetId),
  index("clicks_meta_ad_id_idx").on(t.metaAdId),
]);

export const sales = pgTable("sales", {
  id: text("id").primaryKey(), // GGCheckout payment.id (UUID) — upsert key, retry-safe
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
  event: text("event"), // pix.paid, card.generated, etc
  status: text("status"), // paid/pending/failed/refunded/charged_back
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency").default("BRL"),
  paymentMethod: text("payment_method"),
  gateway: text("gateway"),
  productId: text("product_id").references(() => products.id),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  customerDocument: text("customer_document"),
  customerPhone: text("customer_phone"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"), // raw echoed value (== clickid if round-trip worked)
  utmTerm: text("utm_term"),
  clickid: text("clickid").references(() => clicks.id), // NULL = unattributed, never blocks insert
  matched: boolean("matched").default(false),
  fbp: text("fbp"),
  // Purchase-stage CAPI (fires on *.paid). Kept on its own column set — separate from
  // capi_checkout_* below — because a single shared column can't dedup two independent
  // funnel stages: overwriting it from the checkout stage made the *.paid handler read
  // "already sent" and skip Purchase entirely (found 2026-08-19, see capi.ts).
  capiStatus: text("capi_status").default("not_applicable"), // pending/sent/failed/not_applicable
  capiAttempts: integer("capi_attempts").default(0).notNull(),
  capiSentAt: timestamp("capi_sent_at", { withTimezone: true }),
  capiResponse: jsonb("capi_response"),
  // Checkout-stage CAPI (InitiateCheckout + AddPaymentInfo, fires on *.generated).
  capiCheckoutStatus: text("capi_checkout_status").default("not_applicable"),
  capiCheckoutAttempts: integer("capi_checkout_attempts").default(0).notNull(),
  capiCheckoutSentAt: timestamp("capi_checkout_sent_at", { withTimezone: true }),
  capiCheckoutResponse: jsonb("capi_checkout_response"),
  rawPayload: jsonb("raw_payload").notNull(), // full webhook body incl. products[] upsells
}, (t) => [
  index("sales_received_at_idx").on(t.receivedAt),
  index("sales_status_idx").on(t.status),
  index("sales_product_id_idx").on(t.productId),
  index("sales_clickid_idx").on(t.clickid),
  index("sales_capi_status_idx").on(t.capiStatus),
  index("sales_capi_checkout_status_idx").on(t.capiCheckoutStatus),
]);

// One row per inbound webhook request, written before any business-logic processing —
// gives the /admin diagnostics panel and CAPI retry cron something to read even when
// the request body was malformed or the secret check failed.
export const webhookLogs = pgTable("webhook_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  provider: text("provider").notNull(), // "ggcheckout"
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
  headers: jsonb("headers"), // sanitized: auth/secret headers stripped before storing
  payload: jsonb("payload"),
  validated: boolean("validated").notNull(),
  processed: boolean("processed").default(false).notNull(),
  error: text("error"),
  retryCount: integer("retry_count").default(0).notNull(),
  durationMs: integer("duration_ms"),
  saleId: text("sale_id").references(() => sales.id),
}, (t) => [
  index("webhook_logs_received_at_idx").on(t.receivedAt),
  index("webhook_logs_provider_idx").on(t.provider),
  index("webhook_logs_processed_idx").on(t.processed),
]);

// One row per browser/device subscribed to sale push notifications. Single-user app —
// no owner column needed, just every endpoint that ever granted permission.
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  keys: jsonb("keys").notNull(), // { p256dh, auth } — required by the Web Push encryption spec
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const adSpendSnapshots = pgTable("ad_spend_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  date: date("date").notNull(),
  adAccountId: text("ad_account_id").references(() => adAccounts.id),
  campaignId: text("campaign_id").references(() => campaigns.id),
  adsetId: text("adset_id"),
  adsetName: text("adset_name"),
  adId: text("ad_id"),
  adName: text("ad_name"),
  spend: numeric("spend", { precision: 12, scale: 2 }),
  impressions: integer("impressions"),
  clicks: integer("clicks"),
  currency: text("currency"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("ad_spend_date_account_idx").on(t.date, t.adAccountId),
  unique("ad_spend_unique_row").on(t.date, t.adAccountId, t.campaignId, t.adsetId, t.adId),
]);
