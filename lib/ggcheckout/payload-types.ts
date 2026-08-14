// Real shape observed live (2026-08-14) differs from docs.ggcheckout.com's flat example —
// payment/customer/UTM fields are nested, and nesting itself varies by event: pix.paid wraps
// UTM/click params under `params`, pix.generated puts the same fields on the payload root.
// Both are handled defensively in route.ts (checks `params` first, falls back to root).
export interface GgCheckoutWebhookPayload {
  event: string; // "pix.paid" | "card.paid" | "pix.generated" | "test" | ... etc
  payment?: {
    id?: string; // UUID — primary key for `sales`. Absent on the panel's "test webhook" POST.
    amount?: number;
    method?: string;
    paymentMethod?: string;
    status?: string; // paid | pending | failed | refunded | charged_back
    gateway?: string;
    pixCode?: string;
  };
  product?: { id: string; type?: string; title?: string };
  products?: Array<{ id: string; title?: string; price?: number; type?: string }>;
  customer?: { name?: string; email?: string; document?: string; phone?: string; ip?: string };
  params?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}
