import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Edge middleware can't import mongoose/jose-with-node-crypto reliably in all
// setups, but jose's jwtVerify works fine in the Edge runtime — this gives a
// fast first line of defense. Every protected API route ALSO calls
// verifyAdminSession() again server-side (see lib/auth.js), so access is
// enforced twice: nothing relies on this middleware alone.

const COOKIE_NAME = "mmuo_admin_session";

async function isValidAdminToken(token) {
  try {
    if (!token || !process.env.SESSION_SECRET) return false;
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return (
      payload.role === "admin" &&
      process.env.ADMIN_EMAIL &&
      payload.email === process.env.ADMIN_EMAIL
    );
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const isProtectedPage =
    pathname.startsWith("/admin/dashboard");
  const isProtectedApi =
    pathname.startsWith("/api/admin") &&
    !pathname.startsWith("/api/admin/login");
  const isContentAdminApi =
    /^\/api\/(forex|crypto|gems|ads|announcements|settings|upload)\b/.test(
      pathname
    ) &&
    request.method !== "GET";

  if (!isProtectedPage && !isProtectedApi && !isContentAdminApi) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const valid = await isValidAdminToken(token);

  if (!valid) {
    if (isProtectedPage) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/dashboard/:path*",
    "/api/admin/:path*",
    "/api/forex/:path*",
    "/api/crypto/:path*",
    "/api/gems/:path*",
    "/api/ads/:path*",
    "/api/announcements/:path*",
    "/api/settings/:path*",
    "/api/upload/:path*"
  ]
};
