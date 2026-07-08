/**
 * Minimal in-memory rate limiting + concurrency guard for the public API (security-audit finding #1,
 * LLM10 Unbounded Consumption / denial-of-wallet). This is intentionally a thin seam, not a system:
 * a fixed-window counter and an in-flight counter kept in process memory. It is enough to stop
 * trivial abuse of the unauthenticated endpoints in the single-instance demo.
 *
 * LIMITATION (by design): the counters are per process, so a multi-instance deployment needs a
 * shared store (e.g. Redis / Upstash). Swapping the implementation stays confined to this file — the
 * call sites (`checkRateLimit`, `acquireSlot`) do not change. Do not build the distributed version
 * until a real deployment forces it.
 */

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets, when rejected. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Cap the map size so a flood of distinct keys cannot grow memory without bound. */
const MAX_TRACKED_KEYS = 10_000;

function prune(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * Record one request for `key` and report whether it is within the limit. A rejected request still
 * counts, so a client hammering the endpoint stays blocked for the rest of the window.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > options.max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Derive a rate-limit key from the request. Uses the client IP from the proxy headers Scalingo/most
 * platforms set; falls back to a shared bucket when unknown (so an unknown-IP flood is still bounded
 * rather than each request getting its own bucket).
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : (request.headers.get("x-real-ip") ?? "unknown");
}

/**
 * A global ceiling on concurrent in-flight expensive requests (the chat path runs an embedding +
 * an LLM call). Independent of the per-key rate limit: it bounds total resource use under a
 * distributed flood. Always pair `acquireSlot()` with a `releaseSlot()` in a `finally`.
 */
/** Mistral allows ~3 concurrent streams per API key; cap in-flight chat requests below that. */
const MAX_IN_FLIGHT = 3;
let inFlight = 0;

export function acquireSlot(): boolean {
  if (inFlight >= MAX_IN_FLIGHT) {
    return false;
  }
  inFlight += 1;
  return true;
}

export function releaseSlot(): void {
  if (inFlight > 0) {
    inFlight -= 1;
  }
}
