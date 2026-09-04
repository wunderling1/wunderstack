import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chatEventSchema, citationSchema } from "@wunderstack/shared/browser";

import { chatEventSchema as embedChatEventSchema, embedCitationSchema } from "./types";

/**
 * F1-10: embed keeps a local Zod mirror (cannot import the env-parsing shared barrel). This test
 * imports `@wunderstack/shared/browser` only — same shapes, no process.env fork.
 */
describe("embed contract parity with @wunderstack/shared/browser (F1-10)", () => {
  it("keeps the same NDJSON discriminators including retrieval", () => {
    const sharedTypes = chatEventSchema.options
      .map((option) => option.shape.type.value)
      .sort();
    const embedTypes = embedChatEventSchema.options
      .map((option) => option.shape.type.value)
      .sort();
    assert.deepEqual(embedTypes, [
      "citations",
      "done",
      "error",
      "followups",
      "retrieval",
      "status",
      "text",
    ]);
    assert.deepEqual(embedTypes, sharedTypes);
  });

  it("keeps embed citation field names as a subset of shared citationSchema", () => {
    const sharedKeys = new Set(Object.keys(citationSchema.shape));
    const embedKeys = Object.keys(embedCitationSchema.shape).sort();
    for (const key of embedKeys) {
      assert.ok(
        sharedKeys.has(key),
        `embed citation key ${JSON.stringify(key)} is not on shared citationSchema`,
      );
    }
    assert.ok(embedKeys.includes("ref"));
    assert.ok(embedKeys.includes("quote"));
    assert.ok(embedKeys.includes("snippet"));
  });
});
