import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminSession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/lib/rateLimit";

export async function POST(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const rateKey = `login:${ip}`;

  const rl = checkRateLimit(rateKey);
  if (!rl.allowed) {
    const minutes = Math.ceil(rl.retryAfterMs / 60000);
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in about ${minutes} minute(s).` },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, password } = body || {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;

  if (!configuredEmail || !configuredHash) {
    console.error("ADMIN_EMAIL or ADMIN_PASSWORD_HASH is not configured.");
    return NextResponse.json(
      { error: "Admin login is not configured on the server." },
      { status: 500 }
    );
  }

  // Constant-shape check: always run bcrypt.compare even on email mismatch,
  // so response timing doesn't reveal whether the email was correct.
  const emailMatches =
    email.trim().toLowerCase() === configuredEmail.trim().toLowerCase();
  const passwordMatches = await bcrypt.compare(password, configuredHash);

  if (!emailMatches || !passwordMatches) {
    recordFailedAttempt(rateKey);
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  clearAttempts(rateKey);
  await createAdminSession(configuredEmail);

  return NextResponse.json({ ok: true });
}
