import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "mmuo_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 hours

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random value (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Creates a signed, short-lived session token for the admin and sets it as an
 * HTTP-only, secure cookie. There is no user database of accounts here — the
 * ONLY subject this token can ever represent is the single configured admin
 * email, checked again on every request in requireAdmin().
 */
export async function createAdminSession(email) {
  const token = await new SignJWT({ role: "admin", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS
  });
}

export function destroyAdminSession() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

/**
 * Verifies the session cookie on the current request. Returns the decoded
 * payload if valid AND the email still matches the single configured admin
 * email (so rotating ADMIN_EMAIL instantly invalidates old sessions), or
 * null otherwise. This is the ONLY function that should be trusted to decide
 * whether a request is an authenticated admin.
 */
export async function verifyAdminSession(tokenOverride) {
  try {
    const token = tokenOverride ?? cookies().get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecretKey());

    if (payload.role !== "admin") return null;
    if (
      !process.env.ADMIN_EMAIL ||
      payload.email !== process.env.ADMIN_EMAIL
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
