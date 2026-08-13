import { retryCapi } from "@/lib/cron/retry-capi";

// Entrypoint for the retry cron: `npm run retry-capi`, every 5 min via crontab.
retryCapi()
  .then(({ retried }) => console.log(retried ? `retry-capi: retrying ${retried} sale(s)` : "retry-capi: nothing to retry"))
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
