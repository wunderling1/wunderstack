import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("migrate-fund-schemas.ts", () => {
  const source = readFileSync(join(here, "migrate-fund-schemas.ts"), "utf8");

  it("iterates funds sequentially and does not wrap N schemas in one transaction", () => {
    assert.match(source, /for \(const fund of funds\)/);
    assert.match(source, /failures/);
    assert.doesNotMatch(source, /transaction\(async[\s\S]*for \(const fund of funds\)/);
  });

  it("does not emit CREATE ROLE, HNSW, or PARTITION", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /CREATE ROLE/);
    assert.doesNotMatch(code, /\bhnsw\b/i);
    assert.doesNotMatch(code, /PARTITION BY/);
  });

  it("applies fund migration 0003_turn_outcome for turn-outcome columns", () => {
    assert.match(source, /FUND_MIGRATION_TURN_OUTCOME/);
    assert.match(source, /turnOutcomeAlterSql/);
  });
});
