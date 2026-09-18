import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/getSettings";
import { verifyAdminSession } from "@/lib/auth";

// Public GET returns the settings (safe to expose — no secrets live here).
export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request) {
  const session = await verifyAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const settings = await getSiteSettings();

  // Whitelist updatable fields explicitly rather than Object.assign(body) —
  // never let arbitrary client-supplied keys (like `singleton` or `_id`) through.
  const allowed = [
    "siteName",
    "siteDescription",
    "contactEmail",
    "footerText",
    "socialLinks",
    "telegramChannelUrl",
    "telegramGroupUrl",
    "telegramBlurb",
    "bnbDonationAddress",
    "donationBlurb",
    "defaultDisclaimer",
    "announcementBannerText",
    "announcementBannerActive"
  ];

  for (const key of allowed) {
    if (key in body) settings[key] = body[key];
  }

  await settings.save();
  return NextResponse.json({ settings });
}
