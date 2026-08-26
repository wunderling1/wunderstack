/**
 * Client-safe helpers for the LTI 1.1 token session (Safari will not send a third-party cookie
 * in an LMS iframe). No server-only imports — used by the session keeper and by fetch headers.
 */

export const LTI_TOKEN_QUERY_PARAM = "ltiToken";
export const LTI_TOKEN_HEADER = "x-lti-token";
export const LTI_TOKEN_STORAGE_KEY = "wunderstack_lti_token";

export function appendLtiToken(path: string, token: string | null | undefined): string {
  if (!token) {
    return path;
  }
  const hashIndex = path.indexOf("#");
  const pathPart = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const sep = pathPart.includes("?") ? "&" : "?";
  return `${pathPart}${sep}${LTI_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}${hash}`;
}

export function ltiAuthHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { [LTI_TOKEN_HEADER]: token } : {};
}

export function readLtiTokenFromWindow(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.sessionStorage.getItem(LTI_TOKEN_STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // sessionStorage blocked — fall through to the URL (Fase-2 behaviour).
  }
  try {
    return new URL(window.location.href).searchParams.get(LTI_TOKEN_QUERY_PARAM);
  } catch {
    return null;
  }
}
