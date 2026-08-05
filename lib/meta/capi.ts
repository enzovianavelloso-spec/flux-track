import { eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, products, sales } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hashPii } from "./hash";

const GRAPH_VERSION = "v21.0";

// Always leaves capi_status/capi_attempts in a consistent state, even on network exceptions —
// previously an uncaught fetch error left the row at "not_applicable" forever, silently
// dropping the conversion since nothing ever re-checked it. Now every path lands on
// sent/failed, and scripts/retry-capi.ts sweeps "failed"/"pending" rows.
export async function sendPurchaseEvent(sale: InferSelectModel<typeof sales>): Promise<void> {
  try {
    const [product] = sale.productId
      ? await db.select().from(products).where(eq(products.id, sale.productId)).limit(1)
      : [];
    const pixelId = product?.metaPixelId;

    if (!pixelId) {
      // No pixel mapped for this product -> nothing to send to, but don't fail the webhook.
      // Still counts as an attempt so retry-capi.ts eventually gives up instead of looping forever.
      await db.update(sales).set({
        capiStatus: "failed",
        capiAttempts: sql`${sales.capiAttempts} + 1`,
      }).where(eq(sales.id, sale.id));
      return;
    }

    if (env.devMode) {
      console.log(`[DEV_MODE] CAPI Purchase simulated for sale ${sale.id}, pixel ${pixelId}`);
      await db.update(sales).set({
        capiStatus: "sent",
        capiAttempts: sql`${sales.capiAttempts} + 1`,
        capiSentAt: new Date(),
        capiResponse: { devMode: true, simulated: true },
      }).where(eq(sales.id, sale.id));
      return;
    }

    const click = sale.clickid
      ? (await db.select().from(clicks).where(eq(clicks.id, sale.clickid)).limit(1))[0]
      : undefined;

    const userData: Record<string, unknown> = {};
    if (sale.customerEmail) userData.em = [hashPii(sale.customerEmail)];
    if (sale.customerPhone) userData.ph = [hashPii(sale.customerPhone)];
    if (click?.ipAddress) userData.client_ip_address = click.ipAddress;
    if (click?.userAgent) userData.client_user_agent = click.userAgent;
    if (click?.fbclid) userData.fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${click.fbclid}`;
    if (sale.fbp) userData.fbp = sale.fbp;

    const body = {
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(new Date(sale.receivedAt ?? new Date()).getTime() / 1000),
        event_id: sale.id, // dedup key if a browser Pixel event is ever added later
        action_source: "website",
        user_data: userData,
        custom_data: {
          value: Number(sale.amount),
          currency: sale.currency ?? "BRL",
          content_ids: sale.productId ? [sale.productId] : undefined,
          content_name: product?.name,
        },
      }],
      ...(env.metaTestEventCode ? { test_event_code: env.metaTestEventCode } : {}),
      access_token: env.metaCapiToken,
    };

    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));

    await db.update(sales).set({
      capiStatus: res.ok ? "sent" : "failed",
      capiAttempts: sql`${sales.capiAttempts} + 1`,
      capiSentAt: new Date(),
      capiResponse: json,
    }).where(eq(sales.id, sale.id));
  } catch (err) {
    // Network failure, DNS, timeout, etc — never leave the row unaccounted for.
    await db.update(sales).set({
      capiStatus: "failed",
      capiAttempts: sql`${sales.capiAttempts} + 1`,
      capiResponse: { error: err instanceof Error ? err.message : String(err) },
    }).where(eq(sales.id, sale.id)).catch(() => {}); // even the recovery write can fail; give up quietly
  }
}
