import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Announcement from "@/lib/models/Announcement";
import { verifyAdminSession } from "@/lib/auth";

export async function GET(request) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const wantsAll = searchParams.get("all") === "true";

  if (wantsAll) {
    const session = await verifyAdminSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const items = await Announcement.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ items });
  }

  const items = await Announcement.find({ active: true })
    .sort({ createdAt: -1 })
    .limit(5)
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

  if (!body.message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const created = await Announcement.create(body);
  return NextResponse.json({ item: created }, { status: 201 });
}
