import { eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, products, sales } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hashPii } from "./hash";

const GRAPH_VERSION = "v21.0";

// Shared by every event we send to Meta (Purchase, InitiateCheckout, AddPaymentInfo) —
// pixel lookup, user_data, request/response handling and capi_status bookkeeping are
// identical across event types, only event_name/event_id/custom_data differ per caller.
//
// Always leaves capi_status/capi_attempts in a consistent state, even on network exceptions —
// previously an uncaught fetch error left the row at "not_applicable" forever, silently
// dropping the conversion since nothing ever re-checked it. Now every path lands on
// sent/failed, and scripts/retry-capi.ts sweeps "failed"/"pending" rows.
async function sendEvent(
  sale: InferSelectModel<typeof sales>,
  eventName: string,
  eventId: string,
): Promise<void> {
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
      console.log(`[DEV_MODE] CAPI ${eventName} simulated for sale ${sale.id}, pixel ${pixelId}`);
      await db.update(sales).set({
        capiStatus: "sent",
        capiAttempts: sql`${sales.capiAttempts} + 1`,
        capiSentAt: new Date(),
        capiResponse: { devMode: true, simulated: true, eventName },
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
        event_name: eventName,
        event_time: Math.floor(new Date(sale.receivedAt ?? new Date()).getTime() / 1000),
        event_id: eventId, // dedup key — matches the browser Pixel event_id when one was sent
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
    // res.status is always captured, even when Meta returns a non-JSON error body —
    // {} alone previously discarded the one piece of info (HTTP status) needed to tell
    // "rejected" apart from "malformed response" while reading /admin.
    const json = await res.json().catch(() => ({ unparseable: true }));

    await db.update(sales).set({
      capiStatus: res.ok ? "sent" : "failed",
      capiAttempts: sql`${sales.capiAttempts} + 1`,
      capiSentAt: new Date(),
      capiResponse: { status: res.status, body: json, eventName },
    }).where(eq(sales.id, sale.id));
  } catch (err) {
    // Network failure, DNS, timeout, etc — never leave the row unaccounted for.
    const message = err instanceof Error ? err.message : String(err);
    await db.update(sales).set({
      capiStatus: "failed",
      capiAttempts: sql`${sales.capiAttempts} + 1`,
      capiResponse: { error: message, eventName },
    }).where(eq(sales.id, sale.id)).catch((updateErr) => {
      // Even the recovery write can fail (e.g. DB down) — last resort is the process log,
      // since at that point nothing in the database reflects this sale ever failed.
      console.error(`[capi] lost failure record for sale ${sale.id}: send error="${message}", update error=`, updateErr);
    });
  }
}

export async function sendPurchaseEvent(sale: InferSelectModel<typeof sales>): Promise<void> {
  await sendEvent(sale, "Purchase", sale.id);
}

// GGCheckout's `*.generated` webhook (pix/card created, not yet paid) doesn't distinguish
// "started checkout" from "entered payment info" — one event stage covers both, so we send
// both Meta events off the same signal. event_id keyed off clickid (not sale.id) so it can
// match the browser Pixel's InitiateCheckout fired earlier at click time (see public/track.js)
// — falls back to sale.id when there's no clickid to attribute the sale to.
// Sequential, not Promise.all: both calls write capi_status/capi_response onto the same
// `sales` row (there's one status column, not one per event) — running them concurrently
// would race and let whichever write lands last silently clobber the other's result.
export async function sendCheckoutEvents(sale: InferSelectModel<typeof sales>): Promise<void> {
  const eventId = sale.clickid ?? sale.id;
  await sendEvent(sale, "InitiateCheckout", `${eventId}-ic`);
  await sendEvent(sale, "AddPaymentInfo", `${eventId}-api`);
}
