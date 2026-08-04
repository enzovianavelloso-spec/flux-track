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
  capiStatus: text("capi_status").default("not_applicable"), // pending/sent/failed/not_applicable
  capiSentAt: timestamp("capi_sent_at", { withTimezone: true }),
  capiResponse: jsonb("capi_response"),
  rawPayload: jsonb("raw_payload").notNull(), // full webhook body incl. products[] upsells
}, (t) => [
  index("sales_received_at_idx").on(t.receivedAt),
  index("sales_status_idx").on(t.status),
  index("sales_product_id_idx").on(t.productId),
  index("sales_clickid_idx").on(t.clickid),
]);

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
