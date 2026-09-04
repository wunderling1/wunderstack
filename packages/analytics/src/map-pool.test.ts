import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapPool } from "./map-pool";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("mapPool", () => {
  it("returns an empty array without calling the mapper", async () => {
    let calls = 0;
    const result = await mapPool([], 3, async () => {
      calls += 1;
      return 0;
    });
    assert.deepEqual(result, []);
    assert.equal(calls, 0);
  });

  it("preserves input order when tasks finish out of order", async () => {
    const result = await mapPool([30, 10, 20], 3, async (ms) => {
      await delay(ms);
      return ms;
    });
    assert.deepEqual(result, [30, 10, 20]);
  });

  it("does not exceed the concurrency cap", async () => {
    let inflight = 0;
    let peak = 0;
    await mapPool([1, 2, 3, 4, 5], 2, async (value) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await delay(20);
      inflight -= 1;
      return value;
    });
    assert.equal(peak, 2);
  });
});
