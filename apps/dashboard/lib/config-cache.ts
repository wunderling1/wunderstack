import { updateTag } from "next/cache";

/**
 * Control-plane cache for config tabs (Teksten, Distributie, Huisstijl, Accounts, …).
 * KPI queries must not use these tags — those pages stay `force-dynamic` and uncached.
 */
export const CONFIG_REVALIDATE_SECONDS = 30;

export const FUNDS_INDEX_TAG = "dashboard-funds-index";

export function fundConfigTag(fundKey: string): string {
  return `dashboard-fund:${fundKey}`;
}

export function instanceConfigTag(fundKey: string, agentKey: string): string {
  return `dashboard-instance:${fundKey}:${agentKey}`;
}

/** Server-action only: drop cached control-plane reads after a write (read-your-writes). */
export function updateFundConfigCache(fundKey: string, agentKey?: string): void {
  updateTag(FUNDS_INDEX_TAG);
  updateTag(fundConfigTag(fundKey));
  if (agentKey !== undefined) {
    updateTag(instanceConfigTag(fundKey, agentKey));
  }
}
