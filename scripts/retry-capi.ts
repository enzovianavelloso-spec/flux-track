import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sales } from "@/lib/db/schema";
import { sendPurchaseEvent } from "@/lib/meta/capi";

const MAX_ATTEMPTS = 5;

// Entrypoint for the retry cron: `npm run retry-capi`, every 5 min via crontab.
// Column-based outbox — no queue infra. capi_status/capi_attempts on `sales` are the
// state; this script just sweeps rows CAPI never confirmed and retries them.
async function main() {
  const pending = await db.select().from(sales).where(
    and(inArray(sales.capiStatus, ["pending", "failed"]), lt(sales.capiAttempts, MAX_ATTEMPTS)),
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
