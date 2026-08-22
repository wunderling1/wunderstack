import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RetrievedChunk } from "./retrieve.js";
import { rerank } from "./rerank.js";

function makeChunk(id: string, score: number): RetrievedChunk {
  return {
    chunkId: id,
    ordinal: 0,
    content: `content ${id}`,
    score,
    source: {
      documentId: "",
      title: "test",
      sourceUri: "",
      fund: "test",
      agentKey: "cao",
      schemaName: "fund_test",
      version: "1",
    },
    structure: {
      chapter: null,
      article: null,
      lid: null,
      sourceRef: null,
      chunkType: "text",
    },
    metadata: {},
  };
}

describe("rerank status metadata", () => {
  it("skips with reason empty when there are no chunks", async () => {
    const result = await rerank({ query: "vakantiedagen", chunks: [] });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "empty");
    assert.equal(result.skipped, true);
  });

  it("skips with reason single-candidate when only one chunk", async () => {
    const result = await rerank({ query: "vakantiedagen", chunks: [makeChunk("a", 0.5)] });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "single-candidate");
    assert.equal(result.skipped, true);
    assert.deepEqual(result.chunks.map((c) => c.chunkId), ["a"]);
  });

  it("skips with reason high-confidence when top score meets skipAboveScore", async () => {
    const result = await rerank({
      query: "vakantiedagen",
      chunks: [makeChunk("a", 0.9), makeChunk("b", 0.4)],
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "high-confidence");
    assert.equal(result.skipped, true);
  });

  it("reports failed when the rerank API is unavailable (no silent swallow)", async () => {
    const result = await rerank({
      query: "vakantiedagen",
      chunks: [makeChunk("a", 0.4), makeChunk("b", 0.3)],
    });
    assert.equal(result.status, "failed");
    assert.ok(result.reason && result.reason.length > 0);
    assert.equal(result.skipped, false);
    // Fallback preserves retrieval order.
    assert.deepEqual(result.chunks.map((c) => c.chunkId), ["a", "b"]);
  });
});
