import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { clicks } from "@/lib/db/schema";
import { generateClickId } from "@/lib/clickid";
import { env } from "@/lib/env";

// Generous on purpose: Neon can cold-start after scale-to-zero (first hit after idle can take
// 1-2s to wake compute). A short timeout here would silently drop exactly the clicks that
// arrive right after a campaign resumes from a pause — a slow redirect beats a lost click.
const INSERT_TIMEOUT_MS = 2500;

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

  // Never make the visitor wait on the DB — race against a timeout, let insert finish/fail
  // in the background either way (the query itself isn't cancelled by losing the race, it
  // keeps running against the pool). Logged, not swallowed: a real insert failure here is a
  // silently-lost clickid, worth seeing in the process log even though we never blocked on it.
  await Promise.race([insert, new Promise((resolve) => setTimeout(resolve, INSERT_TIMEOUT_MS))])
    .catch((err) => { console.error(`[/r] click insert failed for ${clickid}:`, err); });

  const dest = new URL(env.landingPageUrl);
  dest.searchParams.set("utm_source", "facebook");
  dest.searchParams.set("utm_medium", "paid-social");
  if (q.get("cname")) dest.searchParams.set("utm_campaign", q.get("cname")!);
  dest.searchParams.set("utm_content", clickid); // bare token only — recovery key, no suffix
  dest.searchParams.set("utm_term", "");

  const res = NextResponse.redirect(dest, 302);
  // First-party backup so the clickid survives even if track.js never loads (blocked JS,
  // adblock, slow connection). track.js's own cookie/localStorage/sessionStorage still wins
  // when present — this is just a floor, not the primary mechanism.
  res.cookies.set("flux_clickid", clickid, {
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
