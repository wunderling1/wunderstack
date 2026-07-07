import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@wunderstack/shared";

/**
 * HMAC signature + replay verification for inbound webhooks (security-audit finding #5, API2 Broken
 * Authentication). The webhook is a public endpoint that will gain side effects (ingestion triggers)
 * later; the verification is built into the seam *now* so it can never ship unauthenticated.
 *
 * Contract: the sender computes `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` and sends it hex-
 * encoded in `x-wunderstack-signature`, with the unix-millisecond `x-wunderstack-timestamp`. We
 * verify with a timing-safe comparison, reject stale timestamps (replay window), and reject a
 * signature we have already seen inside that window (replay of a still-fresh request).
 *
 * When `WEBHOOK_SIGNING_SECRET` is unset the endpoint is treated as misconfigured and every request
 * is rejected — a signed-by-default seam (the demo has no legitimate unauthenticated webhook use).
 */

const SIGNATURE_HEADER = "x-wunderstack-signature";
const TIMESTAMP_HEADER = "x-wunderstack-timestamp";
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

/** Recently accepted signatures -> first-seen time, to reject replays within the window. */
const seenSignatures = new Map<string, number>();
const MAX_TRACKED_SIGNATURES = 10_000;

function pruneSeen(now: number): void {
  if (seenSignatures.size < MAX_TRACKED_SIGNATURES) {
    return;
  }
  for (const [signature, seenAt] of seenSignatures) {
    if (now - seenAt > REPLAY_WINDOW_MS) {
      seenSignatures.delete(signature);
    }
  }
}

function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function verifyWebhookSignature(request: Request, rawBody: string): WebhookVerifyResult {
  const secret = env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: "webhook_not_configured" };
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  if (!signature || !timestamp) {
    return { ok: false, status: 401, error: "missing_signature" };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, status: 401, error: "invalid_timestamp" };
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > REPLAY_WINDOW_MS) {
    return { ok: false, status: 401, error: "stale_timestamp" };
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!hexEqual(signature, expected)) {
    return { ok: false, status: 401, error: "invalid_signature" };
  }

  pruneSeen(now);
  if (seenSignatures.has(signature)) {
    return { ok: false, status: 401, error: "replayed_request" };
  }
  seenSignatures.set(signature, now);

  return { ok: true };
}
