import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

// cron-job.org (and similar HTTP cron services) call these routes on a schedule with no
// user session — a shared secret in a custom header is the only guard against randoms
// hitting /api/cron/* and triggering CAPI retries or Meta API calls on demand.
export function verifyCronSecret(headers: Headers): boolean {
  const provided = headers.get("x-cron-secret") ?? "";
  const expected = env.cronSecret;
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
