import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { clicks } from "@/lib/db/schema";
import { generateClickId } from "@/lib/clickid";
import { env } from "@/lib/env";

const INSERT_TIMEOUT_MS = 800;

// GET /r?cid=<campaign>&aid=<adset>&adid=<ad>&cname=<name>&aname=<adset name>&adnm=<ad name>&plat={{site_source_name}}&fbclid=...
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const clickid = generateClickId();

  const insert = db.insert(clicks).values({
    id: clickid,
    metaCampaignId: q.get("cid"),
    metaAdsetId: q.get("aid"),
    metaAdId: q.get("adid"),
    metaCampaignName: q.get("cname"),
    metaAdsetName: q.get("aname"),
    metaAdName: q.get("adnm"),
    platform: q.get("plat"),
    fbclid: q.get("fbclid"),
    landingPageUrl: env.landingPageUrl,
    ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
    referer: req.headers.get("referer"),
  });

  // Never make the visitor wait on the DB — race against a short timeout, let insert
  // finish/fail in the background either way. Losing an occasional row beats added latency.
  await Promise.race([insert, new Promise((resolve) => setTimeout(resolve, INSERT_TIMEOUT_MS))])
    .catch(() => {}); // insert failure never blocks the redirect

  const dest = new URL(env.landingPageUrl);
  dest.searchParams.set("utm_source", "facebook");
  dest.searchParams.set("utm_medium", "paid-social");
  if (q.get("cname")) dest.searchParams.set("utm_campaign", q.get("cname")!);
  dest.searchParams.set("utm_content", clickid); // bare token only — recovery key, no suffix
  dest.searchParams.set("utm_term", "");

  return NextResponse.redirect(dest, 302);
}
