/**
 * CORS for the public embed surface (Fase 4).
 *
 * IMPORTANT — this is NOT a server-side authorization gate. CORS is enforced by the *browser*: an
 * origin that is not on the per-tenant allowlist simply gets no `Access-Control-Allow-Origin` header,
 * so the browser refuses to hand the response to that page's JS. The server still executed the
 * request. Combined with a public (non-secret) tenant-key, a non-browser caller (curl, a server-side
 * proxy) can always bypass this. So treat the allowlist as "don't let the widget render on random
 * sites", not as access control. The real abuse/denial-of-wallet controls are the per-IP + per-key
 * rate limits and `RUNTIME_DAILY_CAP` (see apps/runtime/lib/rate-limit.ts + the chat route).
 *
 * Same-origin and server-side callers send no `Origin` header and need no CORS headers.
 *
 * Local marketing (`http://localhost:3003`) is always allowlisted in development so `/agents/cao`
 * can boot the embed without a dashboard CORS edit. Production still requires an explicit origin on
 * the tenant allowlist.
 */

const ALLOW_HEADERS = "content-type, x-wunderstack-key";
const ALLOW_METHODS = "GET, POST, OPTIONS";

/** Marketing (and 127.0.0.1 twin) — only merged in when NODE_ENV=development. */
const DEV_EMBED_ORIGINS = ["http://localhost:3003", "http://127.0.0.1:3003"];

function effectiveAllowlist(allowlist: string[], nodeEnv: string | undefined): string[] {
  if (nodeEnv !== "development") return allowlist;
  return [...new Set([...allowlist, ...DEV_EMBED_ORIGINS])];
}

export function corsHeaders(
  request: Request,
  allowlist: string[],
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const allowed = effectiveAllowlist(allowlist, nodeEnv);
  if (!allowed.includes(origin) && !allowed.includes("*")) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-headers": ALLOW_HEADERS,
    "access-control-allow-methods": ALLOW_METHODS,
    "access-control-max-age": "600",
  };
}

/** 204 preflight response with the CORS headers for an allowed origin (empty otherwise). */
export function preflight(
  request: Request,
  allowlist: string[],
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, allowlist, nodeEnv) });
}
