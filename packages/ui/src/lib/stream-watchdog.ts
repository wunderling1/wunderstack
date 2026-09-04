/**
 * Liveness watchdog for one streamed turn, client side: it aborts a stream that has gone silent so
 * the reader never spins forever on a connection that died without an abort.
 *
 * Extracted from the chat hook when the roleplay turn became a second streaming client, for the
 * same reason `apps/runtime/lib/ndjson-stream.ts` exists server-side: two copies of this timing
 * means fixing the next bug in one of them.
 *
 * The hard-won part is what does NOT count as silence. A naked `setTimeout` measures wall-clock
 * time, but a page only reads bytes while it is actually running. A backgrounded tab, a frozen
 * page, a sleeping machine — the clock runs on while nothing is processed, and on return the
 * overdue timer fires before the bytes that were waiting all along. The stream is healthy; the
 * client kills it anyway, and the reader sees a timeout it never earned. So:
 *  - Time spent hidden is not counted, and becoming visible restarts the budget.
 *  - A tick that arrives far later than scheduled means the page was suspended, not that the
 *    stream stalled: the budget restarts instead of firing.
 * Everything else — a genuinely silent stream in a visible, awake tab — still trips the watchdog.
 *
 * Pure timing logic, no React. `now`/`scheduleTick`/visibility are injected so tests run on a fake
 * clock; the defaults bind to the browser.
 */

export type CancelScheduled = () => void;

export interface StreamWatchdogOptions {
  /** Silence budget: no byte for this long, while visible and awake, means the stream is dead. */
  timeoutMs: number;
  /** Fired at most once, when that budget is exceeded. The caller aborts its own request. */
  onTimeout: () => void;
  /**
   * How often to check. Also the yardstick for "this tick came far too late, so the page was
   * suspended". Defaults to one second, and never exceeds the budget itself.
   */
  tickMs?: number;
  /** Wall clock in ms — deliberately not monotonic: a suspend must be visible as a jump. */
  now?: () => number;
  /** Schedules `fn` every `ms` and returns a canceller (`setInterval` / `clearInterval`). */
  scheduleTick?: (ms: number, fn: () => void) => CancelScheduled;
  /** Whether the page is currently hidden. */
  isHidden?: () => boolean;
  /** Subscribes to visibility changes and returns an unsubscriber. */
  onVisibilityChange?: (listener: () => void) => () => void;
}

export interface StreamWatchdog {
  /** Call on every byte received: the stream is alive. */
  signal: () => void;
  /** Stop watching (stream finished, aborted, or already timed out). Idempotent. */
  stop: () => void;
}

const DEFAULT_TICK_MS = 1_000;

/**
 * How much later than scheduled a tick may arrive before we read it as "the page was not running"
 * rather than "the stream is slow". Background tabs are throttled to roughly one wake-up per
 * second and, after minutes, per minute — so the margin has to be generous enough not to call
 * ordinary throttling a suspend, and tight enough that a real suspend never fires the watchdog.
 */
const SUSPEND_TICK_FACTOR = 3;

function browserIsHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function browserOnVisibilityChange(listener: () => void): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function browserScheduleTick(ms: number, fn: () => void): CancelScheduled {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

export function createStreamWatchdog(options: StreamWatchdogOptions): StreamWatchdog {
  const now = options.now ?? (() => Date.now());
  const scheduleTick = options.scheduleTick ?? browserScheduleTick;
  const isHidden = options.isHidden ?? browserIsHidden;
  const onVisibilityChange = options.onVisibilityChange ?? browserOnVisibilityChange;
  const tickMs = Math.max(1, Math.min(options.tickMs ?? DEFAULT_TICK_MS, options.timeoutMs));

  let lastSignal = now();
  let lastTick = lastSignal;
  let stopped = false;
  let cancelTick: CancelScheduled = () => {};
  let unsubscribe: () => void = () => {};

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    cancelTick();
    unsubscribe();
  };

  const signal = (): void => {
    lastSignal = now();
  };

  const tick = (): void => {
    if (stopped) {
      return;
    }
    const current = now();
    const sinceTick = current - lastTick;
    lastTick = current;
    if (isHidden() || sinceTick > tickMs * SUSPEND_TICK_FACTOR) {
      lastSignal = current;
      return;
    }
    if (current - lastSignal < options.timeoutMs) {
      return;
    }
    stop();
    options.onTimeout();
  };

  cancelTick = scheduleTick(tickMs, tick);
  unsubscribe = onVisibilityChange(() => {
    if (isHidden()) {
      return;
    }
    // Coming back is a wake-up, not a delivery: start the budget over, so the first tick after the
    // tab returns does not charge the reader for time it was not running.
    const current = now();
    lastSignal = current;
    lastTick = current;
  });

  return { signal, stop };
}
