import type { ChatEvent } from "../app/api/chat/contract";

/**
 * Chat-stream robustness: turn budget, NDJSON heartbeats, and a terminal-event guarantee so the
 * client never hangs forever on the generating spinner (buffer-to-verify stays silent for a long
 * stretch). See the chat-robustness plan.
 */

/** Hard ceiling for one chat turn (retrieval + generate + repair). Local default ~45s. */
export const DEFAULT_CHAT_TURN_BUDGET_MS = 45_000;

/** Empty NDJSON lines keep the connection alive during the silent generating phase. */
export const DEFAULT_CHAT_HEARTBEAT_MS = 10_000;

export const CHAT_TIMEOUT_MESSAGE =
  "Het duurde te lang om je vraag te beantwoorden. Probeer het opnieuw.";

export const CHAT_GENERIC_ERROR_MESSAGE = "Er ging iets mis bij het beantwoorden van je vraag.";

const HEARTBEAT_CHUNK = new TextEncoder().encode("\n");

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

/**
 * Work signal for in-flight retrieval/generation: cancels when the client disconnects, the stream
 * consumer cancels, OR the turn budget expires. Terminal handling must check the *client* signal
 * separately so a turn-budget abort still yields an error event while the client is connected.
 */
export function createChatWorkSignal(args: {
  clientSignal: AbortSignal;
  cancelSignal: AbortSignal;
  turnBudgetMs: number;
}): { workSignal: AbortSignal; turnDeadline: AbortSignal } {
  const turnDeadline = AbortSignal.timeout(args.turnBudgetMs);
  return {
    turnDeadline,
    workSignal: AbortSignal.any([args.clientSignal, args.cancelSignal, turnDeadline]),
  };
}

export interface PipeChatNdjsonResult {
  sentTerminal: boolean;
  sawError: boolean;
}

/**
 * Pipe agent events into an NDJSON ReadableStream controller.
 *
 * - Emits empty lines on an interval (heartbeats) until a final event (`done`/`error`) is sent.
 * - On unexpected failure (client still connected): emits a generic `error` event.
 * - On turn-budget expiry or a silent end without a terminal event: emits a timeout `error`.
 * - Never emits after the client has disconnected.
 */
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
  let sentTerminal = false;
  let sentFinal = false;
  let sawError = false;

  const markTerminal = (): void => {
    sentTerminal = true;
  };

  const markFinal = (): void => {
    sentFinal = true;
  };

  const emitError = (message: string): void => {
    if (args.isClientDisconnected() || sentTerminal) {
      return;
    }
    sawError = true;
    markTerminal();
    markFinal();
    try {
      args.enqueue(args.encodeEvent({ type: "error", message }));
    } catch {
      /* controller already closed */
    }
  };

  const heartbeat = setInterval(() => {
    if (sentFinal || args.isClientDisconnected()) {
      return;
    }
    try {
      args.enqueue(HEARTBEAT_CHUNK);
    } catch {
      /* controller already closed */
    }
  }, args.heartbeatMs);
  // Do not keep the process alive solely for heartbeats.
  heartbeat.unref?.();

  try {
    for await (const event of args.events) {
      if (args.workSignal.aborted || args.isClientDisconnected()) {
        break;
      }
      args.onEvent?.(event);
      if (isTerminalChatEvent(event.type)) {
        markTerminal();
      }
      if (isFinalChatEvent(event.type)) {
        markFinal();
      }
      try {
        args.enqueue(args.encodeEvent(event));
      } catch {
        break;
      }
    }
  } catch (error) {
    if (!args.isClientDisconnected()) {
      console.error("[api/chat] agent stream failed:", error);
      emitError(args.isTurnTimedOut() ? CHAT_TIMEOUT_MESSAGE : CHAT_GENERIC_ERROR_MESSAGE);
    }
  } finally {
    clearInterval(heartbeat);
    // Hard guarantee: while the client is still connected, never close without a terminal event.
    if (!args.isClientDisconnected() && !sentTerminal) {
      emitError(CHAT_TIMEOUT_MESSAGE);
    }
  }

  return { sentTerminal, sawError };
}
