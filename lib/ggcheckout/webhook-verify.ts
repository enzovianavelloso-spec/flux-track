import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — different lengths are simply "not equal".
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// GGCheckout's dashboard exposes either x-secret or Authorization: Bearer — support both
// until confirmed which one the live account uses.
//
// No blanket bypass: an unconfigured GGCHECKOUT_WEBHOOK_SECRET rejects every request.
// The only way to skip validation is DEV_MODE=true, and even then a secret must be sent
// and match "dev-secret" — a test webhook can't hit this without the flag being explicit.
export function verifyWebhookSecret(headers: Headers): boolean {
  const xSecret = headers.get("x-secret");
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = xSecret ?? bearer ?? "";

  if (env.devMode) {
    if (safeEqual(provided, "dev-secret")) return true;
    return env.ggcheckoutWebhookSecret !== "" && safeEqual(provided, env.ggcheckoutWebhookSecret);
  }

  const expected = env.ggcheckoutWebhookSecret;
  if (!expected) return false; // production with no secret configured -> reject everything
  return safeEqual(provided, expected);
}
