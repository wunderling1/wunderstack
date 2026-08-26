import { ROLEPLAY_TIMEOUT_MS } from "@wunderstack/agents";
import type { RoleplayEvent } from "@wunderstack/shared";

import { pipeNdjsonStream, type PipeNdjsonResult } from "./ndjson-stream.js";

/**
 * Roleplay's slice of the NDJSON stream contract. The robustness lives in `ndjson-stream.ts`,
 * shared with chat; only the event union and its terminal/final rules differ.
 */

/**
 * Hard ceiling for one roleplay turn, derived from the agent's own model timeout rather than
 * restated as a second constant.
 *
 * The margin is the point. Two independent 30s deadlines race, and which one wins decides whether
 * the learner sees the agent's failure or the stream's generic "took too long". Giving the stream a
 * few extra seconds makes the model call always lose that race, so the specific error survives.
 *
 * Lower than chat's 45s either way: a roleplay turn has no retrieval, no citation repair and no
 * follow-up call, and a conversation partner that takes most of a minute to reply has already
 * broken the illusion.
 */
export const DEFAULT_ROLEPLAY_TURN_BUDGET_MS = ROLEPLAY_TIMEOUT_MS.turn + 5_000;

export const DEFAULT_ROLEPLAY_HEARTBEAT_MS = 10_000;

export const ROLEPLAY_TIMEOUT_MESSAGE =
  "Het duurde te lang om te reageren. Probeer je bericht opnieuw te versturen.";

export const ROLEPLAY_GENERIC_ERROR_MESSAGE = "Er ging iets mis in het gesprek.";

/**
 * `turn` is the terminal event: at that point the client has the persona's reply and the authoritative
 * turn count. It is the roleplay counterpart of chat's `citations`.
 */
export function isTerminalRoleplayEvent(type: RoleplayEvent["type"]): boolean {
  return type === "turn" || type === "done" || type === "error";
}

export function isFinalRoleplayEvent(type: RoleplayEvent["type"]): boolean {
  return type === "done" || type === "error";
}

export async function pipeRoleplayNdjsonStream(args: {
  events: AsyncIterable<RoleplayEvent>;
  enqueue: (chunk: Uint8Array) => void;
  encodeEvent: (event: RoleplayEvent) => Uint8Array;
  isClientDisconnected: () => boolean;
  isTurnTimedOut: () => boolean;
  workSignal: AbortSignal;
  heartbeatMs: number;
  onEvent?: (event: RoleplayEvent) => void;
}): Promise<PipeNdjsonResult> {
  return pipeNdjsonStream<RoleplayEvent>({
    ...args,
    isTerminal: isTerminalRoleplayEvent,
    isFinal: isFinalRoleplayEvent,
    errorEvent: (message) => ({ type: "error", message }),
    timeoutMessage: ROLEPLAY_TIMEOUT_MESSAGE,
    genericErrorMessage: ROLEPLAY_GENERIC_ERROR_MESSAGE,
    logLabel: "api/roleplay",
  });
}
