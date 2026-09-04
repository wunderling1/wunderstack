import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRetrievalStreamEvent } from "./retrieval-stream-event";
import type { RetrievalOutput } from "./profile";

function chunk(
  chunkId: string,
  title: string,
  article: string | null,
  score: number,
): RetrievalOutput["chunks"][number] {
  return {
    chunkId,
    ordinal: 0,
    content: article ? `Artikel ${article} — Vakantie\nTekst.` : "Tekst.",
    score,
    source: {
      documentId: "doc",
      title,
      sourceUri: "https://example.test/cao.pdf",
      fund: "oomt",
      agentKey: "cao",
      schemaName: "fund_oomt",
      version: "2025-2026",
    },
    structure: {
      chapter: null,
      article,
      lid: null,
      sourceRef: article ? `Artikel ${article}` : null,
      chunkType: "text",
    },
    metadata: {},
  };
}

function articles(prefix: string, ids: string[], score: number) {
  return ids.map((article, index) => chunk(`${prefix}-${String(index)}`, "CAO Motor", article, score));
}

function baseRetrieval(overrides: Partial<RetrievalOutput>): RetrievalOutput {
  return {
    context: "",
    citations: [],
    hits: [],
    timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
    chunks: [],
    fullChunkContent: [],
    consideredCount: 0,
    aboveThresholdCount: 0,
    droppedChunks: [],
    progressFound: [],
    progressDropped: [],
    usedPassageCount: 0,
    ...overrides,
  };
}

describe("buildRetrievalStreamEvent", () => {
  it("counts unique headings, not the pgvector fetch size", () => {
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        chunks: articles("reranked", ["27", "28"], 0.9),
        droppedChunks: articles("drop", ["12", "12", "12"], 0.2),
        consideredCount: 15,
        aboveThresholdCount: 8,
        progressFound: articles("found", ["27", "27", "28", "29"], 0.8),
        progressDropped: articles("drop", ["12", "5"], 0.2),
        usedPassageCount: 2,
      }),
      "hoeveel vakantiedagen",
      "2025-2026",
    );
    assert.equal(event.considered, 5);
    assert.equal(event.aboveThreshold, 3);
    assert.equal(event.used, 2);
    assert.deepEqual(
      event.hits.map((hit) => [hit.label, hit.dropped]),
      [
        ["Artikel 27 — Vakantie", false],
        ["Artikel 28 — Vakantie", false],
        ["Artikel 29 — Vakantie", false],
        ["Artikel 12 — Vakantie", true],
        ["Artikel 5 — Vakantie", true],
      ],
    );
    assert.equal(event.corpus.label, "CAO Motor");
    assert.equal(event.corpus.version, "2025-2026");
    assert.equal(event.query, "hoeveel vakantiedagen");
  });

  it("does not double-count a heading that appears both above and below the floor", () => {
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        progressFound: articles("found", ["27"], 0.8),
        progressDropped: articles("drop", ["27", "12"], 0.2),
        usedPassageCount: 1,
      }),
      "hoeveel vakantiedagen",
    );
    assert.equal(event.considered, 2);
    assert.equal(event.aboveThreshold, 1);
    assert.deepEqual(
      event.hits.map((hit) => [hit.label, hit.dropped]),
      [
        ["Artikel 27 — Vakantie", false],
        ["Artikel 12 — Vakantie", true],
      ],
    );
  });

  it("caps unique hits at six and spends the cap on kept passages first", () => {
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        progressFound: articles("found", ["20", "21", "22", "23", "24"], 0.8),
        progressDropped: articles("drop", ["1", "2", "3", "4"], 0.2),
        usedPassageCount: 4,
      }),
      "hoeveel vakantiedagen",
      "2025-2026",
    );
    assert.equal(event.hits.length, 6);
    assert.equal(event.considered, 9);
    assert.equal(event.aboveThreshold, 5);
    assert.deepEqual(
      event.hits.map((hit) => hit.dropped),
      [false, false, false, false, false, true],
    );
  });

  it("falls back to unique ranked chunks when progress lists are empty", () => {
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        chunks: articles("kept", ["27", "27", "28"], 0.8),
        droppedChunks: articles("drop", ["12", "12"], 0.3),
        usedPassageCount: 2,
      }),
      "hoeveel vakantiedagen",
    );
    assert.equal(event.considered, 3);
    assert.equal(event.aboveThreshold, 2);
    assert.equal(event.used, 2);
    assert.equal(event.hits.length, 3);
  });

  it("names no corpus it cannot measure when retrieval came back empty", () => {
    // The UI reads this as "In de … gezocht", so the fallback has to fit that sentence.
    const event = buildRetrievalStreamEvent(baseRetrieval({}), "hoeveel vakantiedagen");
    assert.equal(event.corpus.label, "bronnen");
    assert.equal(event.considered, 0);
  });

  it("uses deriveChunkHeading for hit labels", () => {
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        chunks: [chunk("a", "CAO Motor", "27", 0.9)],
        usedPassageCount: 1,
      }),
      "hoeveel vakantiedagen",
    );
    assert.equal(event.hits[0]?.label, "Artikel 27 — Vakantie");
  });
});
