/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for Vercel serverless: state resets on cold start, which is
 * acceptable — it still protects against burst abuse within a single
 * instance lifetime. For distributed rate limiting, swap with Upstash.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks in long-running instances
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export function rateLimit(options: {
  /** Unique namespace to avoid collisions between different limiters */
  prefix: string;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}) {
  const { prefix, limit, windowMs } = options;

  return {
    /**
     * Check if the given key (typically an IP) is within the rate limit.
     * Returns `{ success: true }` if allowed, `{ success: false }` if blocked.
     */
    check(key: string): { success: boolean; remaining: number } {
      cleanup(windowMs);

      const id = `${prefix}:${key}`;
      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = store.get(id);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(id, entry);
      }

      // Remove expired timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length >= limit) {
        return { success: false, remaining: 0 };
      }

      entry.timestamps.push(now);
      return { success: true, remaining: limit - entry.timestamps.length };
    },
  };
}

/**
 * Extract client IP from request headers (works on Vercel + Cloudflare).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
