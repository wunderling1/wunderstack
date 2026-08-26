import type { ChatEvent } from "../app/api/chat/contract";
import {
  pipeNdjsonStream,
  type PipeNdjsonResult,
} from "./ndjson-stream.js";

/**
 * Chat's slice of the NDJSON stream contract: the turn budget, the heartbeat interval, and which
 * event types end what. The robustness itself lives in `ndjson-stream.ts`, shared with the roleplay
 * turn — see the guarantees documented there.
 */

/** Hard ceiling for one chat turn (retrieval + generate + repair). Local default ~45s. */
export const DEFAULT_CHAT_TURN_BUDGET_MS = 45_000;

/** Empty NDJSON lines keep the connection alive during the silent generating phase. */
export const DEFAULT_CHAT_HEARTBEAT_MS = 10_000;

export const CHAT_TIMEOUT_MESSAGE =
  "Het duurde te lang om je vraag te beantwoorden. Probeer het opnieuw.";

export const CHAT_GENERIC_ERROR_MESSAGE = "Er ging iets mis bij het beantwoorden van je vraag.";

/** The client has received an answer or a terminal error (used by emitError / finally guarantee). */
export function isTerminalChatEvent(type: ChatEvent["type"]): boolean {
  return type === "citations" || type === "done" || type === "error";
}

/**
 * Events that END the stream. Heartbeats must continue until one of these is sent, because the
 * agent still makes a follow-up model call between `citations` and `done`.
 */
export function isFinalChatEvent(type: ChatEvent["type"]): boolean {
  return type === "done" || type === "error";
}

export type PipeChatNdjsonResult = PipeNdjsonResult;

export async function pipeChatNdjsonStream(args: {
  events: AsyncIterable<ChatEvent>;
  enqueue: (chunk: Uint8Array) => void;
  encodeEvent: (event: ChatEvent) => Uint8Array;
  isClientDisconnected: () => boolean;
  isTurnTimedOut: () => boolean;
  workSignal: AbortSignal;
  heartbeatMs: number;
  onEvent?: (event: ChatEvent) => void;
}): Promise<PipeChatNdjsonResult> {
  return pipeNdjsonStream<ChatEvent>({
    ...args,
    isTerminal: isTerminalChatEvent,
    isFinal: isFinalChatEvent,
    errorEvent: (message) => ({ type: "error", message }),
    timeoutMessage: CHAT_TIMEOUT_MESSAGE,
    genericErrorMessage: CHAT_GENERIC_ERROR_MESSAGE,
    logLabel: "api/chat",
  });
}
