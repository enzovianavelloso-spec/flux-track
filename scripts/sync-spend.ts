import { syncSpend } from "@/lib/cron/sync-spend";

// Entrypoint for the hourly cron: `npm run sync-spend`. Single ad account in v1.
syncSpend()
  .then(({ upserted }) => console.log(upserted ? `sync-spend: upserted ${upserted} ad-day rows` : "sync-spend: no rows returned"))
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
