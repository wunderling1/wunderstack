import { env } from "../env.js";

/**
 * Parse the comma-separated CAO_FUNDS allowlist. Returns an empty array when unset (local/dev).
 */
export function parseCaoFunds(): string[] {
  const raw = env.CAO_FUNDS;
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** Whether fund scoping is configured (production/demo with an allowlist). */
export function isFundScopeConfigured(): boolean {
  return parseCaoFunds().length > 0;
}
