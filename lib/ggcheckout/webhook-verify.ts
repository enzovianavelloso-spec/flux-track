import { env } from "@/lib/env";

// GGCheckout's dashboard exposes either x-secret or Authorization: Bearer — support both
// until confirmed which one the live account uses. No secret configured -> reject nothing
// (only true once GGCHECKOUT_WEBHOOK_SECRET is set — leave empty during Phase 3 dry-run only).
export function verifyWebhookSecret(headers: Headers): boolean {
  const expected = env.ggcheckoutWebhookSecret;
  if (!expected) return true; // no secret configured yet — dev-only escape hatch
  const xSecret = headers.get("x-secret");
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return xSecret === expected || bearer === expected;
}
