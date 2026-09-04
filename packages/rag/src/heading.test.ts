import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveChunkHeading,
  passageLabel,
  uniqueByPassageLabel,
  uniquePassageWindow,
} from "./heading";
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

describe("uniqueByPassageLabel", () => {
  it("keeps the first chunk per heading and falls back to the document title for display", () => {
    const first = chunk({ article: "27", content: "Artikel 27 — Vakantie\nA." });
    const duplicate = chunk({ article: "27", content: "Artikel 27 — Vakantie\nB." });
    const untitled = chunk({ content: "Algemene bepalingen zonder anker.", sourceRef: null });
    const unique = uniqueByPassageLabel([first, duplicate, untitled]);
    assert.equal(unique.length, 2);
    assert.equal(unique[0], first);
    assert.equal(passageLabel(untitled), "CAO Metalektro 2026");
    assert.equal(unique[1], untitled);
  });

  it("keeps two untitled chunks with different ids instead of collapsing on the document title", () => {
    const a = {
      ...chunk({ content: "Fragment A zonder anker.", sourceRef: null }),
      chunkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const b = {
      ...chunk({ content: "Fragment B zonder anker.", sourceRef: null }),
      chunkId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const unique = uniqueByPassageLabel([a, b]);
    assert.equal(unique.length, 2);
    assert.equal(passageLabel(a), "CAO Metalektro 2026");
    assert.equal(passageLabel(b), "CAO Metalektro 2026");
  });
});

describe("uniquePassageWindow", () => {
  it("does not count a below-threshold heading that already cleared the floor", () => {
    const kept = chunk({ article: "27", content: "Artikel 27 — Vakantie\nA." });
    const otherKept = chunk({ article: "28", content: "Artikel 28 — Verlof\nB." });
    const droppedSame = chunk({ article: "27", content: "Artikel 27 — Vakantie\nC." });
    const droppedOther = chunk({ article: "12", content: "Artikel 12 — Loon\nD." });
    const window = uniquePassageWindow([kept, otherKept, kept], [droppedSame, droppedOther, droppedOther]);
    assert.deepEqual(
      window.found.map((item) => passageLabel(item)),
      ["Artikel 27 — Vakantie", "Artikel 28 — Verlof"],
    );
    assert.deepEqual(
      window.dropped.map((item) => passageLabel(item)),
      ["Artikel 12 — Loon"],
    );
  });
});
