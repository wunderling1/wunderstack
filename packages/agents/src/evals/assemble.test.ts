import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assemble, type RetrievalTimings } from "@wunderstack/rag";

import { assembleEvalContext } from "./judge";
import { passageToHit, type GoldenPassage } from "./golden-set";

const NO_TIMINGS: RetrievalTimings = {
  rewriteMs: 0,
  embedMs: 0,
  searchMs: 0,
  rerankMs: 0,
  totalMs: 0,
};

const articlePassage: GoldenPassage = {
  id: "a1",
  source: "CAO Voorbeeldsector — Artikel 3 (Proeftijd)",
  content: "Inhoud A.",
  article: "3",
  chunkType: "text",
};

const bijlagePassage: GoldenPassage = {
  id: "b1",
  source: "CAO Voorbeeldsector — Bijlage 1 (Salarisschalen)",
  content: "Regel 1\nRegel 2",
  article: "Bijlage 1",
  chunkType: "table",
};

describe("assembleEvalContext", () => {
  it("produces a byte-exact context string (snapshot)", () => {
    const context = assembleEvalContext([articlePassage, bijlagePassage]);
    assert.equal(
      context,
      "[1] chunk_id=a1 (Artikel 3) Inhoud A.\n\n[2] chunk_id=b1 (Bijlage 1) Regel 1\nRegel 2",
    );
  });

  it("uses the fixture id as chunk_id for citation scorers", () => {
    const context = assembleEvalContext([articlePassage]);
    assert.match(context, /chunk_id=a1/);
  });

  it("matches production assemble on the same adapted hits", () => {
    const passages = [articlePassage, bijlagePassage];
    const viaEval = assembleEvalContext(passages);
    const viaProduction = assemble(passages.map(passageToHit), NO_TIMINGS).context;
    assert.equal(viaEval, viaProduction);
  });
});

describe("passageToHit", () => {
  it("sets chunkId to the fixture id", () => {
    assert.equal(passageToHit(articlePassage).chunkId, "a1");
  });

  it("derives sourceRef as Artikel n for numeric articles", () => {
    assert.equal(passageToHit(articlePassage).structure.sourceRef, "Artikel 3");
  });

  it("derives sourceRef verbatim for bijlage articles", () => {
    assert.equal(passageToHit(bijlagePassage).structure.sourceRef, "Bijlage 1");
  });
});
