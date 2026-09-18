import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import CryptoGem from "@/lib/models/CryptoGem";
import { verifyAdminSession } from "@/lib/auth";

export async function GET(request) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const wantsAll = searchParams.get("all") === "true";
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const query = {};
  if (wantsAll) {
    const session = await verifyAdminSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    query.published = true;
  }
  if (status) query.status = status;

  const items = await CryptoGem.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
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

  if (!body.name || !body.symbol) {
    return NextResponse.json(
      { error: "name and symbol are required." },
      { status: 400 }
    );
  }

  const created = await CryptoGem.create(body);
  return NextResponse.json({ item: created }, { status: 201 });
}
