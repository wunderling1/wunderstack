/**
 * H1 add-test: a new corpus is discovered from fixture + profile alone — no engine edits.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { FUND_SET_PROFILE_SUBDIR, loadFundSetsFrom } from "./golden-set.js";

describe("h1-corpus-add-touches-no-engine", () => {
  it("discovers a probe set from fixture + profile in a temp dir without touching gate code", () => {
    const dir = mkdtempSync(join(tmpdir(), "h1-probe-"));
    mkdirSync(join(dir, FUND_SET_PROFILE_SUBDIR), { recursive: true });
    writeFileSync(
      join(dir, "golden-set.probe-corpus.jsonl"),
      [
        '{"id":"probe-001","question":"Wat geldt voor veiligheid?","expectedPassageIds":[],"referenceAnswer":"Zie hoofdstuk 1.","category":"in_scope","expectedChapter":"1"}',
      ].join("\n") + "\n",
      "utf8",
    );
    writeFileSync(
      join(dir, FUND_SET_PROFILE_SUBDIR, "probe-corpus.json"),
      JSON.stringify({
        key: "probe-corpus",
        fund: "probe-fund",
        agentKey: "arbo",
        corpusVersion: "probe-1",
        contentStatus: "starter",
        ingest: { source: "probe-source", version: "1", prune: true },
      }),
      "utf8",
    );

    const sets = loadFundSetsFrom(dir);
    assert.equal(sets.length, 1);
    assert.equal(sets[0]?.key, "probe-corpus");
    assert.equal(sets[0]?.fund, "probe-fund");
    assert.equal(sets[0]?.agentKey, "arbo");
    assert.equal(sets[0]?.ingest?.source, "probe-source");
  });
});
