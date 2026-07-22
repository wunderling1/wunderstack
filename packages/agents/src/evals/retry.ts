/**
 * Retry an async operation with exponential backoff. Used by Gate C to survive transient
 * provider hiccups during the full golden-set run — both rate limits (429) AND transient network
 * failures (a dropped socket, DNS blip or TLS/connect timeout during the ~28 min of LLM calls).
 *
 * Why network errors matter here: `fetch` (undici) surfaces a connection drop as a generic
 * `TypeError: fetch failed` whose REAL reason lives in `error.cause` (e.g. `ECONNRESET`,
 * `UND_ERR_SOCKET`). A single un-retried blip used to abort the whole run mid-flight, so we walk
 * the cause chain and treat these as retryable.
 */

/** Node/undici error codes that signal a transient, worth-retrying network failure. */
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** Message fragments (lower-cased) that indicate a transient failure even without a code. */
const RETRYABLE_MESSAGE_FRAGMENTS = [
  "fetch failed",
  "socket hang up",
  "network",
  "timeout",
  "timed out",
  "connection",
  "econnreset",
  "eai_again",
];

/**
 * Walk the `error.cause` chain (undici nests the real reason there) and decide whether ANY link is
 * a transient rate-limit or network error worth retrying. Guarded against cyclic causes.
 */
export function isRetryableError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);

    const message = current instanceof Error ? current.message : String(current);
    const lowered = message.toLowerCase();

    // Rate limits: provider is up but throttling us.
    if (message.includes("429") || /rate limit/i.test(message)) {
      return true;
    }

    // Transient network failure by error code (Node's `code`, undici's on the cause).
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_ERROR_CODES.has(code)) {
      return true;
    }

    // Transient network failure by message shape (e.g. undici's "fetch failed").
    if (RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
      return true;
    }

    current = current instanceof Error ? current.cause : undefined;
  }

  return false;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
