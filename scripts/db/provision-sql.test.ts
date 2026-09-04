import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addChunksFkSql,
  addFundCheckSql,
  copyChunksSql,
  copyDocumentsSql,
  createChunksLikeSql,
  createDocumentsLikeSql,
  createEventsLikeSql,
  createSchemaSql,
  truncateFundTablesSql,
} from "./provision-sql";

const ALL_SQL = [
  createSchemaSql("fund_elektronische-detailhandel"),
  createDocumentsLikeSql("fund_oomt"),
  createChunksLikeSql("fund_oomt"),
  createEventsLikeSql("fund_oomt"),
  ...addFundCheckSql("fund_oomt", "oomt"),
  ...addChunksFkSql("fund_oomt"),
  truncateFundTablesSql("fund_oomt"),
  copyDocumentsSql("fund_oomt", "oomt"),
  copyChunksSql("fund_oomt", "oomt"),
].join("\n");

describe("provision-sql (track B)", () => {
  it("creates a quoted schema and copies table shape from public", () => {
    assert.match(createSchemaSql("fund_elektronische-detailhandel"), /CREATE SCHEMA IF NOT EXISTS "fund_elektronische-detailhandel"/);
    assert.match(createDocumentsLikeSql("fund_oomt"), /LIKE public\.documents INCLUDING ALL/);
    assert.match(createChunksLikeSql("fund_oomt"), /LIKE public\.chunks/);
    assert.doesNotMatch(createChunksLikeSql("fund_oomt"), /INCLUDING CONSTRAINTS/);
  });

  it("adds a fund-key CHECK tripwire, not a schema-prefix check", () => {
    const [drop, add] = addFundCheckSql("fund_oomt", "oomt");
    assert.match(drop ?? "", /DROP CONSTRAINT IF EXISTS documents_fund_matches_key/);
    assert.match(add ?? "", /CHECK \(fund = 'oomt'\)/);
    assert.doesNotMatch(add ?? "", /CHECK \(fund = 'fund_oomt'\)/);
  });

  it("never emits CREATE ROLE, PARTITION, hnsw, or ivfflat", () => {
    assert.doesNotMatch(ALL_SQL, /CREATE ROLE/i);
    assert.doesNotMatch(ALL_SQL, /PARTITION BY/i);
    assert.doesNotMatch(ALL_SQL, /\bhnsw\b/i);
    assert.doesNotMatch(ALL_SQL, /\bivfflat\b/i);
  });

  it("points the chunks FK at the fund-schema documents table", () => {
    const [, add] = addChunksFkSql("fund_oomt");
    assert.match(add ?? "", /REFERENCES "fund_oomt"\.documents\(id\)/);
    assert.doesNotMatch(add ?? "", /public\.documents/);
  });
});
