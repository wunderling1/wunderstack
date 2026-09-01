import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  corpusFingerprint,
  corpusFingerprintDisplay,
  corpusFingerprintMatchesPinned,
  type CorpusDocRow,
} from "./corpus.js";

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

  it("stores the full sha256 hex; display uses the first twelve characters", () => {
    const value = corpusFingerprint([doc()]);
    assert.equal(value?.length, 64);
    assert.match(String(value), /^[0-9a-f]{64}$/);
    assert.equal(corpusFingerprintDisplay(String(value)), value?.slice(0, 12));
  });

  it("matches legacy twelve-character pins against the full hash prefix", () => {
    const full = corpusFingerprint([doc()]);
    assert.ok(full);
    const legacy = corpusFingerprintDisplay(full);
    assert.equal(corpusFingerprintMatchesPinned(full, legacy), true);
    assert.equal(corpusFingerprintMatchesPinned(full, "deadbeef0000"), false);
  });
});
