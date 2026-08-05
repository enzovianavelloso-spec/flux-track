import { and, inArray, lt, or, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sales } from "@/lib/db/schema";
import { sendPurchaseEvent } from "@/lib/meta/capi";

const MAX_ATTEMPTS = 5;
// The webhook handler fires sendPurchaseEvent inline (fire-and-forget, not awaited) right
// after inserting a "pending" sale, and that inline call normally finishes in well under a
// second. Without this grace window, a cron run landing in that same window would grab the
// still-"pending" row and send a second, concurrent CAPI call for it — wasted duplicate
// requests (harmless to Meta's own event_id dedup, but pointless). "failed" rows have no
// such race — a failed attempt already completed — so only "pending" needs the age check.
const PENDING_GRACE_MINUTES = 2;

// Entrypoint for the retry cron: `npm run retry-capi`, every 5 min via crontab.
// Column-based outbox — no queue infra. capi_status/capi_attempts on `sales` are the
// state; this script just sweeps rows CAPI never confirmed and retries them.
async function main() {
  const pending = await db.select().from(sales).where(
    and(
      inArray(sales.capiStatus, ["pending", "failed"]),
      lt(sales.capiAttempts, MAX_ATTEMPTS),
      or(
        sql`${sales.capiStatus} = 'failed'`,
        lte(sales.receivedAt, sql`now() - interval '1 minute' * ${PENDING_GRACE_MINUTES}`),
      ),
    ),
  );

  if (!pending.length) {
    console.log("retry-capi: nothing to retry");
    return;
  }

  console.log(`retry-capi: retrying ${pending.length} sale(s)`);
  for (const sale of pending) {
    await sendPurchaseEvent(sale);
  }
  console.log("retry-capi: done");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
