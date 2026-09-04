import { z } from "zod";

/**
 * Client-safe parse of public Next env. Do not import `@wunderstack/shared` env here — that barrel
 * parses the whole process env at import. Bounds mirror `RUNTIME_CHAT_*` (positive, max 5 minutes).
 */

/**
 * Silence budget for one streamed turn. Three server heartbeats wide (RUNTIME_CHAT_HEARTBEAT_MS
 * is 10s): a single missed heartbeat is a hiccup, not a dead stream.
 */
const DEFAULT_CHAT_INACTIVITY_MS = 30_000;

const inactivityMsSchema = z.coerce.number().int().positive().max(300_000);

export function readChatInactivityMs(): number {
  const raw = process.env.NEXT_PUBLIC_CHAT_INACTIVITY_MS?.trim();
  if (!raw) {
    return DEFAULT_CHAT_INACTIVITY_MS;
  }
  const parsed = inactivityMsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_CHAT_INACTIVITY_MS;
}

/**
 * Public key for the arbocatalogus playground surface. Missing while that surface is on must not
 * silently fall through to CAO (review W4 / PR-B).
 */
export function readArboTenantKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO?.trim();
  return value ? value : undefined;
}

export const ARBO_KEY_MISSING_MESSAGE =
  "De arbocatalogus-demo is niet geconfigureerd: NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO ontbreekt. De CAO-demo blijft beschikbaar.";

export function arboSurfaceError(): string | null {
  return readArboTenantKey() ? null : ARBO_KEY_MISSING_MESSAGE;
}
