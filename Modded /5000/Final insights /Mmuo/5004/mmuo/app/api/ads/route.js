import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Advertisement from "@/lib/models/Advertisement";
import { verifyAdminSession } from "@/lib/auth";

// Public: only currently-active ads within their date window, for a given placement.
export async function GET(request) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement");
  const wantsAll = searchParams.get("all") === "true";

  if (wantsAll) {
    const session = await verifyAdminSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const items = await Advertisement.find({}).sort({ priority: -1, createdAt: -1 }).lean();
    return NextResponse.json({ items });
  }

  const now = new Date();
  const query = {
    active: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
    ]
  };
  if (placement) query.placement = placement;

  const items = await Advertisement.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .lean();

  return NextResponse.json({ items });
}

export async function POST(request) {
  const session = await verifyAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  const created = await Advertisement.create(body);
  return NextResponse.json({ item: created }, { status: 201 });
}
