import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify";
import { syncSpend } from "@/lib/cron/sync-spend";

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req.headers)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  const result = await syncSpend();
  return NextResponse.json({ ok: true, ...result });
}
