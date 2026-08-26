/**
 * LMS-origin allowlist for `frame-ancestors`.
 *
 * Fase 8 iframes this app from a customer's LMS. The allowlist has to exist before that launch
 * route does, because a CSP that defaults to `'none'` (playground) would make every LTI launch a
 * blank frame, and discovering that on the launch day is too late.
 *
 * Wildcards and anything that is not a full origin are refused: `frame-ancestors *` would let any
 * site wrap the learner UI, and a path on the origin is not valid in this directive.
 */

export function parseAllowedOrigins(raw: string): string[] {
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value.length === 0) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      continue;
    }
    if (parsed.hostname.length === 0 || parsed.hostname.includes("*")) {
      continue;
    }
    if (parsed.origin !== value) {
      // Reject `https://lms.example/path`, `https://lms.example/`, wildcards-in-host, etc.
      continue;
    }
    if (seen.has(parsed.origin)) {
      continue;
    }
    seen.add(parsed.origin);
    origins.push(parsed.origin);
  }
  return origins;
}

/** `'self'` when unset: the page can be framed by its own origin, not by an LMS yet. */
export function roleplayFrameAncestors(raw: string | undefined): string {
  const origins = parseAllowedOrigins(raw ?? "");
  return origins.length > 0 ? origins.join(" ") : "'self'";
}
