import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import { verifyAdminSession } from "@/lib/auth";

export async function GET(request, { params }) {
  await connectDB();
  const item = await ForexAnalysis.findById(params.id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!item.published) {
    const session = await verifyAdminSession();
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PUT(request, { params }) {
  const session = await verifyAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Publishing for the first time stamps publishedAt; never let the client
  // wipe an existing publishedAt (preserves historical record integrity).
  const existing = await ForexAnalysis.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.published && !existing.publishedAt) {
    body.publishedAt = new Date();
  }

  Object.assign(existing, body);
  await existing.save();

  return NextResponse.json({ item: existing });
}

export async function DELETE(request, { params }) {
  const session = await verifyAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const deleted = await ForexAnalysis.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
