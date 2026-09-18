/**
 * Simple in-memory brute-force protection for the admin login route.
 *
 * This is process-local, which is fine for a single Render web service
 * instance (the typical setup for this project). If you ever scale to
 * multiple instances, swap this for a shared store (e.g. Redis) so limits
 * apply across all instances.
 */

const attempts = new Map(); // key: ip -> { count, firstAttempt, lockedUntil }

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 6;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout after exceeding

export function checkRateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry) return { allowed: true };

  if (entry.lockedUntil && entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterMs: entry.lockedUntil - now
    };
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    return { allowed: false, retryAfterMs: LOCKOUT_MS };
  }

  return { allowed: true };
}

export function recordFailedAttempt(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now, lockedUntil: null });
    return;
  }

  entry.count += 1;
}

export function clearAttempts(key) {
  attempts.delete(key);
}

// Periodically clean up stale entries so the Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts.entries()) {
    const stale =
      now - entry.firstAttempt > WINDOW_MS &&
      (!entry.lockedUntil || entry.lockedUntil < now);
    if (stale) attempts.delete(key);
  }
}, 10 * 60 * 1000).unref?.();
