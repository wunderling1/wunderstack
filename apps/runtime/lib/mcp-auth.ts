import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@wunderstack/shared";

/**
 * Authentication for the MCP endpoint (PLAN-mcp-server Fase 4 / M5). Two accepted schemes:
 *
 * 1. **HMAC** — sender computes `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` hex-encoded in
 *    `x-wunderstack-signature`, with unix-ms `x-wunderstack-timestamp`. Mirrors webhook-auth and
 *    adds a replay window. For GET/DELETE (no body), sign with an empty rawBody.
 * 2. **Bearer** — `Authorization: Bearer <token>`. Hosted MCP clients (Copilot Studio, MCP
 *    Inspector, mcp-remote) can only attach *static* headers, so they cannot produce a fresh
 *    signature per JSON-RPC message and scheme 1 is unreachable for them.
 *
 * Both use dual-credential rotation (CURRENT + optional PREVIOUS) so rotation has no downtime.
 * `verifyMcpAuth` picks the scheme from the request; when neither credential is configured every
 * request is rejected as unconfigured.
 *
 * A static bearer has no timestamp or replay protection, so its confidentiality rests entirely on
 * TLS plus token length (min 32 chars, enforced in env). Prefer HMAC for callers that can sign.
 */

const SIGNATURE_HEADER = "x-wunderstack-signature";
const TIMESTAMP_HEADER = "x-wunderstack-timestamp";
const AUTHORIZATION_HEADER = "authorization";
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

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

/** Constant-time compare of two utf8 credentials. Length inequality short-circuits (length leaks). */
function secretEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function matchesAnySecret(signature: string, payload: string, secrets: string[]): boolean {
  for (const secret of secrets) {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (hexEqual(signature, expected)) {
      return true;
    }
  }
  return false;
}

export type McpAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/** Active secrets (current first, previous if set). Empty when MCP is not configured. */
export function mcpSigningSecrets(): string[] {
  const secrets: string[] = [];
  if (env.MCP_SIGNING_SECRET) {
    secrets.push(env.MCP_SIGNING_SECRET);
  }
  if (env.MCP_SIGNING_SECRET_PREVIOUS) {
    secrets.push(env.MCP_SIGNING_SECRET_PREVIOUS);
  }
  return secrets;
}

/**
 * Pure verification against an explicit secret list (unit-testable). Production callers use
 * `verifyMcpSignature`, which reads secrets from env.
 */
export function verifyMcpSignatureWithSecrets(
  request: Request,
  rawBody: string,
  secrets: string[],
): McpAuthResult {
  if (secrets.length === 0) {
    return { ok: false, status: 503, error: "mcp_not_configured" };
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

  if (!matchesAnySecret(signature, `${timestamp}.${rawBody}`, secrets)) {
    return { ok: false, status: 401, error: "invalid_signature" };
  }

  pruneSeen(now);
  if (seenSignatures.has(signature)) {
    return { ok: false, status: 401, error: "replayed_request" };
  }
  seenSignatures.set(signature, now);

  return { ok: true };
}

export function verifyMcpSignature(request: Request, rawBody: string): McpAuthResult {
  return verifyMcpSignatureWithSecrets(request, rawBody, mcpSigningSecrets());
}

/** Active bearer tokens (current first, previous if set). Empty when bearer auth is not enabled. */
export function mcpBearerTokens(): string[] {
  const tokens: string[] = [];
  if (env.MCP_BEARER_TOKEN) {
    tokens.push(env.MCP_BEARER_TOKEN);
  }
  if (env.MCP_BEARER_TOKEN_PREVIOUS) {
    tokens.push(env.MCP_BEARER_TOKEN_PREVIOUS);
  }
  return tokens;
}

/**
 * Pure bearer verification against an explicit token list (unit-testable). No replay or timestamp
 * check is possible: the credential is static by design, because hosted hosts can only send static
 * headers.
 */
export function verifyMcpBearerWithTokens(request: Request, tokens: string[]): McpAuthResult {
  if (tokens.length === 0) {
    return { ok: false, status: 401, error: "bearer_not_configured" };
  }

  const header = request.headers.get(AUTHORIZATION_HEADER);
  if (!header) {
    return { ok: false, status: 401, error: "missing_bearer" };
  }

  // Scheme name is case-insensitive per RFC 7235.
  const match = /^bearer[ \t]+(.+)$/i.exec(header.trim());
  if (!match?.[1]) {
    return { ok: false, status: 401, error: "malformed_bearer" };
  }

  const presented = match[1].trim();
  const matched = tokens.some((token) => secretEqual(presented, token));
  return matched ? { ok: true } : { ok: false, status: 401, error: "invalid_bearer" };
}

/**
 * Pure scheme dispatch against explicit credentials (unit-testable). A caller presenting
 * `Authorization` is held to the bearer contract and never silently falls back to HMAC, so a wrong
 * token cannot be masked by a missing-signature error.
 */
export function verifyMcpAuthWithCredentials(
  request: Request,
  rawBody: string,
  credentials: { bearerTokens: string[]; signingSecrets: string[] },
): McpAuthResult {
  const { bearerTokens, signingSecrets } = credentials;
  if (bearerTokens.length === 0 && signingSecrets.length === 0) {
    return { ok: false, status: 503, error: "mcp_not_configured" };
  }
  if (request.headers.get(AUTHORIZATION_HEADER) !== null) {
    return verifyMcpBearerWithTokens(request, bearerTokens);
  }
  // Absent Authorization means the caller chose HMAC. If only bearer is offered that is a client
  // error (401), not an unconfigured server (503) — a 503 here would invite a pointless retry.
  if (signingSecrets.length === 0) {
    return { ok: false, status: 401, error: "missing_credentials" };
  }
  return verifyMcpSignatureWithSecrets(request, rawBody, signingSecrets);
}

/** Entry point used by the route: dispatches on the request's scheme using env credentials. */
export function verifyMcpAuth(request: Request, rawBody: string): McpAuthResult {
  return verifyMcpAuthWithCredentials(request, rawBody, {
    bearerTokens: mcpBearerTokens(),
    signingSecrets: mcpSigningSecrets(),
  });
}

/**
 * DNS-rebinding guard against an explicit host list (unit-testable). Production uses
 * `verifyMcpHost`, which reads `MCP_ALLOWED_HOSTS` from env.
 */
export function verifyMcpHostAgainstAllowlist(
  request: Request,
  allowedHostsRaw: string | undefined,
): McpAuthResult {
  if (!allowedHostsRaw) {
    return { ok: true };
  }
  const allowed = allowedHostsRaw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  if (allowed.length === 0) {
    return { ok: true };
  }
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (!allowed.includes(host)) {
    return { ok: false, status: 401, error: "host_not_allowed" };
  }
  return { ok: true };
}

export function verifyMcpHost(request: Request): McpAuthResult {
  return verifyMcpHostAgainstAllowlist(request, env.MCP_ALLOWED_HOSTS);
}

/** Test helper: clear the in-memory replay cache between unit tests. */
export function resetMcpAuthReplayCacheForTests(): void {
  seenSignatures.clear();
}
