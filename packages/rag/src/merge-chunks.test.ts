import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consideredChunkCount, excludeKeptChunks, mergeRetrievedChunks } from "./merge-chunks";
import type { RetrievedChunk } from "./retrieve";

function chunk(id: string, score: number): RetrievedChunk {
  return {
    chunkId: id,
    ordinal: 0,
    content: `content-${id}`,
    score,
    source: { documentId: "doc", title: "CAO", sourceUri: "", fund: "eval", agentKey: "cao", schemaName: "fund_eval", version: "1" },
    structure: { chapter: null, article: null, lid: null, sourceRef: null, chunkType: "text" },
    metadata: {},
  };
}

describe("mergeRetrievedChunks", () => {
  it("keeps the highest score per chunk id", () => {
    const merged = mergeRetrievedChunks([
      [chunk("a", 0.7), chunk("b", 0.4)],
      [chunk("a", 0.9), chunk("c", 0.2)],
    ]);
    assert.deepEqual(
      merged.map((entry) => [entry.chunkId, entry.score]),
      [
        ["a", 0.9],
        ["b", 0.4],
        ["c", 0.2],
      ],
    );
  });
});

describe("consideredChunkCount", () => {
  it("counts unique chunk ids across queries (kept + dropped), not a per-query sum", () => {
    assert.equal(
      consideredChunkCount([
        { chunks: [chunk("a", 0.9), chunk("b", 0.5)], droppedChunks: [chunk("c", 0.1)] },
        { chunks: [chunk("a", 0.8)], droppedChunks: [chunk("d", 0.05)] },
      ]),
      4,
    );
    assert.equal(
      consideredChunkCount([
        { chunks: [chunk("a", 0.9)], droppedChunks: [chunk("b", 0.1)] },
        { chunks: [chunk("a", 0.7), chunk("b", 0.2)], droppedChunks: [chunk("c", 0.05)] },
      ]),
      3,
    );
  });
});

describe("excludeKeptChunks", () => {
  it("removes a chunk that cleared the floor from the dropped list", () => {
    const kept = [chunk("a", 0.9), chunk("b", 0.6)];
    const dropped = [chunk("a", 0.3), chunk("c", 0.2)];
    assert.deepEqual(
      excludeKeptChunks(dropped, kept).map((entry) => entry.chunkId),
      ["c"],
    );
  });

  it("returns the dropped list unchanged when there is no overlap", () => {
    const kept = [chunk("a", 0.9)];
    const dropped = [chunk("b", 0.2), chunk("c", 0.1)];
    assert.deepEqual(
      excludeKeptChunks(dropped, kept).map((entry) => entry.chunkId),
      ["b", "c"],
    );
  });
});
