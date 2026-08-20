import { desc, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, sales, webhookLogs } from "@/lib/db/schema";

const PAGE_SIZE = 25;

export interface AdminDiagnostics {
  recentRedirects: { id: string; createdAt: Date | null; campaign: string | null; platform: string | null }[];
  recentWebhooks: { id: number; receivedAt: Date | null; validated: boolean; processed: boolean; error: string | null; durationMs: number | null; saleId: string | null }[];
  recentErrors: { id: number; receivedAt: Date | null; error: string | null }[];
  pendingEvents: { id: string; capiStatus: string | null; capiAttempts: number }[];
  sentCount: number; // Purchase — mantido pro card existente
  // Todo evento que o Flux Track manda pra Meta hoje. InitiateCheckout e AddPaymentInfo
  // disparam sempre juntos, no mesmo POST do GGCheckout (*.generated não distingue os dois
  // estágios) — dividem capi_checkout_status, por isso a mesma contagem pros dois.
  eventCounts: { name: string; description: string; sent: number; failed: number }[];
  avgResponseMs: number | null;
  pageSize: number;
}

export async function getAdminDiagnostics(offset: number): Promise<AdminDiagnostics> {
  const [
    recentRedirects, recentWebhooks, recentErrors, pendingEvents,
    purchaseCountRows, checkoutCountRows, avgDurationRow,
  ] = await Promise.all([
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
    db.select({ status: sales.capiStatus, n: sql<number>`count(*)` }).from(sales)
      .where(inArray(sales.capiStatus, ["sent", "failed"])).groupBy(sales.capiStatus),
    db.select({ status: sales.capiCheckoutStatus, n: sql<number>`count(*)` }).from(sales)
      .where(inArray(sales.capiCheckoutStatus, ["sent", "failed"])).groupBy(sales.capiCheckoutStatus),
    db.select({ avg: sql<string | null>`avg(${webhookLogs.durationMs})` }).from(webhookLogs),
  ]);

  const countFor = (rows: { status: string | null; n: number }[], status: string) =>
    Number(rows.find((r) => r.status === status)?.n ?? 0);

  const purchaseSent = countFor(purchaseCountRows, "sent");
  const purchaseFailed = countFor(purchaseCountRows, "failed");
  const checkoutSent = countFor(checkoutCountRows, "sent");
  const checkoutFailed = countFor(checkoutCountRows, "failed");

  return {
    recentRedirects,
    recentWebhooks,
    recentErrors,
    pendingEvents,
    sentCount: purchaseSent,
    eventCounts: [
      { name: "Purchase", description: "Venda paga (pix.paid/card.paid)", sent: purchaseSent, failed: purchaseFailed },
      { name: "InitiateCheckout", description: "Pix/cartão gerado, ainda não pago", sent: checkoutSent, failed: checkoutFailed },
      { name: "AddPaymentInfo", description: "Mesmo estágio do InitiateCheckout — GGCheckout não distingue os dois", sent: checkoutSent, failed: checkoutFailed },
    ],
    avgResponseMs: avgDurationRow[0]?.avg ? Math.round(Number(avgDurationRow[0].avg)) : null,
    pageSize: PAGE_SIZE,
  };
}
