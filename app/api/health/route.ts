import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import pkg from "@/package.json";

export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  // Booleans only — never expose the actual token/secret/pixel values.
  const meta = {
    capiTokenConfigured: !!process.env.META_CAPI_TOKEN,
    adAccountConfigured: !!process.env.META_AD_ACCOUNT_ID,
  };
  const ggcheckout = { webhookSecretConfigured: !!process.env.GGCHECKOUT_WEBHOOK_SECRET };

  const ok = dbOk;
  return NextResponse.json(
    { ok, version: pkg.version, devMode: env.devMode, db: dbOk, meta, ggcheckout },
    { status: ok ? 200 : 503 },
  );
}
