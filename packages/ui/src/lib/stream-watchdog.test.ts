import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createStreamWatchdog } from "./stream-watchdog.ts";

/**
 * Fake clock + tick scheduler. `advance` moves the clock and runs the ticks that the page would
 * have run in that span; `suspend` moves the clock without running any of them — that is a frozen
 * tab, a sleeping machine, or a throttled background wake-up that never came.
 */
function harness(options: { timeoutMs: number; tickMs: number }) {
  let clock = 0;
  let hidden = false;
  let tickFn: (() => void) | null = null;
  const listeners: (() => void)[] = [];
  let timedOut = false;

  const watchdog = createStreamWatchdog({
    timeoutMs: options.timeoutMs,
    tickMs: options.tickMs,
    onTimeout: () => {
      timedOut = true;
    },
    now: () => clock,
    scheduleTick: (_ms, fn) => {
      tickFn = fn;
      return () => {
        tickFn = null;
      };
    },
    isHidden: () => hidden,
    onVisibilityChange: (listener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
  });

  return {
    watchdog,
    timedOut: () => timedOut,
    advance(ms: number) {
      const until = clock + ms;
      while (clock < until) {
        clock = Math.min(clock + options.tickMs, until);
        tickFn?.();
      }
    },
    /** Wall clock jumps; no tick runs. The page was not scheduled at all. */
    suspend(ms: number) {
      clock += ms;
    },
    setHidden(value: boolean) {
      hidden = value;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
}

describe("stream watchdog", () => {
  it("fires when a visible, awake page sees no byte for the whole budget", () => {
    const h = harness({ timeoutMs: 30_000, tickMs: 1_000 });
    h.advance(29_000);
    assert.equal(h.timedOut(), false);
    h.advance(2_000);
    assert.equal(h.timedOut(), true);
  });

  it("does not fire while bytes keep arriving", () => {
    const h = harness({ timeoutMs: 30_000, tickMs: 1_000 });
    for (let i = 0; i < 10; i += 1) {
      h.advance(10_000);
      h.watchdog.signal();
    }
    assert.equal(h.timedOut(), false);
  });

  it("does not count time spent hidden", () => {
    const h = harness({ timeoutMs: 30_000, tickMs: 1_000 });
    h.setHidden(true);
    h.advance(120_000);
    assert.equal(h.timedOut(), false);
    h.setHidden(false);
    h.advance(29_000);
    assert.equal(h.timedOut(), false, "the budget restarts when the tab comes back");
  });

  it("treats a suspended page as a wake-up, not as a dead stream", () => {
    const h = harness({ timeoutMs: 30_000, tickMs: 1_000 });
    // Frozen/asleep: the wall clock ran far past the budget while no tick was scheduled.
    h.suspend(600_000);
    h.advance(1_000);
    assert.equal(h.timedOut(), false);
    // …and a stream that stays silent after the wake-up is still caught.
    h.advance(31_000);
    assert.equal(h.timedOut(), true);
  });

  it("stops firing once stopped", () => {
    const h = harness({ timeoutMs: 30_000, tickMs: 1_000 });
    h.watchdog.stop();
    h.advance(120_000);
    assert.equal(h.timedOut(), false);
  });
});
