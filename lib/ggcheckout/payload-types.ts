// Shape per docs.ggcheckout.com/help/vendedor/integracoes/estrutura-do-payload-do-webhook
export interface GgCheckoutWebhookPayload {
  event: string; // "pix.paid" | "card.paid" | "pix.generated" | ... etc
  createdAt: string;
  name?: string;
  email?: string;
  document?: string;
  phone?: string;
  ip?: string;
  id: string; // payment.id, UUID — primary key for `sales`
  method?: string;
  paymentMethod?: string;
  gateway?: string;
  status: string; // paid | pending | failed | refunded | charged_back
  amount: number;
  pixCode?: string;
  product?: { id: string; type?: string; title?: string };
  products?: Array<{ id: string; title?: string; price?: number; type?: string }>;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}
