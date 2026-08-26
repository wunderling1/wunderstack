import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * OAuth 1.0a / HMAC-SHA1 helpers — LTI 1.1 launch and Basic Outcomes.
 *
 * Ported from Qonvo `src/lib/lti11/oauth.ts`. Percent-encoding must follow RFC 3986 strictly:
 * `encodeURIComponent` leaves `!'()*` alone, and a mismatch there fails launches silently.
 */

export function pctEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildSignatureBaseString(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
): string {
  const sorted = Object.entries(params)
    .filter(([key]) => key !== "oauth_signature")
    .map(([key, value]) => [pctEncode(key), pctEncode(value)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));

  const paramString = sorted.map(([key, value]) => `${key}=${value}`).join("&");

  return [method.toUpperCase(), pctEncode(baseUrl), pctEncode(paramString)].join("&");
}

/** LTI 1.1 has no token secret: the signing key is `pctEncode(consumerSecret)&`. */
export function computeSignature(baseString: string, consumerSecret: string): string {
  const signingKey = `${pctEncode(consumerSecret)}&`;
  return createHmac("sha1", signingKey).update(baseString).digest("base64");
}

export function validateSignature(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
  consumerSecret: string,
): boolean {
  const provided = params["oauth_signature"];
  if (!provided) {
    return false;
  }

  const computed = computeSignature(buildSignatureBaseString(method, baseUrl, params), consumerSecret);
  const a = Buffer.from(computed);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** `oauth_body_hash` for non-form bodies (Basic Outcomes XML) = base64(sha1(body)). */
export function computeBodyHash(body: string): string {
  return createHash("sha1").update(body, "utf8").digest("base64");
}
