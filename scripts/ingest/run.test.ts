import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCorpusFile, isPruneCandidate } from "./run.js";

describe("corpus file selection", () => {
  it("accepts the supported corpus formats", () => {
    assert.equal(isCorpusFile("cao-fictief.md"), true);
    assert.equal(isCorpusFile("sample-cao.txt"), true);
    assert.equal(isCorpusFile("cao_elektronische_detailhandel.pdf"), true);
  });

  it("rejects documentation that happens to sit in a corpus directory", () => {
    // A README ingested as corpus becomes retrievable chunks the agent can cite as if they were CAO
    // text (found in demo-corpus on 2026-07-30).
    assert.equal(isCorpusFile("README.md"), false);
    assert.equal(isCorpusFile("readme.md"), false);
    assert.equal(isCorpusFile("Readme.txt"), false);
  });

  it("does not reject a corpus file that merely starts with the same letters", () => {
    assert.equal(isCorpusFile("readmission-policy.md"), true);
  });

  it("rejects unsupported extensions", () => {
    assert.equal(isCorpusFile("notes.docx"), false);
    assert.equal(isCorpusFile(".gitkeep"), false);
  });
});

describe("prune scopes by fund and agent_key", () => {
  it("prune (etd, arbo) does not touch (etd, cao) rows", () => {
    const caoDoc = { fund: "etd", agentKey: "cao", sourceUri: "etd/cao.pdf" };
    const kept = new Set(["etd/arbo.pdf"]);
    assert.equal(isPruneCandidate(caoDoc, "etd", "arbo", kept), false);
  });

  it("prune (etd, arbo) removes stale arbo rows not in the input set", () => {
    const staleArbo = { fund: "etd", agentKey: "arbo", sourceUri: "etd/old-arbo.pdf" };
    const kept = new Set(["etd/arbo.pdf"]);
    assert.equal(isPruneCandidate(staleArbo, "etd", "arbo", kept), true);
  });
});
