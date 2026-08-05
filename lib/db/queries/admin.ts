import { desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, sales, webhookLogs } from "@/lib/db/schema";

const PAGE_SIZE = 25;

export interface AdminDiagnostics {
  recentRedirects: { id: string; createdAt: Date | null; campaign: string | null; platform: string | null }[];
  recentWebhooks: { id: number; receivedAt: Date | null; validated: boolean; processed: boolean; error: string | null; durationMs: number | null; saleId: string | null }[];
  recentErrors: { id: number; receivedAt: Date | null; error: string | null }[];
  pendingEvents: { id: string; capiStatus: string | null; capiAttempts: number }[];
  sentCount: number;
  avgResponseMs: number | null;
  pageSize: number;
}

export async function getAdminDiagnostics(offset: number): Promise<AdminDiagnostics> {
  const [recentRedirects, recentWebhooks, recentErrors, pendingEvents, sentCountRow, avgDurationRow] = await Promise.all([
    db.select({ id: clicks.id, createdAt: clicks.createdAt, campaign: clicks.metaCampaignName, platform: clicks.platform })
      .from(clicks).orderBy(desc(clicks.createdAt)).limit(PAGE_SIZE).offset(offset),
    db.select({
      id: webhookLogs.id, receivedAt: webhookLogs.receivedAt, validated: webhookLogs.validated,
      processed: webhookLogs.processed, error: webhookLogs.error, durationMs: webhookLogs.durationMs, saleId: webhookLogs.saleId,
    }).from(webhookLogs).orderBy(desc(webhookLogs.receivedAt)).limit(PAGE_SIZE).offset(offset),
    db.select({ id: webhookLogs.id, receivedAt: webhookLogs.receivedAt, error: webhookLogs.error })
      .from(webhookLogs).where(isNotNull(webhookLogs.error)).orderBy(desc(webhookLogs.receivedAt)).limit(PAGE_SIZE),
    db.select({ id: sales.id, capiStatus: sales.capiStatus, capiAttempts: sales.capiAttempts })
      .from(sales).where(inArray(sales.capiStatus, ["pending", "failed"])).orderBy(desc(sales.receivedAt)).limit(PAGE_SIZE),
    db.select({ n: sql<number>`count(*)` }).from(sales).where(eq(sales.capiStatus, "sent")),
    db.select({ avg: sql<string | null>`avg(${webhookLogs.durationMs})` }).from(webhookLogs),
  ]);

  return {
    recentRedirects,
    recentWebhooks,
    recentErrors,
    pendingEvents,
    sentCount: Number(sentCountRow[0]?.n ?? 0),
    avgResponseMs: avgDurationRow[0]?.avg ? Math.round(Number(avgDurationRow[0].avg)) : null,
    pageSize: PAGE_SIZE,
  };
}
