"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { LTI_TOKEN_QUERY_PARAM, LTI_TOKEN_STORAGE_KEY } from "@/lib/lti-token";

/**
 * Move the LTI session token out of the visible URL into sessionStorage.
 *
 * A full navigation has to carry `?ltiToken=` — there is no cookie in a Safari LMS iframe — but it
 * does not have to stay there. After load we store it (per-iframe partitioned) and strip it with
 * `history.replaceState`, so it does not leak via Referer or linger in access logs.
 *
 * Do not loosen CSP to make this "easier": the token is JS-reachable, and nonce + strict-dynamic
 * is the mitigation (docs/lti11-token-sessie.md).
 */
export function LtiSessionKeeper() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let storage: Storage;
    try {
      storage = window.sessionStorage;
    } catch {
      return;
    }

    const url = new URL(window.location.href);
    const token = url.searchParams.get(LTI_TOKEN_QUERY_PARAM);

    if (token) {
      try {
        storage.setItem(LTI_TOKEN_STORAGE_KEY, token);
      } catch {
        return;
      }
      url.searchParams.delete(LTI_TOKEN_QUERY_PARAM);
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [pathname]);

  return null;
}
