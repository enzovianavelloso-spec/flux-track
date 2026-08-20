import { eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, products, sales } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hashPii } from "./hash";

const GRAPH_VERSION = "v21.0";

type Stage = "purchase" | "checkout";
type StageState = { status: "sent" | "failed"; sentAt?: Date; response?: unknown };

// capi_status/capi_attempts/... track Purchase; capi_checkout_status/... track the
// InitiateCheckout+AddPaymentInfo pair — two separate column sets because they're two
// independent funnel stages that can both be "in flight" for the same sale. Sharing one
// column briefly happened here and broke Purchase dedup: the checkout stage marked the row
// "sent", so the later *.paid handler read "already sent" and skipped Purchase entirely.
//
// Branches on stage explicitly rather than a computed `{ [colName]: value }` — drizzle's
// `.set()` maps keys through the table's JS property names (see mapUpdateSet in
// drizzle-orm/utils.js), not SQL column names, so a computed SQL-name key silently fails
// to reach the intended column.
function writeFailedAttempt(saleId: string, stage: Stage) {
  return stage === "purchase"
    ? db.update(sales).set({ capiStatus: "failed", capiAttempts: sql`${sales.capiAttempts} + 1` }).where(eq(sales.id, saleId))
    : db.update(sales).set({ capiCheckoutStatus: "failed", capiCheckoutAttempts: sql`${sales.capiCheckoutAttempts} + 1` }).where(eq(sales.id, saleId));
}

function writeAttemptResult(saleId: string, stage: Stage, state: StageState) {
  return stage === "purchase"
    ? db.update(sales).set({
        capiStatus: state.status,
        capiAttempts: sql`${sales.capiAttempts} + 1`,
        ...(state.sentAt ? { capiSentAt: state.sentAt } : {}),
        ...(state.response !== undefined ? { capiResponse: state.response } : {}),
      }).where(eq(sales.id, saleId))
    : db.update(sales).set({
        capiCheckoutStatus: state.status,
        capiCheckoutAttempts: sql`${sales.capiCheckoutAttempts} + 1`,
        ...(state.sentAt ? { capiCheckoutSentAt: state.sentAt } : {}),
        ...(state.response !== undefined ? { capiCheckoutResponse: state.response } : {}),
      }).where(eq(sales.id, saleId));
}

// Shared by every event we send to Meta (Purchase, InitiateCheckout, AddPaymentInfo) —
// pixel lookup, user_data, request/response handling are identical across event types,
// only event_name/event_id/custom_data/which-columns-to-update differ per caller.
//
// Always leaves the stage's status/attempts in a consistent state, even on network exceptions —
// previously an uncaught fetch error left the row at "not_applicable" forever, silently
// dropping the conversion since nothing ever re-checked it. Now every path lands on
// sent/failed, and scripts/retry-capi.ts sweeps "failed"/"pending" rows.
async function sendEvent(
  sale: InferSelectModel<typeof sales>,
  eventName: string,
  eventId: string,
  stage: Stage,
): Promise<void> {
  try {
    const [product] = sale.productId
      ? await db.select().from(products).where(eq(products.id, sale.productId)).limit(1)
      : [];
    const pixelId = product?.metaPixelId;

    if (!pixelId) {
      // No pixel mapped for this product -> nothing to send to, but don't fail the webhook.
      // Still counts as an attempt so retry-capi.ts eventually gives up instead of looping forever.
      await writeFailedAttempt(sale.id, stage);
      return;
    }

    if (env.devMode) {
      console.log(`[DEV_MODE] CAPI ${eventName} simulated for sale ${sale.id}, pixel ${pixelId}`);
      await writeAttemptResult(sale.id, stage, {
        status: "sent",
        sentAt: new Date(),
        response: { devMode: true, simulated: true, eventName },
      });
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

    await writeAttemptResult(sale.id, stage, {
      status: res.ok ? "sent" : "failed",
      sentAt: new Date(),
      response: { status: res.status, body: json, eventName },
    });
  } catch (err) {
    // Network failure, DNS, timeout, etc — never leave the row unaccounted for.
    const message = err instanceof Error ? err.message : String(err);
    await writeAttemptResult(sale.id, stage, {
      status: "failed",
      response: { error: message, eventName },
    }).catch((updateErr) => {
      // Even the recovery write can fail (e.g. DB down) — last resort is the process log,
      // since at that point nothing in the database reflects this sale ever failed.
      console.error(`[capi] lost failure record for sale ${sale.id}: send error="${message}", update error=`, updateErr);
    });
  }
}

export async function sendPurchaseEvent(sale: InferSelectModel<typeof sales>): Promise<void> {
  await sendEvent(sale, "Purchase", sale.id, "purchase");
}

// GGCheckout's `*.generated` webhook (pix/card created, not yet paid) doesn't distinguish
// "started checkout" from "entered payment info" — one event stage covers both, so we send
// both Meta events off the same signal. event_id keyed off clickid (not sale.id) so it can
// match the browser Pixel's InitiateCheckout fired earlier at click time (see public/track.js)
// — falls back to sale.id when there's no clickid to attribute the sale to.
// Sequential, not Promise.all: both calls write onto the same capi_checkout_* columns —
// running them concurrently would race and let whichever write lands last clobber the other.
export async function sendCheckoutEvents(sale: InferSelectModel<typeof sales>): Promise<void> {
  const eventId = sale.clickid ?? sale.id;
  await sendEvent(sale, "InitiateCheckout", `${eventId}-ic`, "checkout");
  await sendEvent(sale, "AddPaymentInfo", `${eventId}-api`, "checkout");
}
