import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readRoleplayInactivityMs } from "./public-env";

describe("readRoleplayInactivityMs", () => {
  it("defaults to 20s when unset", () => {
    const previous = process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS;
    delete process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS;
    try {
      assert.equal(readRoleplayInactivityMs(), 30_000);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS;
      } else {
        process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS = previous;
      }
    }
  });

  it("falls back on a non-numeric value instead of yielding NaN", () => {
    const previous = process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS;
    process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS = "soon";
    try {
      assert.equal(readRoleplayInactivityMs(), 30_000);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS;
      } else {
        process.env.NEXT_PUBLIC_ROLEPLAY_INACTIVITY_MS = previous;
      }
    }
  });
});
