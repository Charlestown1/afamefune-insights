import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import { verifyAdminSession } from "@/lib/auth";

// Public: list published analyses (with optional filters).
// Admin (logged in): can pass ?all=true to see unpublished/drafts too.
export async function GET(request) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const pair = searchParams.get("pair");
  const status = searchParams.get("status");
  const timeframe = searchParams.get("timeframe");
  const wantsAll = searchParams.get("all") === "true";
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const query = {};
  if (wantsAll) {
    const session = await verifyAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    query.published = true;
  }

  if (pair) query.pair = pair.toUpperCase();
  if (status) query.status = status;
  if (timeframe) query.timeframe = timeframe;

  const items = await ForexAnalysis.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ items });
}

// Admin only (enforced by middleware.js AND re-checked here).
export async function POST(request) {
  const session = await verifyAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.pair || !body.direction || !body.title) {
    return NextResponse.json(
      { error: "pair, direction, and title are required." },
      { status: 400 }
    );
  }
  if (!["BUY", "SELL"].includes(body.direction)) {
    return NextResponse.json({ error: "Invalid direction." }, { status: 400 });
  }

  if (body.published && !body.publishedAt) {
    body.publishedAt = new Date();
  }

  const created = await ForexAnalysis.create(body);
  return NextResponse.json({ item: created }, { status: 201 });
}
