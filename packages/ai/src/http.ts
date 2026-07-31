import { Agent, setGlobalDispatcher } from "undici";

let initialized = false;

/**
 * Tune undici's global HTTP dispatcher for long-lived connections to EU providers
 * (Scaleway embeddings/rerank, Mistral chat). Node's fetch already pools per-origin,
 * but the default 4s idle timeout closes sockets between demo requests — each new
 * question then pays a fresh TLS handshake (~300–500ms per hop).
 */
export function ensureHttpKeepAlive(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 600_000,
    }),
  );
}

/**
 * A provider answered with an HTTP failure after `fetchWithRetry` gave up. Carries the status,
 * because a caller needs to tell exhausted throttling apart from a real fault and the status used to
 * live only inside the message — which left string matching as the only way to distinguish them.
 * The message is unchanged from the plain Errors this replaced.
 */
export class ProviderHttpError extends Error {
  readonly status: number;

  constructor(label: string, status: number, detail: string) {
    super(`${label} failed (${String(status)}): ${detail}`);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

/**
 * True when the provider rate-limited us and the backoff budget in `fetchWithRetry` ran out. Such a
 * failure says nothing about the code under test: work that never ran has no result.
 */
export function isRateLimited(error: unknown): error is ProviderHttpError {
  return error instanceof ProviderHttpError && error.status === 429;
}

/** Provider statuses worth retrying: rate limiting (429) and transient upstream faults (5xx). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;

/**
 * POST-style fetch with backoff on 429/5xx. Scaleway enforces a tokens-per-minute quota; a burst of
 * embed/rerank calls (e.g. the eval running Gate B and the DB-backed integration gate back-to-back)
 * trips a 429. Retrying with exponential backoff — honouring Retry-After when present — lets the
 * per-minute bucket refill instead of failing the whole run. `label` names the provider in warnings.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS - 1) {
      return response;
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, MAX_DELAY_MS)
        : Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    // Drain the body so the socket is released before we sleep and retry.
    await response.text().catch(() => undefined);
    console.warn(
      `${label} responded ${String(response.status)}; retrying in ${String(delayMs)}ms ` +
        `(attempt ${String(attempt + 1)}/${String(MAX_ATTEMPTS)}).`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
