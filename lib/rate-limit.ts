// Per-IP sliding-window rate limiter. In-memory only — fine for a single
// serverless instance; swap for Upstash/Vercel KV when you need multi-instance.
// The limiter is only called from paths like /api/auth/login, so cache pressure
// is tiny.

type Hit = { count: number; windowStart: number };

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_HITS = 10;              // 10 attempts per window per IP
const buckets = new Map<string, Hit>();

export function rateLimit(key: string, max = MAX_HITS, windowMs = WINDOW_MS): { allowed: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfter: 0, remaining: max - 1 };
  }
  b.count++;
  if (b.count > max) {
    return { allowed: false, retryAfter: Math.ceil((b.windowStart + windowMs - now) / 1000), remaining: 0 };
  }
  return { allowed: true, retryAfter: 0, remaining: Math.max(0, max - b.count) };
}

export function clientIp(headers: Headers): string {
  // Vercel sets x-real-ip and x-forwarded-for; prefer the first entry.
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}
