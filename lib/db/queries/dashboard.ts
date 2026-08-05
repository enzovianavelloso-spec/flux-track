import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sales, clicks, adSpendSnapshots, products } from "@/lib/db/schema";

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
  adAccountId?: string;
  trafficSource?: string; // sales.utm_source
  platform?: string;      // clicks.platform
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
  dailyRevenue: { date: string; amount: number }[]; // last 14 days, for the sparkline
  filterOptions: {
    products: { id: string; name: string }[];
    trafficSources: string[];
    platforms: string[];
  };
}

function saleConds(f: DashboardFilters, requireStatus = true) {
  const conds = requireStatus ? [eq(sales.status, "paid")] : [];
  // Compare in the ad account's local calendar day, same basis as ad_spend_snapshots.date —
  // see ACCOUNT_TIMEZONE comment above.
  if (f.from) conds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) conds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date <= ${f.to}::date`);
  if (f.trafficSource) conds.push(eq(sales.utmSource, f.trafficSource));
  if (f.productId) conds.push(eq(sales.productId, f.productId));
  // platform lives on `clicks`, reached via sales.clickid — subquery keeps this a single JOIN-free filter.
  if (f.platform) conds.push(sql`${sales.clickid} in (select ${clicks.id} from ${clicks} where ${clicks.platform} = ${f.platform})`);
  return conds;
}

// Single-pass GROUP BY per metric — cheap at personal-project volume (plan.md § Schema Postgres).
export async function getDashboard(f: DashboardFilters): Promise<DashboardResult> {
  const revenueRow = await db.select({ total: sql<string>`coalesce(sum(${sales.amount}), 0)` })
    .from(sales)
    .where(and(...saleConds(f)));
  const netRevenue = Number(revenueRow[0]?.total ?? 0);

  const spendConds = [];
  if (f.from) spendConds.push(gte(adSpendSnapshots.date, f.from));
  if (f.to) spendConds.push(lte(adSpendSnapshots.date, f.to));
  if (f.adAccountId) spendConds.push(eq(adSpendSnapshots.adAccountId, f.adAccountId));
  const spendRow = await db.select({ total: sql<string>`coalesce(sum(${adSpendSnapshots.spend}), 0)` })
    .from(adSpendSnapshots)
    .where(spendConds.length ? and(...spendConds) : undefined);
  const adSpend = Number(spendRow[0]?.total ?? 0);

  const roas = adSpend > 0 ? netRevenue / adSpend : null;
  const profit = netRevenue - adSpend;

  // funnel: click -> generated (sale row exists, any status) -> paid
  const clickConds = [];
  if (f.from) clickConds.push(sql`(${clicks.createdAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) clickConds.push(sql`(${clicks.createdAt} at time zone ${TZ})::date <= ${f.to}::date`);
  if (f.platform) clickConds.push(eq(clicks.platform, f.platform));
  const clickCountRow = await db.select({ n: sql<number>`count(*)` }).from(clicks)
    .where(clickConds.length ? and(...clickConds) : undefined);
  const generatedConds = saleConds(f, false);
  const generatedRow = await db.select({ n: sql<number>`count(*)` }).from(sales)
    .where(generatedConds.length ? and(...generatedConds) : undefined);
  const paidRow = await db.select({ n: sql<number>`count(*)` }).from(sales).where(and(...saleConds(f)));

  const [productRows, sourceRows, platformRows, dailyRevenueRows] = await Promise.all([
    db.select({ id: products.id, name: products.name }).from(products),
    db.selectDistinct({ v: sales.utmSource }).from(sales),
    db.selectDistinct({ v: clicks.platform }).from(clicks),
    db.select({
      date: sql<string>`(${sales.receivedAt} at time zone ${TZ})::date`,
      amount: sql<string>`coalesce(sum(${sales.amount}), 0)`,
    }).from(sales)
      .where(and(eq(sales.status, "paid"), sql`${sales.receivedAt} >= now() - interval '14 days'`))
      .groupBy(sql`(${sales.receivedAt} at time zone ${TZ})::date`)
      .orderBy(sql`(${sales.receivedAt} at time zone ${TZ})::date`),
  ]);

  const clicksCount = Number(clickCountRow[0]?.n ?? 0);
  const paidCount = Number(paidRow[0]?.n ?? 0);

  return {
    netRevenue,
    adSpend,
    roas,
    profit,
    epc: clicksCount > 0 ? netRevenue / clicksCount : null,
    cpa: paidCount > 0 ? adSpend / paidCount : null,
    conversionRate: clicksCount > 0 ? paidCount / clicksCount : null,
    funnel: { clicks: clicksCount, generated: Number(generatedRow[0]?.n ?? 0), paid: paidCount },
    dailyRevenue: dailyRevenueRows.map((r) => ({ date: r.date, amount: Number(r.amount) })),
    filterOptions: {
      products: productRows,
      trafficSources: sourceRows.map((r) => r.v).filter((v): v is string => !!v),
      platforms: platformRows.map((r) => r.v).filter((v): v is string => !!v),
    },
  };
}
