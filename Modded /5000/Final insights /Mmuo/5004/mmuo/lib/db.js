import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

let cached = global._mongooseConn;
if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!MONGO_URI) {
    throw new Error(
      "MONGO_URI is not set. Add it to your .env file (see .env.example)."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGO_URI, { bufferCommands: false })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
