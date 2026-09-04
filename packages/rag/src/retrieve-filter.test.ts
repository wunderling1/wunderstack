import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { partitionByMinScore } from "./retrieve";
import type { RetrievedChunk } from "./retrieve";

function hit(chunkId: string, score: number): RetrievedChunk {
  return {
    chunkId,
    ordinal: 0,
    content: "content",
    score,
    source: {
      documentId: "doc",
      title: "CAO",
      sourceUri: "https://example.test/cao.pdf",
      fund: "oomt",
      agentKey: "cao",
      schemaName: "fund_oomt",
      version: "2026",
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

describe("partitionByMinScore", () => {
  it("keeps hits at or above minScore and records the rest as dropped", () => {
    const hits = [hit("a", 0.7), hit("b", 0.4), hit("c", 0.5)];
    const { kept, dropped } = partitionByMinScore(hits, 0.5);
    assert.deepEqual(
      kept.map((chunk) => chunk.chunkId),
      ["a", "c"],
    );
    assert.deepEqual(
      dropped.map((chunk) => chunk.chunkId),
      ["b"],
    );
  });

  it("returns an empty dropped list when minScore is zero", () => {
    const hits = [hit("a", 0.1), hit("b", 0.2)];
    const { kept, dropped } = partitionByMinScore(hits, 0);
    assert.equal(kept.length, 2);
    assert.equal(dropped.length, 0);
  });
});
