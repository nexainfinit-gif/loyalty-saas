/**
 * In-memory LRU cache for generated .pkpass buffers.
 *
 * Key format: `${passId}:${passVersion}`
 * This ensures stale data is never served — when pass_version increments
 * (after a scan, revoke, or sync), the old entry simply becomes unreachable.
 */

interface CacheEntry {
  buffer: Buffer;
  createdAt: number;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS      = 5 * 60 * 1000; // 5 minutes

class PkpassLruCache {
  private map: Map<string, CacheEntry>;
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS) {
    this.map        = new Map();
    this.maxEntries = maxEntries;
    this.ttlMs      = ttlMs;
  }

  /**
   * Build a cache key from pass ID and version.
   */
  static key(passId: string, passVersion: number): string {
    return `${passId}:${passVersion}`;
  }

  /**
   * Retrieve a cached buffer, or undefined on miss / expiry.
   * Successful gets refresh the entry's position (LRU promotion).
   */
  get(key: string): Buffer | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    // Expired — evict and report miss
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }

    // LRU promotion: delete + re-insert moves the key to the end
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.buffer;
  }

  /**
   * Store a generated buffer. Evicts the least-recently-used entry
   * when the cache is at capacity.
   */
  set(key: string, buffer: Buffer): void {
    // If updating an existing key, delete first so it moves to the end
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    // Evict oldest (first inserted) entries while at capacity
    while (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, { buffer, createdAt: Date.now() });
  }

  /** Current number of entries (for diagnostics). */
  get size(): number {
    return this.map.size;
  }
}

/** Singleton cache instance — lives for the lifetime of the server process. */
export const pkpassCache = new PkpassLruCache(
  DEFAULT_MAX_ENTRIES,
  DEFAULT_TTL_MS,
);
