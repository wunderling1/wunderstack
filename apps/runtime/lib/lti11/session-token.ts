import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@wunderstack/shared";

/**
 * LTI 1.1 session token (Safari-proof launch).
 *
 * Safari will not send a `SameSite=None` cookie in an LMS iframe. The client gets a short-lived
 * HMAC token that points at `control.lti11_launches`. There is no AES-encrypted Supabase session
 * (Qonvo's `encryptSecret`) because Wunderstack has no learner accounts.
 *
 * Token payload is `{ lid, exp }` — no `uid`, no email. TTL is 4 hours, matching the launch row.
 */

export const LTI_SESSION_TOKEN_TTL_SECONDS = 4 * 60 * 60;

function requireSecret(override?: string): string {
  const secret = override ?? env.LTI_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("LTI_SESSION_SECRET is not configured (min. 16 characters).");
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export interface LtiSessionTokenPayload {
  /** `control.lti11_launches.id` */
  lid: string;
  /** Unix-seconds expiry. */
  exp: number;
}

export function mintLtiSessionToken(params: {
  launchId: string;
  ttlSeconds?: number;
  secret?: string;
  nowSeconds?: number;
}): string {
  const secret = requireSecret(params.secret);
  const exp = (params.nowSeconds ?? Math.floor(Date.now() / 1000)) + (params.ttlSeconds ?? LTI_SESSION_TOKEN_TTL_SECONDS);
  const payload: LtiSessionTokenPayload = { lid: params.launchId, exp };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${b64url(sign(body, secret))}`;
}

export function verifyLtiSessionToken(
  token: string | null | undefined,
  options: { secret?: string; nowSeconds?: number } = {},
): LtiSessionTokenPayload | null {
  if (!token) {
    return null;
  }
  let secret: string;
  try {
    secret = requireSecret(options.secret);
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [body, providedSig] = parts;
  const expected = b64url(sign(body, secret));
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  let payload: LtiSessionTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as LtiSessionTokenPayload;
  } catch {
    return null;
  }
  if (!payload?.lid || typeof payload.exp !== "number") {
    return null;
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }
  return payload;
}
