import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";
import { verifyAdminSession } from "@/lib/auth";

export async function GET(request) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const symbol = searchParams.get("symbol");
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

  if (symbol) query.symbol = symbol.toUpperCase();
  if (status) query.status = status;

  const items = await CryptoAnalysis.find(query)
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

  if (!body.coin || !body.symbol || !body.title) {
    return NextResponse.json(
      { error: "coin, symbol, and title are required." },
      { status: 400 }
    );
  }

  if (body.published && !body.publishedAt) {
    body.publishedAt = new Date();
  }

  const created = await CryptoAnalysis.create(body);
  return NextResponse.json({ item: created }, { status: 201 });
}
