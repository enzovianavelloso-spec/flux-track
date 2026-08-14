import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sales, clicks, adSpendSnapshots, products, campaigns } from "@/lib/db/schema";

// ad_spend_snapshots.date comes straight from Meta's Insights API `date_start`, which is
// expressed in the ad account's reporting timezone — not UTC. sales.received_at and
// clicks.created_at are `timestamptz` (stored UTC). Comparing a UTC timestamp's raw date
// against Meta's local calendar day is off by the UTC offset near midnight (e.g. a sale at
// 2026-08-04 01:00 UTC is still 2026-08-03 22:00 in São Paulo) — ROAS/profit near day
// boundaries would silently mix the wrong day's spend with the wrong day's revenue.
// Single ad account, single advertiser timezone — hardcoding is correct until a second
// account with a different timezone exists (that would need adAccounts.timezone stored).
const ACCOUNT_TIMEZONE = "America/Sao_Paulo";
// sql.raw, not a bind parameter: Postgres requires GROUP BY / ORDER BY expressions to be
// textually identical to their SELECT counterpart to be recognized as the same grouping key.
// Three separate `${ACCOUNT_TIMEZONE}` interpolations would become three distinct bind
// parameters ($1/$2/$3) — same value at runtime, but Postgres can't know that at parse time,
// so it rejects the query ("column must appear in GROUP BY"). ACCOUNT_TIMEZONE is a hardcoded
// internal constant, never user input, so inlining it as raw SQL text is safe here.
const TZ = sql.raw(`'${ACCOUNT_TIMEZONE}'`);

export interface DashboardFilters {
  from?: string; // ISO date
  to?: string;
  campaign?: string; // clicks.meta_campaign_name
  platform?: string; // clicks.platform
  productId?: string;
}

export interface DashboardResult {
  netRevenue: number;
  adSpend: number;
  roas: number | null;
  profit: number;
  epc: number | null; // net revenue / clicks
  cpa: number | null; // ad spend / paid sales
  conversionRate: number | null; // paid / clicks
  funnel: { clicks: number; generated: number; paid: number };
  dailyRevenue: { date: string; amount: number }[]; // sparkline — respects the same filters as everything else
  filterOptions: {
    products: { id: string; name: string }[];
    campaigns: string[];
    platforms: string[];
  };
  roi: number | null; // profit / adSpend
  margin: number | null; // profit / netRevenue
  pendingRevenue: number;
  refundedRevenue: number;
  chargebackRate: number | null; // charged_back count / total count, any status
  paymentBreakdown: { method: string; count: number; revenue: number }[];
  approvalRates: { method: string; rate: number | null }[]; // paid / (paid + failed)
  productBreakdown: { productId: string; name: string; count: number; revenue: number }[];
  sourceBreakdown: { platform: string; count: number; revenue: number }[];
  // true when platform/productId is filtered — ad_spend_snapshots has no platform/product
  // column, only campaignId, so spend can't be segmented on those axes (campaign filtering
  // of spend IS applied, see spendConds below).
  adSpendCaveat: boolean;
}

// Filters that reach `sales` only through `clicks` (campaign, platform) — both single
// JOIN-free subqueries on the same shape, kept together so saleConds/clickConds/dailyRevenue
// apply them identically instead of drifting out of sync.
function saleClickConds(f: Pick<DashboardFilters, "campaign" | "platform">) {
  const conds = [];
  if (f.campaign) conds.push(sql`${sales.clickid} in (select ${clicks.id} from ${clicks} where ${clicks.metaCampaignName} = ${f.campaign})`);
  if (f.platform) conds.push(sql`${sales.clickid} in (select ${clicks.id} from ${clicks} where ${clicks.platform} = ${f.platform})`);
  return conds;
}

function saleConds(f: DashboardFilters, requireStatus = true) {
  const conds = requireStatus ? [eq(sales.status, "paid")] : [];
  // Compare in the ad account's local calendar day, same basis as ad_spend_snapshots.date —
  // see ACCOUNT_TIMEZONE comment above.
  if (f.from) conds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) conds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date <= ${f.to}::date`);
  if (f.productId) conds.push(eq(sales.productId, f.productId));
  conds.push(...saleClickConds(f));
  return conds;
}

// Same filter surface as saleConds but without forcing status='paid' — used by breakdowns
// that need to see every status (pending/refunded/charged_back/failed alongside paid).
function saleCondsAnyStatus(f: DashboardFilters) {
  return saleConds(f, false);
}

// Single-pass GROUP BY per metric — cheap at personal-project volume (plan.md § Schema Postgres).
// Every query below is independent (no data dependency between them) — they all run in one
// Promise.all instead of sequential awaits. Sequential round trips to Neon (serverless,
// cold-start prone, see lib/db/client.ts) were the main source of pages feeling like they
// "froze" on navigation; this cuts a page load from ~14 serial round trips to one concurrent
// batch (the pg pool queues past its 10-connection max, it doesn't error).
export async function getDashboard(f: DashboardFilters): Promise<DashboardResult> {
  const spendConds = [];
  if (f.from) spendConds.push(gte(adSpendSnapshots.date, f.from));
  if (f.to) spendConds.push(lte(adSpendSnapshots.date, f.to));
  // Campaign is the only dimension ad_spend_snapshots actually carries (via campaignId) —
  // platform/product have no equivalent column, so those two filters can't segment spend.
  if (f.campaign) {
    spendConds.push(sql`${adSpendSnapshots.campaignId} in (select ${campaigns.id} from ${campaigns} where ${campaigns.name} = ${f.campaign})`);
  }
  const adSpendCaveat = Boolean(f.platform || f.productId);

  // funnel: click -> generated (sale row exists, any status) -> paid
  const clickConds = [];
  if (f.from) clickConds.push(sql`(${clicks.createdAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) clickConds.push(sql`(${clicks.createdAt} at time zone ${TZ})::date <= ${f.to}::date`);
  if (f.campaign) clickConds.push(eq(clicks.metaCampaignName, f.campaign));
  if (f.platform) clickConds.push(eq(clicks.platform, f.platform));

  // Sparkline: same filters as the rest of the panel (campaign/platform/product), same
  // 14-day window ONLY as a fallback when the user hasn't picked a date range — otherwise
  // it silently showed a different period than every other number on the page.
  const dailyConds = [eq(sales.status, "paid"), ...saleClickConds(f)];
  if (f.productId) dailyConds.push(eq(sales.productId, f.productId));
  if (f.from) dailyConds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) dailyConds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date <= ${f.to}::date`);
  if (!f.from && !f.to) dailyConds.push(sql`${sales.receivedAt} >= now() - interval '14 days'`);

  const statusBreakdownConds = saleCondsAnyStatus(f);
  const productConds = saleConds(f);
  const sourceConds = saleConds(f);

  // revenueRow/generatedRow/paidRow/paymentBreakdown/statusBreakdown/approvalRows were
  // 6 separate queries all scanning `sales` with the same base filter, differing only in
  // which status they cared about — merged into one (method, status) grouped scan, then
  // sliced every which way in JS below. Fewer concurrent connections opened per page load
  // matters more than usual here: Neon's compute can be suspended between requests, and a
  // page firing a dozen-plus simultaneous connection attempts at a cold compute is exactly
  // the shape that produces intermittent "Connection terminated"/timeout errors — this was
  // the actual cause of the site occasionally freezing on navigation, not a slow query.
  const [
    spendRow, clickCountRow,
    productRows, campaignRows, platformRows, dailyRevenueRows,
    methodStatusRows, productBreakdownRows, sourceBreakdownRows,
  ] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${adSpendSnapshots.spend}), 0)` }).from(adSpendSnapshots)
      .where(spendConds.length ? and(...spendConds) : undefined),
    db.select({ n: sql<number>`count(*)` }).from(clicks).where(clickConds.length ? and(...clickConds) : undefined),
    db.select({ id: products.id, name: products.name }).from(products),
    db.selectDistinct({ v: clicks.metaCampaignName }).from(clicks),
    db.selectDistinct({ v: clicks.platform }).from(clicks),
    db.select({
      date: sql<string>`(${sales.receivedAt} at time zone ${TZ})::date`,
      amount: sql<string>`coalesce(sum(${sales.amount}), 0)`,
    }).from(sales)
      .where(and(...dailyConds))
      .groupBy(sql`(${sales.receivedAt} at time zone ${TZ})::date`)
      .orderBy(sql`(${sales.receivedAt} at time zone ${TZ})::date`),
    db.select({
      method: sql<string>`coalesce(${sales.paymentMethod}, 'outros')`,
      status: sales.status,
      count: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${sales.amount}), 0)`,
    }).from(sales).where(statusBreakdownConds.length ? and(...statusBreakdownConds) : undefined)
      .groupBy(sql`coalesce(${sales.paymentMethod}, 'outros')`, sales.status),
    db.select({
      productId: sales.productId,
      name: products.name,
      count: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${sales.amount}), 0)`,
    }).from(sales).innerJoin(products, eq(sales.productId, products.id))
      .where(and(...productConds)).groupBy(sales.productId, products.name)
      .orderBy(sql`sum(${sales.amount}) desc`),
    db.select({
      platform: clicks.platform,
      count: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${sales.amount}), 0)`,
    }).from(sales).innerJoin(clicks, eq(sales.clickid, clicks.id))
      .where(and(...sourceConds)).groupBy(clicks.platform)
      .orderBy(sql`sum(${sales.amount}) desc`),
  ]);

  const adSpend = Number(spendRow[0]?.total ?? 0);

  const paidRows = methodStatusRows.filter((r) => r.status === "paid");
  const netRevenue = paidRows.reduce((n, r) => n + Number(r.revenue), 0);
  const roas = adSpend > 0 ? netRevenue / adSpend : null;
  const profit = netRevenue - adSpend;

  const totalSalesCount = methodStatusRows.reduce((n, r) => n + Number(r.count), 0);
  const paidCount = paidRows.reduce((n, r) => n + Number(r.count), 0);
  const generatedCount = totalSalesCount; // any status counts as "generated" — same definition as before
  const chargedBackCount = methodStatusRows.filter((r) => r.status === "charged_back").reduce((n, r) => n + Number(r.count), 0);
  const pendingRevenue = methodStatusRows.filter((r) => r.status === "pending").reduce((n, r) => n + Number(r.revenue), 0);
  const refundedRevenue = methodStatusRows.filter((r) => r.status === "refunded").reduce((n, r) => n + Number(r.revenue), 0);
  const chargebackRate = totalSalesCount > 0 ? chargedBackCount / totalSalesCount : null;

  const paymentBreakdown = paidRows.map((r) => ({ method: r.method, count: Number(r.count), revenue: Number(r.revenue) }));

  const approvalByMethod = new Map<string, { paid: number; failed: number }>();
  for (const row of methodStatusRows) {
    if (row.status !== "paid" && row.status !== "failed") continue;
    const entry = approvalByMethod.get(row.method) ?? { paid: 0, failed: 0 };
    if (row.status === "paid") entry.paid += Number(row.count);
    else entry.failed += Number(row.count);
    approvalByMethod.set(row.method, entry);
  }
  const approvalRates = Array.from(approvalByMethod.entries()).map(([method, { paid, failed }]) => ({
    method,
    rate: paid + failed > 0 ? paid / (paid + failed) : null,
  }));

  const clicksCount = Number(clickCountRow[0]?.n ?? 0);

  return {
    netRevenue,
    adSpend,
    roas,
    profit,
    epc: clicksCount > 0 ? netRevenue / clicksCount : null,
    cpa: paidCount > 0 ? adSpend / paidCount : null,
    conversionRate: clicksCount > 0 ? paidCount / clicksCount : null,
    funnel: { clicks: clicksCount, generated: generatedCount, paid: paidCount },
    dailyRevenue: dailyRevenueRows.map((r) => ({ date: r.date, amount: Number(r.amount) })),
    filterOptions: {
      products: productRows,
      campaigns: campaignRows.map((r) => r.v).filter((v): v is string => !!v),
      platforms: platformRows.map((r) => r.v).filter((v): v is string => !!v),
    },
    roi: adSpend > 0 ? profit / adSpend : null,
    margin: netRevenue > 0 ? profit / netRevenue : null,
    pendingRevenue,
    refundedRevenue,
    chargebackRate,
    paymentBreakdown,
    approvalRates,
    productBreakdown: productBreakdownRows
      .filter((r): r is typeof r & { productId: string; name: string } => !!r.productId)
      .map((r) => ({ productId: r.productId, name: r.name, count: Number(r.count), revenue: Number(r.revenue) })),
    sourceBreakdown: sourceBreakdownRows
      .filter((r): r is typeof r & { platform: string } => !!r.platform)
      .map((r) => ({ platform: r.platform, count: Number(r.count), revenue: Number(r.revenue) })),
    adSpendCaveat,
  };
}
