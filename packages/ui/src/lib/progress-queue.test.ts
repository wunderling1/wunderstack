/**
 * The pacing contract from the mockup: release at `max(arrival, lastRelease + gap)`.
 * A fake clock keeps this deterministic — no real timers, no sleeps.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createProgressQueue,
  instantProgressGaps,
  type ProgressItemKind,
} from "./progress-queue.ts";

function fakeClock() {
  let time = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    schedule(ms: number, fn: () => void) {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return () => void timers.delete(id);
    },
    advance(ms: number) {
      const target = time + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) {
          break;
        }
        timers.delete(due[0]);
        time = due[1].at;
        due[1].fn();
      }
      time = target;
    },
  };
}

function harness(gaps?: Partial<Record<ProgressItemKind, number>>) {
  const clock = fakeClock();
  const released: { kind: ProgressItemKind; payload: string; at: number }[] = [];
  const queue = createProgressQueue<string>({
    onRelease: (kind, payload) => released.push({ kind, payload, at: clock.now() }),
    now: clock.now,
    schedule: clock.schedule,
    ...(gaps ? { gaps } : {}),
  });
  return { clock, released, queue };
}

describe("createProgressQueue — pacing", () => {
  it("releases the first item on arrival, without an opening delay", () => {
    const { released, queue } = harness();
    queue.enqueue("step", "searching");
    assert.deepEqual(
      released.map((r) => [r.payload, r.at]),
      [["searching", 0]],
    );
  });

  it("spreads a burst of steps by the step gap", () => {
    const { clock, released, queue } = harness();
    queue.enqueue("step", "a");
    queue.enqueue("step", "b");
    queue.enqueue("step", "c");
    clock.advance(2000);
    assert.deepEqual(
      released.map((r) => [r.payload, r.at]),
      [
        ["a", 0],
        ["b", 650],
        ["c", 1300],
      ],
    );
  });

  it("lets a slow stream through untouched", () => {
    const { clock, released, queue } = harness();
    queue.enqueue("step", "a");
    clock.advance(3000);
    queue.enqueue("step", "b");
    assert.deepEqual(
      released.map((r) => [r.payload, r.at]),
      [
        ["a", 0],
        ["b", 3000],
      ],
    );
  });

  it("uses the chip gap for chips and the done gap before the terminal item", () => {
    const { clock, released, queue } = harness();
    queue.enqueue("chip", "art. 31");
    queue.enqueue("chip", "bijlage 3");
    queue.enqueue("done", "2 geverifieerde citaten");
    clock.advance(3000);
    assert.deepEqual(
      released.map((r) => r.at),
      [0, 450, 1000],
    );
  });

  it("keeps arrival order across kinds", () => {
    const { clock, released, queue } = harness();
    queue.enqueue("step", "rank");
    queue.enqueue("chip", "art. 31");
    queue.enqueue("step", "write");
    clock.advance(5000);
    assert.deepEqual(
      released.map((r) => r.payload),
      ["rank", "art. 31", "write"],
    );
  });

  it("drops pending items on clear", () => {
    const { clock, released, queue } = harness();
    queue.enqueue("step", "a");
    queue.enqueue("step", "b");
    queue.clear();
    clock.advance(5000);
    assert.deepEqual(
      released.map((r) => r.payload),
      ["a"],
    );
  });

  it("releases everything at once when the gaps are zero (reduced motion)", () => {
    const { released, queue } = harness(instantProgressGaps);
    queue.enqueue("step", "a");
    queue.enqueue("chip", "b");
    queue.enqueue("done", "c");
    assert.deepEqual(
      released.map((r) => r.at),
      [0, 0, 0],
    );
  });

  it("flush shows what is still waiting, in order", () => {
    const { released, queue } = harness();
    queue.enqueue("step", "a");
    queue.enqueue("step", "b");
    queue.enqueue("step", "c");
    queue.flush();
    assert.deepEqual(
      released.map((r) => r.payload),
      ["a", "b", "c"],
    );
  });
});
