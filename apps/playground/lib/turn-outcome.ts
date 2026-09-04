import type { WritableTurnOutcome } from "@wunderstack/shared/browser";

/** B5: refusal comes from analytics classification, not from `!found && !needsClarification`. */
export function isRefusedTurn(turnOutcome: WritableTurnOutcome | undefined): boolean {
  return turnOutcome?.outcome === "refused";
}
