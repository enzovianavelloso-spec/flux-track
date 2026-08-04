import { env } from "@/lib/env";

const GRAPH_VERSION = "v21.0";

export interface InsightRow {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  account_currency: string;
}

// Pull model — Marketing API has no push mechanism. Re-pulls today's date on purpose:
// same-day numbers keep settling, so overwriting is intentional (see sync-spend.ts upsert).
export async function fetchYesterdayAndTodayInsights(): Promise<InsightRow[]> {
  const fields = [
    "campaign_id", "campaign_name", "adset_id", "adset_name",
    "ad_id", "ad_name", "spend", "impressions", "clicks", "account_currency",
  ].join(",");

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${env.metaAdAccountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_increment", "1"); // break out by day
  url.searchParams.set("date_preset", "yesterday_and_today");
  url.searchParams.set("access_token", env.metaCapiToken);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta Insights API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? [];
}
