import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RetrievedChunk } from "@wunderstack/rag";

import { buildVerifiedCitations } from "./build-citations.js";
import type { VerifiedCitation } from "./verify-citations.js";

function chunk(chunkId: string, content: string): RetrievedChunk {
  return {
    chunkId,
    ordinal: 0,
    content,
    score: 1,
    source: {
      documentId: "doc-1",
      title: "CAO Voorbeeldsector",
      sourceUri: "https://example.test/cao.pdf",
      fund: "voorbeeld",
      agentKey: "cao",
      schemaName: "fund_voorbeeld",
      version: "2026",
    },
    structure: {
      chapter: null,
      article: "12",
      lid: null,
      sourceRef: null,
      chunkType: "text",
    },
    metadata: {},
  };
}

function verified(marker: number, chunkId: string, quote: string): VerifiedCitation {
  return { marker, chunkId, quote, verified: true };
}

describe("buildVerifiedCitations", () => {
  it("keeps one citation per marker when a marker is emitted more than once", () => {
    const chunks = [chunk("chunk-a", "Vakantie: de eerste passage. En de tweede passage.")];
    const citations = buildVerifiedCitations(
      [
        verified(1, "chunk-a", "de eerste passage"),
        verified(1, "chunk-a", "de tweede passage"),
      ],
      chunks,
    );

    assert.equal(citations.length, 1);
    assert.equal(citations[0]?.ref, 1);
    assert.equal(citations[0]?.quote, "de eerste passage");
  });

  it("produces unique ref/chunkId keys across markers", () => {
    const chunks = [chunk("chunk-a", "Passage A."), chunk("chunk-b", "Passage B.")];
    const citations = buildVerifiedCitations(
      [
        verified(2, "chunk-b", "Passage B."),
        verified(1, "chunk-a", "Passage A."),
        verified(1, "chunk-a", "Passage A."),
      ],
      chunks,
    );

    const keys = citations.map((c) => `${String(c.ref)}-${c.chunkId}`);
    assert.deepEqual(keys, ["1-chunk-a", "2-chunk-b"]);
    assert.equal(new Set(keys).size, keys.length);
  });
});
