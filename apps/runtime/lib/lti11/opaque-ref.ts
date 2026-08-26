import { createHmac } from "node:crypto";

/**
 * Stable opaque platform refs (R3). LMS `user_id` is sometimes an email; we never persist it
 * raw. HMAC-SHA256 of (namespace, consumerId, value) under LTI_SESSION_SECRET, hex — no `@`.
 */
export function opaqueLtiRef(secret: string, namespace: string, consumerId: string, value: string): string {
  return createHmac("sha256", secret).update(`${namespace}\0${consumerId}\0${value}`).digest("hex");
}
