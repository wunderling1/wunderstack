import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chatEventSchema } from "./chat";

describe("chatEventSchema — retrieval", () => {
  it("rejects a retrieval event without corpus.version", () => {
    const parsed = chatEventSchema.safeParse({
      type: "retrieval",
      corpus: { label: "CAO Motor" },
      query: "vakantie",
      considered: 3,
      aboveThreshold: 1,
      hits: [{ label: "Artikel 27", dropped: false }],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a retrieval event without query", () => {
    const parsed = chatEventSchema.safeParse({
      type: "retrieval",
      corpus: { label: "CAO Motor", version: "2025-2026" },
      considered: 3,
      aboveThreshold: 1,
      hits: [{ label: "Artikel 27", dropped: false }],
    });
    assert.equal(parsed.success, false);
  });

  it("accepts a complete retrieval event and caps hits at six in the schema", () => {
    const parsed = chatEventSchema.safeParse({
      type: "retrieval",
      corpus: { label: "CAO Motor", version: "2025-2026" },
      query: "hoeveel vakantiedagen",
      considered: 14,
      aboveThreshold: 3,
      hits: [
        { label: "Artikel 27", dropped: false },
        { label: "Artikel 12", dropped: true },
      ],
    });
    assert.equal(parsed.success, true);

    const tooMany = chatEventSchema.safeParse({
      type: "retrieval",
      corpus: { label: "CAO Motor", version: "2025-2026" },
      query: "hoeveel vakantiedagen",
      considered: 14,
      aboveThreshold: 3,
      hits: Array.from({ length: 7 }, (_, index) => ({
        label: `Artikel ${String(index)}`,
        dropped: false,
      })),
    });
    assert.equal(tooMany.success, false);
  });
});
