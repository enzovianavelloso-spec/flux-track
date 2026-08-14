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

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${env.metaAdAccountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_increment", "1"); // break out by day
  // "yesterday_and_today" isn't a valid date_preset (Meta only accepts named presets like
  // "yesterday"/"today" or an explicit range) — this API call 400'd on every run until now.
  url.searchParams.set("time_range", JSON.stringify({ since: yesterday, until: today }));
  url.searchParams.set("access_token", env.metaCapiToken);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta Insights API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? [];
}
