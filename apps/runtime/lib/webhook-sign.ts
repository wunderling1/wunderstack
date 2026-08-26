import { createHmac } from "node:crypto";

/**
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, hex-encoded. The inbound webhook verifies this
 * (`webhook-auth.ts`); outbound result delivery produces it. Same string, opposite directions, so a
 * fund that already signs requests to us can verify the results we send with the same secret.
 *
 * Headers: `x-wunderstack-signature` (this digest) and `x-wunderstack-timestamp` (unix ms).
 */
export const WEBHOOK_SIGNATURE_HEADER = "x-wunderstack-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-wunderstack-timestamp";

export function signWebhookBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function webhookSignatureHeaders(
  secret: string,
  rawBody: string,
  nowMs = Date.now(),
): { signature: string; timestamp: string; headers: Record<string, string> } {
  const timestamp = String(nowMs);
  const signature = signWebhookBody(secret, timestamp, rawBody);
  return {
    signature,
    timestamp,
    headers: {
      [WEBHOOK_SIGNATURE_HEADER]: signature,
      [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    },
  };
}
