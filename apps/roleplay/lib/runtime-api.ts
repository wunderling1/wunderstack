import { ltiAuthHeaders, readLtiTokenFromWindow } from "./lti-token";

/**
 * Headers for roleplay calls that proxy to the runtime. Same public tenant-key header the embed
 * and playground send (`x-wunderstack-key`). The key is a public identifier, so NEXT_PUBLIC_* is
 * the right exposure. When an LTI launch is in progress, the short-lived token rides as
 * `x-lti-token` (Safari will not send a third-party cookie in the LMS iframe).
 */
export function runtimeApiHeaders(extra?: HeadersInit): HeadersInit {
  const key = process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY?.trim();
  return {
    "content-type": "application/json",
    ...(key ? { "x-wunderstack-key": key } : {}),
    ...ltiAuthHeaders(readLtiTokenFromWindow()),
    ...extra,
  };
}
