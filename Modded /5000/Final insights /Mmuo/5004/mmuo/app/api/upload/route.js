import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

// NOTE: Render's filesystem is ephemeral on the free/standard web-service
// tier — files written here can be wiped on redeploy/restart. For a
// production image host, point this route at a proper object store
// (Cloudinary, S3, Backblaze B2, etc.) instead. This local version is fully
// functional for development and small deployments, and validates type,
// size, and filename safely either way.
export async function POST(request) {
  const session = await verifyAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPG, PNG, WEBP, or GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 4MB." },
      { status: 400 }
    );
  }

  const extension = ALLOWED_TYPES[file.type];
  const safeName = `${crypto.randomUUID()}${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, safeName), bytes);

  return NextResponse.json({ url: `/uploads/${safeName}` }, { status: 201 });
}
