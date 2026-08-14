import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";

webpush.setVapidDetails("mailto:enzovianavelloso@gmail.com", env.vapidPublicKey, env.vapidPrivateKey);

interface SalePushPayload {
  title: string;
  body: string;
  // Único por notificação — mesma tag faz o navegador SUBSTITUIR a notificação anterior em
  // vez de empilhar. Sem isso, 2 vendas seguidas mostram só a última na tela de bloqueio.
  tag: string;
}

// Fire-and-forget from the webhook, same pattern as sendPurchaseEvent (lib/meta/capi.ts):
// a push failure must never fail the webhook response. A dead subscription (browser
// revoked permission, uninstalled the PWA) returns 404/410 from the push service — that
// endpoint is removed so it stops being retried on every future sale.
export async function notifySale(payload: SalePushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptions);
  if (subs.length === 0) return;

  await Promise.all(subs.map(async (sub) => {
    const keys = sub.keys as { p256dh: string; auth: string };
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys },
        JSON.stringify({ ...payload, url: "/" }),
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).catch(() => {});
      } else {
        console.error(`[push] failed to notify ${sub.endpoint.slice(0, 40)}...:`, err);
      }
    }
  }));
}
