"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProgressQueue,
  type ProgressGaps,
  type ProgressItemKind,
  type ProgressQueue,
} from "./progress-queue";
import type { AnswerTraceItem } from "./answer-trace";

/**
 * Releases an append-only trace at the queue's pace, so a batch of retrieval hits arriving in one
 * frame is spread instead of flashing past. Returns the prefix that may be shown.
 *
 * Pacing is deliberately NOT tied to `prefers-reduced-motion`: the gaps govern how fast
 * information appears, not whether something animates. The motion in this component is the sheen,
 * and that is a token (`--motion-sheen`), handled by the reduced-motion block in semantic.css.
 */
export function usePacedTrace(
  items: readonly AnswerTraceItem[],
  gaps?: Partial<ProgressGaps>,
): AnswerTraceItem[] {
  const [releasedCount, setReleasedCount] = useState(0);
  const queueRef = useRef<ProgressQueue<number> | null>(null);
  const enqueuedRef = useRef(0);

  useEffect(() => {
    const queue = createProgressQueue<number>({
      onRelease: (_kind, index) => setReleasedCount((count) => Math.max(count, index + 1)),
      now: () => performance.now(),
      schedule: (ms, fn) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
      ...(gaps ? { gaps } : {}),
    });
    queueRef.current = queue;
    return () => {
      queue.clear();
      queueRef.current = null;
    };
  }, [gaps?.chip, gaps?.step, gaps?.done]);

  useEffect(() => {
    const queue = queueRef.current;
    if (queue === null) {
      return;
    }
    // A shorter list means a new turn reused this hook: start the trace over.
    if (items.length < enqueuedRef.current) {
      queue.clear();
      enqueuedRef.current = 0;
      setReleasedCount(0);
    }
    for (let index = enqueuedRef.current; index < items.length; index += 1) {
      const item = items[index];
      if (item !== undefined) {
        queue.enqueue(paceKind(item), index);
      }
    }
    enqueuedRef.current = items.length;
  }, [items]);

  return useMemo(() => items.slice(0, releasedCount), [items, releasedCount]);
}

/** Overflow sits in the chip row, so it uses the chip gap rather than opening a new step beat. */
function paceKind(item: AnswerTraceItem): ProgressItemKind {
  return item.kind === "overflow" ? "chip" : item.kind;
}
