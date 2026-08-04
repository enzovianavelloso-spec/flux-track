import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, products, sales } from "@/lib/db/schema";
import { verifyWebhookSecret } from "@/lib/ggcheckout/webhook-verify";
import type { GgCheckoutWebhookPayload } from "@/lib/ggcheckout/payload-types";
import { sendPurchaseEvent } from "@/lib/meta/capi";

const PAID_EVENTS = new Set(["pix.paid", "card.paid"]);

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req.headers)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const payload = (await req.json()) as GgCheckoutWebhookPayload;

  if (payload.product?.id) {
    await db.insert(products)
      .values({ id: payload.product.id, name: payload.product.title ?? payload.product.id })
      .onConflictDoNothing();
  }

  // clickid recovery: utm_content carries the bare clickid if the LP round-trip worked.
  // Present but no matching click row, or absent entirely -> clickid stays NULL, sale still saved.
  let matchedClickId: string | null = null;
  if (payload.utm_content) {
    const found = await db.select({ id: clicks.id }).from(clicks).where(eq(clicks.id, payload.utm_content)).limit(1);
    if (found.length) matchedClickId = found[0].id;
  }

  const [saved] = await db.insert(sales).values({
    id: payload.id,
    event: payload.event,
    status: payload.status,
    amount: String(payload.amount),
    paymentMethod: payload.paymentMethod ?? payload.method,
    gateway: payload.gateway,
    productId: payload.product?.id,
    customerEmail: payload.email,
    customerName: payload.name,
    customerDocument: payload.document,
    customerPhone: payload.phone,
    utmSource: payload.utm_source,
    utmMedium: payload.utm_medium,
    utmCampaign: payload.utm_campaign,
    utmContent: payload.utm_content,
    utmTerm: payload.utm_term,
    clickid: matchedClickId,
    matched: matchedClickId !== null,
    rawPayload: payload,
  }).onConflictDoUpdate({
    target: sales.id,
    set: {
      event: payload.event,
      status: payload.status,
      matched: matchedClickId !== null,
      clickid: matchedClickId ?? sql`sales.clickid`, // keep prior match if this update has none
      rawPayload: payload,
    },
  }).returning();

  // Only confirmed payment triggers CAPI — *.generated feeds the funnel but isn't a Purchase yet.
  if (PAID_EVENTS.has(payload.event) && saved) {
    await sendPurchaseEvent(saved).catch(() => {}); // CAPI failure never fails the webhook response
  }

  return NextResponse.json({ ok: true });
}
