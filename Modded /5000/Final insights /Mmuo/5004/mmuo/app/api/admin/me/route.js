import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";

export async function GET() {
  const session = await verifyAdminSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, email: session.email });
}
