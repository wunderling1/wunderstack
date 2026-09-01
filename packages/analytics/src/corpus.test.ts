import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { corpusFingerprint, CORPUS_FINGERPRINT_LENGTH, type CorpusDocRow } from "./corpus.js";

function doc(overrides: Partial<CorpusDocRow> = {}): CorpusDocRow {
  return {
    title: "CAO 2026",
    sourceUri: "s3://corpus/cao-2026.pdf",
    fund: "oomt",
    agentKey: "cao",
    version: "cao-2026.08",
    contentHash: "sha-1111",
    ingestedAt: new Date("2026-08-01T10:00:00Z"),
    chunkCount: 12,
    ...overrides,
  };
}

describe("corpusFingerprint (A5)", () => {
  it("is null for an empty corpus: nothing to approve is not a value", () => {
    assert.equal(corpusFingerprint([]), null);
  });

  it("does not depend on the order rows come back in", () => {
    const a = doc();
    const b = doc({ sourceUri: "s3://corpus/bijlage.pdf", contentHash: "sha-2222" });
    assert.equal(corpusFingerprint([a, b]), corpusFingerprint([b, a]));
  });

  it("ignores what the corpus does not consist of", () => {
    const base = doc();
    const restated = doc({
      title: "CAO 2026 (herzien)",
      ingestedAt: new Date("2026-08-30T10:00:00Z"),
      chunkCount: 40,
    });
    assert.equal(corpusFingerprint([base]), corpusFingerprint([restated]));
  });

  it("moves on a new version, on changed content, and on an added document", () => {
    const base = corpusFingerprint([doc()]);
    assert.notEqual(base, corpusFingerprint([doc({ version: "cao-2026.09" })]));
    assert.notEqual(base, corpusFingerprint([doc({ contentHash: "sha-9999" })]));
    assert.notEqual(
      base,
      corpusFingerprint([doc(), doc({ sourceUri: "s3://corpus/bijlage.pdf" })]),
    );
  });

  it("is a short hex value, not a document version", () => {
    const value = corpusFingerprint([doc()]);
    assert.equal(value?.length, CORPUS_FINGERPRINT_LENGTH);
    assert.match(String(value), /^[0-9a-f]+$/);
  });
});
