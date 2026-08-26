import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { buildRoleplayCsp } from "./lib/csp";
import { roleplayFrameAncestors } from "./lib/frame-ancestors";

/**
 * Request-time security boundary (same finding as playground/runtime: nonce CSP cannot live as a
 * static next.config header).
 *
 * Deliberately no `X-Frame-Options: DENY`. That header cannot express an allowlist, and sending it
 * would make every LMS iframe fail even after `ROLEPLAY_ALLOWED_ORIGINS` is set. Framing is governed
 * only by `frame-ancestors`.
 *
 * Auth stays a no-op: v1 is open + rate-limited at the runtime. The LTI token-session lives in
 * the client (sessionStorage + `x-lti-token`); this proxy only keeps CSP tight and strips Referer
 * so a token in the URL cannot leak to cross-origin subresources.
 */

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const csp = buildRoleplayCsp({
    nonce,
    frameAncestors: roleplayFrameAncestors(process.env.ROLEPLAY_ALLOWED_ORIGINS),
    isDev: process.env.NODE_ENV !== "production",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
