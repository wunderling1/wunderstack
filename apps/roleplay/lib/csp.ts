/**
 * Content-Security-Policy for the learner UI.
 *
 * Built here rather than as a static `next.config` header because Next.js needs a fresh per-request
 * nonce to whitelist its own inline bootstrap scripts. Scripts stay nonce-locked; styles stay
 * permissive (Tailwind injects inline). `connect-src 'self'` is enough because `/api/*` is rewritten
 * same-origin — the browser never talks to the runtime origin directly.
 *
 * Fase 8's token-session is in place: the short-lived LTI token is JS-reachable (Safari will not
 * send a `SameSite=None` cookie in an LMS iframe). The mitigation is this CSP, not a looser one
 * "so LTI works". Do not add `'unsafe-inline'` to `script-src` to make a launch "easier".
 */

export function buildRoleplayCsp(args: {
  nonce: string;
  frameAncestors: string;
  isDev: boolean;
}): string {
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${args.nonce}'`,
    "'strict-dynamic'",
    ...(args.isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `frame-ancestors ${args.frameAncestors}`,
  ].join("; ");
}
