import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify";
import { retryCapi } from "@/lib/cron/retry-capi";

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req.headers)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  const result = await retryCapi();
  return NextResponse.json({ ok: true, ...result });
}
