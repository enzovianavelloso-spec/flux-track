import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clicks, products, sales, webhookLogs } from "@/lib/db/schema";
import { verifyWebhookSecret } from "@/lib/ggcheckout/webhook-verify";
import type { GgCheckoutWebhookPayload } from "@/lib/ggcheckout/payload-types";
import { sendPurchaseEvent } from "@/lib/meta/capi";

const PAID_EVENTS = new Set(["pix.paid", "card.paid"]);
const REDACT_HEADERS = new Set(["x-secret", "authorization"]);

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = REDACT_HEADERS.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return out;
}

async function logWebhook(row: {
  validated: boolean;
  processed: boolean;
  headers: Record<string, string>;
  payload: unknown;
  error?: string;
  durationMs: number;
  saleId?: string;
}) {
  await db.insert(webhookLogs).values({
    provider: "ggcheckout",
    headers: row.headers,
    payload: row.payload as object | undefined,
    validated: row.validated,
    processed: row.processed,
    error: row.error,
    durationMs: row.durationMs,
    saleId: row.saleId,
  }).catch((err) => {
    // Logging must never be the reason a webhook fails, but a write failure here means the
    // /admin diagnostics panel silently loses a row — worth a process-log line either way.
    console.error("[webhook] failed to write webhook_logs row:", err);
  });
}

// Persist-then-respond: the DB write for the sale finishes before we answer, so the
// webhook is durable even if the process dies right after. Meta CAPI dispatch is NOT
// awaited — this app runs as a long-lived PM2/standalone process (not serverless/edge),
// so the fire-and-forget call keeps running after `return`. Any CAPI failure lands on
// sales.capi_status via capi.ts's own try/catch, and scripts/retry-capi.ts sweeps it later.
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const headers = sanitizeHeaders(req.headers);

  if (!verifyWebhookSecret(req.headers)) {
    await logWebhook({ validated: false, processed: false, headers, payload: null, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  let payload: GgCheckoutWebhookPayload;
  try {
    payload = (await req.json()) as GgCheckoutWebhookPayload;
  } catch {
    await logWebhook({ validated: true, processed: false, headers, payload: null, error: "invalid JSON body", durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    // GGCheckout dispara um POST de teste (sem payment.id real) ao salvar/testar o webhook no
    // painel — não é venda, só valida que a URL responde. Sem id não há o que gravar em `sales`
    // (PK not-null), mas ainda é sucesso: o teste só quer 200 de volta.
    if (!payload.id) {
      await logWebhook({ validated: true, processed: true, headers, payload, durationMs: Date.now() - startedAt });
      return NextResponse.json({ ok: true });
    }

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
      amount: payload.amount != null ? String(payload.amount) : null,
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
      capiStatus: PAID_EVENTS.has(payload.event) ? "pending" : "not_applicable",
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

    await logWebhook({
      validated: true, processed: true, headers, payload,
      durationMs: Date.now() - startedAt, saleId: saved?.id,
    });

    // Only confirmed payment triggers CAPI — *.generated feeds the funnel but isn't a Purchase yet.
    // Not awaited on purpose (see function doc comment). Skip if already sent: GGCheckout
    // (like most webhook providers) delivers at-least-once, so the same pix.paid/card.paid
    // event can arrive more than once for the same sale. `saved.capiStatus` here reflects the
    // row's state BEFORE this request touched it (capiStatus isn't in the onConflictDoUpdate
    // SET list), so a redelivery after a prior success sees "sent" and doesn't fire again —
    // without this check, every redelivery would trigger a fresh real Meta CAPI call.
    if (PAID_EVENTS.has(payload.event) && saved && saved.capiStatus !== "sent") {
      void sendPurchaseEvent(saved);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logWebhook({
      validated: true, processed: false, headers, payload,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
