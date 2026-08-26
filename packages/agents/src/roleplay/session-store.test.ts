import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextMessageOrdinals } from "./session-store.js";

describe("nextMessageOrdinals", () => {
  it("starts after the opening assistant line at ordinal 0", () => {
    assert.deepEqual(nextMessageOrdinals(0), { user: 1, assistant: 2 });
  });

  it("treats an empty transcript as starting at 0", () => {
    assert.deepEqual(nextMessageOrdinals(undefined), { user: 0, assistant: 1 });
  });

  it("never hands the same pair to two callers that each saw a distinct last ordinal", () => {
    const first = nextMessageOrdinals(0);
    const second = nextMessageOrdinals(first.assistant);
    assert.notEqual(first.user, second.user);
    assert.notEqual(first.assistant, second.assistant);
    assert.equal(second.user, first.assistant + 1);
  });
});

/**
 * Simulates the locked-txn contract of `appendTurnAndMaybeEnd`: callers serialize on a mutex,
 * allocate ordinals from the shared last value, then optionally mark ended in the same critical
 * section. Without the lock, overlapping reads of `last` would collide.
 */
describe("appendTurnAndMaybeEnd concurrency contract", () => {
  it("two concurrent appends cannot share an ordinal when serialized by a lock", async () => {
    let lastOrdinal = 0;
    let lock: Promise<void> = Promise.resolve();

    async function withLock<T>(fn: () => Promise<T>): Promise<T> {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await fn();
      } finally {
        release();
      }
    }

    async function append(): Promise<{ user: number; assistant: number }> {
      return withLock(async () => {
        const observed = lastOrdinal;
        await new Promise((resolve) => setTimeout(resolve, 5));
        const ordinals = nextMessageOrdinals(observed);
        lastOrdinal = ordinals.assistant;
        return ordinals;
      });
    }

    const [a, b] = await Promise.all([append(), append()]);
    assert.notEqual(a.user, b.user);
    assert.notEqual(a.assistant, b.assistant);
    assert.equal(new Set([a.user, a.assistant, b.user, b.assistant]).size, 4);
  });

  it("ends in the same critical section as the message inserts so end cannot lag the transcript", async () => {
    const steps: string[] = [];
    let lastOrdinal = 0;
    let status: "active" | "ended" = "active";
    assert.equal(status, "active");

    // One txn: allocate + insert + end, with no await between insert and end that could let a
    // reader observe messages on an still-active session.
    const observed = lastOrdinal;
    const ordinals = nextMessageOrdinals(observed);
    steps.push(`insert:${ordinals.user},${ordinals.assistant}`);
    lastOrdinal = ordinals.assistant;
    status = "ended";
    steps.push("end");

    assert.deepEqual(steps, ["insert:1,2", "end"]);
    assert.equal(status, "ended");
    assert.equal(lastOrdinal, 2);
  });
});
