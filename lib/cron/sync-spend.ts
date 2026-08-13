import { db } from "@/lib/db/client";
import { adAccounts, campaigns, adSpendSnapshots } from "@/lib/db/schema";
import { fetchYesterdayAndTodayInsights } from "@/lib/meta/marketing-api";
import { env } from "@/lib/env";

export async function syncSpend() {
  const rows = await fetchYesterdayAndTodayInsights();
  if (!rows.length) return { upserted: 0 };

  await db.insert(adAccounts)
    .values({ id: env.metaAdAccountId, currency: rows[0].account_currency, updatedAt: new Date() })
    .onConflictDoUpdate({ target: adAccounts.id, set: { currency: rows[0].account_currency, updatedAt: new Date() } });

  const seenCampaigns = new Map<string, string>();
  for (const r of rows) seenCampaigns.set(r.campaign_id, r.campaign_name);
  for (const [id, name] of seenCampaigns) {
    await db.insert(campaigns)
      .values({ id, adAccountId: env.metaAdAccountId, name, updatedAt: new Date() })
      .onConflictDoUpdate({ target: campaigns.id, set: { name, updatedAt: new Date() } });
  }

  for (const r of rows) {
    await db.insert(adSpendSnapshots).values({
      date: r.date_start,
      adAccountId: env.metaAdAccountId,
      campaignId: r.campaign_id,
      adsetId: r.adset_id,
      adsetName: r.adset_name,
      adId: r.ad_id,
      adName: r.ad_name,
      spend: r.spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      currency: r.account_currency,
    }).onConflictDoUpdate({
      target: [adSpendSnapshots.date, adSpendSnapshots.adAccountId, adSpendSnapshots.campaignId, adSpendSnapshots.adsetId, adSpendSnapshots.adId],
      set: { spend: r.spend, impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0), syncedAt: new Date() },
    });
  }

  return { upserted: rows.length };
}
