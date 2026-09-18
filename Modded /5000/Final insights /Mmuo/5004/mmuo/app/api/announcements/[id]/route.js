import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Announcement from "@/lib/models/Announcement";
import { verifyAdminSession } from "@/lib/auth";

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

  const existing = await Announcement.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  Object.assign(existing, body);
  await existing.save();

  return NextResponse.json({ item: existing });
}

export async function DELETE(request, { params }) {
  const session = await verifyAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const deleted = await Announcement.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
