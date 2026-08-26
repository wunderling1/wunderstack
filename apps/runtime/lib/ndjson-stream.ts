/**
 * The NDJSON streaming engine shared by every streaming route.
 *
 * Extracted from `chat-stream.ts` when the roleplay turn became a second streaming surface. The
 * guarantees below are the hard-won part — a client that hangs on a spinner forever is the failure
 * mode this code exists to prevent — and having two copies of them would mean fixing the next bug
 * in one and not the other. The event union and its terminal/final rules differ per surface, so
 * those are injected; the robustness is not.
 *
 * Guarantees, for any surface:
 *  - Heartbeats (empty NDJSON lines) until a FINAL event, so a long silent generation does not look
 *    like a dead connection to an intermediate proxy.
 *  - While the client is connected, the stream never ends without a TERMINAL event.
 *  - Nothing is ever emitted after the client has disconnected.
 *
 * "Terminal" and "final" are not the same thing, and the difference is not cosmetic: chat sends
 * `citations` (terminal — the client has its answer) and then still makes a follow-up model call
 * before `done` (final — the stream is over). Heartbeats must survive that gap.
 */

const HEARTBEAT_CHUNK = new TextEncoder().encode("\n");

/**
 * Work signal for one streamed turn: cancels on client disconnect, on stream cancel, OR when the
 * turn budget expires.
 *
 * The returned `turnDeadline` is handed back separately because terminal handling must ask a
 * different question than in-flight work does. Work stops on any of the three; whether to still
 * write an error event depends only on whether the CLIENT is gone. Conflating them is how a
 * turn-budget abort turns into a silent hang instead of a timeout message.
 */
export function createTurnWorkSignal(args: {
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

export interface PipeNdjsonResult {
  sentTerminal: boolean;
  sawError: boolean;
}

export interface PipeNdjsonArgs<TEvent extends { type: string }> {
  events: AsyncIterable<TEvent>;
  enqueue: (chunk: Uint8Array) => void;
  encodeEvent: (event: TEvent) => Uint8Array;
  /** The client has what it came for (an answer, a turn, or an error). */
  isTerminal: (type: TEvent["type"]) => boolean;
  /** Nothing more will be sent; heartbeats stop here. */
  isFinal: (type: TEvent["type"]) => boolean;
  /** Build this surface's error event. Kept injectable so the union stays closed per surface. */
  errorEvent: (message: string) => TEvent;
  timeoutMessage: string;
  genericErrorMessage: string;
  /** Prefix for server-side logs, e.g. "api/chat". */
  logLabel: string;
  isClientDisconnected: () => boolean;
  isTurnTimedOut: () => boolean;
  workSignal: AbortSignal;
  heartbeatMs: number;
  onEvent?: (event: TEvent) => void;
}

export async function pipeNdjsonStream<TEvent extends { type: string }>(
  args: PipeNdjsonArgs<TEvent>,
): Promise<PipeNdjsonResult> {
  let sentTerminal = false;
  let sentFinal = false;
  let sawError = false;

  const emitError = (message: string): void => {
    if (args.isClientDisconnected() || sentTerminal) {
      return;
    }
    sawError = true;
    sentTerminal = true;
    sentFinal = true;
    try {
      args.enqueue(args.encodeEvent(args.errorEvent(message)));
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
      if (args.isTerminal(event.type)) {
        sentTerminal = true;
      }
      if (args.isFinal(event.type)) {
        sentFinal = true;
      }
      try {
        args.enqueue(args.encodeEvent(event));
      } catch {
        break;
      }
    }
  } catch (error) {
    if (!args.isClientDisconnected()) {
      console.error(`[${args.logLabel}] stream failed:`, error);
      emitError(args.isTurnTimedOut() ? args.timeoutMessage : args.genericErrorMessage);
    }
  } finally {
    clearInterval(heartbeat);
    // Hard guarantee: while the client is still connected, never close without a terminal event.
    if (!args.isClientDisconnected() && !sentTerminal) {
      emitError(args.timeoutMessage);
    }
  }

  return { sentTerminal, sawError };
}
