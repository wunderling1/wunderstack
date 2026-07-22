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
 */

const ALLOW_HEADERS = "content-type, x-wunderstack-key";
const ALLOW_METHODS = "GET, POST, OPTIONS";

export function corsHeaders(request: Request, allowlist: string[]): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowlist.includes(origin) && !allowlist.includes("*")) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-headers": ALLOW_HEADERS,
    "access-control-allow-methods": ALLOW_METHODS,
    "access-control-max-age": "600",
  };
}

/** 204 preflight response with the CORS headers for an allowed origin (empty otherwise). */
export function preflight(request: Request, allowlist: string[]): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, allowlist) });
}
