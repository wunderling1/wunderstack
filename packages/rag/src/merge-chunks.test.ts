import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeRetrievedChunks } from "./merge-chunks.js";
import type { RetrievedChunk } from "./retrieve.js";

function chunk(id: string, score: number): RetrievedChunk {
  return {
    chunkId: id,
    ordinal: 0,
    content: `content-${id}`,
    score,
    source: { documentId: "doc", title: "CAO", sourceUri: "", fund: "eval", version: "1" },
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
