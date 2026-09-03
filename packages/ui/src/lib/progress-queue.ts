/**
 * Paces stream-driven progress items so a burst of events does not flash past the reader
 * (docs/design/mockup-loading-states.html:250, :363-372). An item is released at
 * `max(arrival, lastRelease + gap)`: a slow stream passes through untouched, a burst is spread.
 *
 * Pure timing logic — no React, no DOM. `now`/`schedule` are injected so tests run on a fake clock.
 */

export type ProgressItemKind = "step" | "chip" | "done";

export type ProgressGaps = Record<ProgressItemKind, number>;

/** Minimum milliseconds between two releases, per kind (mockup GAP). */
export const defaultProgressGaps: ProgressGaps = { chip: 450, step: 650, done: 550 };

/** All gaps at zero: prefers-reduced-motion shows the data as it arrives. */
export const instantProgressGaps: ProgressGaps = { chip: 0, step: 0, done: 0 };

export type CancelScheduled = () => void;

export interface ProgressQueueOptions<T> {
  /** Called when an item may be shown. */
  onRelease: (kind: ProgressItemKind, payload: T) => void;
  /** Monotonic clock in ms (`performance.now` in the browser). */
  now: () => number;
  /** Schedules `fn` after `ms` and returns a canceller (`setTimeout` / `clearTimeout`). */
  schedule: (ms: number, fn: () => void) => CancelScheduled;
  gaps?: Partial<ProgressGaps>;
}

export interface ProgressQueue<T> {
  enqueue: (kind: ProgressItemKind, payload: T) => void;
  /** Drops what is still waiting and forgets the last release (new turn, abort, error event). */
  clear: () => void;
  /** Releases everything still waiting, in order, without waiting for the gaps. */
  flush: () => void;
}

interface QueuedItem<T> {
  kind: ProgressItemKind;
  payload: T;
  arrival: number;
}

export function createProgressQueue<T>({
  onRelease,
  now,
  schedule,
  gaps,
}: ProgressQueueOptions<T>): ProgressQueue<T> {
  const spacing: ProgressGaps = { ...defaultProgressGaps, ...gaps };
  const waiting: QueuedItem<T>[] = [];
  // Null until the first release: nothing precedes the first item, so it needs no spacing.
  let lastRelease: number | null = null;
  let cancel: CancelScheduled | null = null;

  const releaseAt = (item: QueuedItem<T>): number =>
    lastRelease === null
      ? item.arrival
      : Math.max(item.arrival, lastRelease + spacing[item.kind]);

  const pump = (): void => {
    cancel = null;
    const item = waiting[0];
    if (item === undefined) {
      return;
    }
    const showAt = releaseAt(item);
    const current = now();
    if (current < showAt) {
      cancel = schedule(showAt - current, pump);
      return;
    }
    waiting.shift();
    // Track the intended time, not the actual one, so a late timer does not drift the queue.
    lastRelease = showAt;
    onRelease(item.kind, item.payload);
    pump();
  };

  return {
    enqueue(kind, payload) {
      waiting.push({ kind, payload, arrival: now() });
      if (cancel === null) {
        pump();
      }
    },
    clear() {
      cancel?.();
      cancel = null;
      waiting.length = 0;
      lastRelease = null;
    },
    flush() {
      cancel?.();
      cancel = null;
      for (const item of waiting.splice(0)) {
        lastRelease = now();
        onRelease(item.kind, item.payload);
      }
    },
  };
}
