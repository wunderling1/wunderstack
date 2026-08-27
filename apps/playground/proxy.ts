import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Request-time security boundary (security-audit finding #6; .cursor/rules/200-architecture.mdc).
 *
 * Two responsibilities, both of which must run per request:
 *
 *  1. Nonce-based Content-Security-Policy. A strict `script-src` cannot live as a static value in
 *     next.config.mjs, because Next.js needs a fresh per-request nonce to whitelist its own inline
 *     bootstrap scripts (the ones that set `self.__next_f` / `self.__next_r`). We mint the nonce
 *     here and attach the CSP to both the *request* headers (Next reads the nonce from there to
 *     stamp its <script> tags) and the *response* headers (the browser enforces it).
 *
 *  2. Auth seam — intentionally a **no-op** for the public demo (see docs/plans/PLAN.md Fase 7). This is the
 *     seam where a per-customer deployment slots in real auth (Auth.js, an API-key check, an
 *     allowlist, ...) without changing routes or components. Keep it pass-through until a real
 *     usecase forces auth — do not build an auth system here now.
 *
 * (Next 16 renamed the `middleware` convention to `proxy`; it always runs on the Node.js runtime,
 * so `process.env` is read at request time and the `runtime` segment option must NOT be set here.)
 */

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  // Next's inline bootstrap scripts are whitelisted via the nonce; 'strict-dynamic' then trusts the
  // chunks those nonced scripts load. Dev additionally needs 'unsafe-eval' for React Fast Refresh.
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    scriptSrc,
    // Next/font + Tailwind inject inline styles; scripts stay nonce-locked, styles stay permissive.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const csp = buildCsp(nonce);

  // Next.js extracts the nonce from the CSP on the *request* headers to stamp its own <script> tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // ...and the browser enforces the CSP from the *response* headers.
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

export const config = {
  // Run on documents + API (nonce CSP + auth seam); skip Next's internal and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
