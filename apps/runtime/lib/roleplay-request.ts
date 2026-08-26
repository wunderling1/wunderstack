import type { TenantConfig } from "@wunderstack/db";
import { env } from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";

import { corsHeaders, preflight } from "./cors.js";
import { resolveEmbedAuth } from "./embed-auth.js";
import { readBodyBounded } from "./http.js";
import { resolveLtiLaunch, type LtiLaunchBound } from "./lti11/request-auth.js";
import { checkDailyCap, checkRateLimit, clientKey } from "./rate-limit.js";
import { tenantCorsAllowlist } from "./tenant-cors.js";

/**
 * The shared perimeter for the three roleplay routes.
 *
 * Identical in kind to what `/api/chat` enforces, and for the same reason: these endpoints are
 * public and each call costs an LLM generation. Factored out rather than copied three times —
 * a perimeter that is only applied on two of three routes is not a perimeter.
 */

/** Per-IP ceiling. A roleplay turn is one generation, same order of cost as a chat turn. */
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

/** Per-tenant-key ceiling: bounds one fund's whole audience independent of any single IP. */
const KEY_RATE_LIMIT = { windowMs: 60_000, max: 120 };

/** Starting a session is cheaper to abuse and cheaper to serve, but still a generation. */
const START_RATE_LIMIT = { windowMs: 60_000, max: 10 };

/**
 * GET /review is polled for up to two minutes. The turn limit of 20/60s would 429 a client that
 * did nothing but wait for a judgement it already paid for. 40/60s is a 3-second poll over two
 * minutes, with a little headroom for a retry after a dropped response.
 */
const POLL_RATE_LIMIT = { windowMs: 60_000, max: 40 };

const DAILY_CAP = env.RUNTIME_DAILY_CAP ?? 0;

export type RoleplayAuthGate =
  | { ok: true; config: TenantConfig | null; cors: Record<string, string>; ltiLaunch: LtiLaunchBound | null }
  | { ok: false; response: Response };

export type RoleplayGate =
  | {
      ok: true;
      config: TenantConfig | null;
      cors: Record<string, string>;
      json: unknown;
      ltiLaunch: LtiLaunchBound | null;
    }
  | { ok: false; response: Response };

function limitFor(kind: "start" | "turn" | "poll"): { windowMs: number; max: number } {
  if (kind === "start") return START_RATE_LIMIT;
  if (kind === "poll") return POLL_RATE_LIMIT;
  return RATE_LIMIT;
}

export async function roleplayPreflight(request: Request): Promise<Response> {
  return preflight(request, await tenantCorsAllowlist(getTenantId()));
}

/**
 * Authenticate and rate-limit. Used by GET (no body) and by the JSON gate below.
 *
 * Auth stays a no-op for the unkeyed demo; a present `x-lti-token` is verified here so a spoofed
 * launch cannot ride along on a valid tenant key.
 */
export async function gateRoleplayAuth(
  request: Request,
  kind: "start" | "turn" | "poll",
): Promise<RoleplayAuthGate> {
  const auth = await resolveEmbedAuth(request);
  const allowlist = auth.ok
    ? (auth.config?.corsAllowlist ?? [])
    : await tenantCorsAllowlist(getTenantId());
  const cors = corsHeaders(request, allowlist);

  const deny = (error: string, status: number, headers: Record<string, string> = {}): RoleplayAuthGate => ({
    ok: false,
    response: Response.json({ error }, { status, headers: { ...headers, ...cors } }),
  });

  if (!auth.ok) {
    return deny(auth.error, auth.status);
  }

  const limit = checkRateLimit(clientKey(request), limitFor(kind));
  if (!limit.ok) {
    return deny("rate_limited", 429, { "retry-after": String(limit.retryAfterSeconds) });
  }
  if (auth.config) {
    const keyLimit = checkRateLimit(`roleplay:${auth.config.tenantId}`, KEY_RATE_LIMIT);
    if (!keyLimit.ok) {
      return deny("rate_limited", 429, { "retry-after": String(keyLimit.retryAfterSeconds) });
    }
  }

  const lti = await resolveLtiLaunch(request);
  if (!lti.ok) {
    return deny(lti.error, lti.status);
  }

  return { ok: true, config: auth.config, cors, ltiLaunch: lti.launch };
}

/**
 * Authenticate, rate-limit, bound the body, and parse JSON — in that order.
 *
 * The order matters: an unauthenticated caller is rejected before we spend a rate-limit slot on
 * them, and the body is size-capped before `JSON.parse` sees it, because a route handler has no
 * built-in body limit and Zod's field caps only apply after the whole thing is in memory.
 */
export async function gateRoleplayRequest(
  request: Request,
  kind: "start" | "turn",
): Promise<RoleplayGate> {
  const auth = await gateRoleplayAuth(request, kind);
  if (!auth.ok) {
    return auth;
  }
  const { cors } = auth;

  const body = await readBodyBounded(request);
  if (!body.ok) {
    return {
      ok: false,
      response: Response.json({ error: body.error }, { status: body.status, headers: cors }),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(body.raw);
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "invalid_request" }, { status: 400, headers: cors }),
    };
  }

  return { ok: true, config: auth.config, cors, json, ltiLaunch: auth.ltiLaunch };
}

/**
 * The process-wide daily generation ceiling. Counted only once a request has reached the expensive
 * path, so rejected and malformed requests do not eat the demo's budget.
 */
export function checkRoleplayDailyCap(cors: Record<string, string>): Response | null {
  const daily = checkDailyCap(DAILY_CAP);
  if (daily.ok) {
    return null;
  }
  return Response.json(
    { error: "daily_cap_reached" },
    { status: 429, headers: { "retry-after": String(daily.retryAfterSeconds), ...cors } },
  );
}
