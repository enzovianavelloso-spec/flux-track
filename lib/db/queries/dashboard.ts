import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sales, clicks, adSpendSnapshots, products } from "@/lib/db/schema";

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
  if (f.from) conds.push(gte(sales.receivedAt, new Date(f.from)));
  if (f.to) conds.push(lte(sales.receivedAt, new Date(f.to)));
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
  if (f.from) clickConds.push(gte(clicks.createdAt, new Date(f.from)));
  if (f.to) clickConds.push(lte(clicks.createdAt, new Date(f.to)));
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
      date: sql<string>`date(${sales.receivedAt})`,
      amount: sql<string>`coalesce(sum(${sales.amount}), 0)`,
    }).from(sales)
      .where(and(eq(sales.status, "paid"), sql`${sales.receivedAt} >= now() - interval '14 days'`))
      .groupBy(sql`date(${sales.receivedAt})`)
      .orderBy(sql`date(${sales.receivedAt})`),
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
