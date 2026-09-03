import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveChunkHeading } from "./heading";
import type { RetrievedChunk } from "./retrieve";

function chunk(overrides: {
  content?: string;
  article?: string | null;
  lid?: string | null;
  sourceRef?: string | null;
}): RetrievedChunk {
  return {
    chunkId: "00000000-0000-4000-8000-000000000001",
    ordinal: 0,
    content: overrides.content ?? "",
    score: 0.9,
    source: {
      documentId: "00000000-0000-4000-8000-000000000002",
      title: "CAO Metalektro 2026",
      sourceUri: "https://example.test/cao.pdf",
      fund: "metalektro",
      agentKey: "cao",
      schemaName: "fund_metalektro",
      version: "2026",
    },
    structure: {
      chapter: null,
      article: overrides.article ?? null,
      lid: overrides.lid ?? null,
      sourceRef: overrides.sourceRef ?? null,
      chunkType: "text",
    },
    metadata: {},
  };
}

describe("deriveChunkHeading", () => {
  it("returns article, lid, and title from structure + content", () => {
    const label = deriveChunkHeading(
      chunk({
        article: "27",
        lid: "1",
        content: "Artikel 27 — Vakantie\nDe werknemer heeft recht op vakantie.",
      }),
    );
    assert.equal(label, "Artikel 27, lid 1 — Vakantie");
  });

  it("falls back to a leading heading regex in chunk text", () => {
    const label = deriveChunkHeading(
      chunk({
        content: "Hoofdstuk 4 — Fysieke belasting\nZware werkzaamheden zijn beperkt.",
      }),
    );
    assert.equal(label, "Hoofdstuk 4 — Fysieke belasting");
  });

  it("falls back to sourceRef when structure and regex yield nothing", () => {
    const label = deriveChunkHeading(
      chunk({
        content: "Algemene bepalingen over verlof.",
        sourceRef: "Artikel 12",
      }),
    );
    assert.equal(label, "Artikel 12");
  });

  it("returns null when no heading can be derived", () => {
    const label = deriveChunkHeading(
      chunk({
        content: "Algemene bepalingen zonder anker.",
        sourceRef: null,
      }),
    );
    assert.equal(label, null);
  });
});
