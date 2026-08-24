import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canDropPublicCorpus } from "./drop-public-corpus.js";
import { dropPublicCorpusSql, provisionDdl, revokePublicFundSchemaSql } from "./fund-ddl.js";

describe("provisionDdl (track B)", () => {
  it("never emits CREATE ROLE, PARTITION, hnsw, or a multi-schema transaction", () => {
    const sql = provisionDdl("fund_oomt", "oomt").join("\n");
    assert.doesNotMatch(sql, /CREATE ROLE/i);
    assert.doesNotMatch(sql, /PARTITION BY/i);
    assert.doesNotMatch(sql, /\bhnsw\b/i);
    assert.doesNotMatch(sql, /\bBEGIN\b/);
    assert.doesNotMatch(sql, /TO PUBLIC/i);
    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS "fund_oomt"/);
    assert.match(sql, /schema_migrations/);
  });

  it("emits explicit CREATE TABLE without LIKE when public corpus is gone", () => {
    const sql = provisionDdl("fund_oomt", "oomt", false).join("\n");
    assert.doesNotMatch(sql, /LIKE public\./);
    assert.doesNotMatch(sql, /TO PUBLIC/i);
    assert.match(sql, /vector\(4096\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "fund_oomt"\.documents/);
  });
});

describe("revokePublicFundSchemaSql", () => {
  it("revokes PUBLIC without granting it", () => {
    const sql = revokePublicFundSchemaSql("fund_oomt").join("\n");
    assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA "fund_oomt" FROM PUBLIC/);
    assert.doesNotMatch(sql, /GRANT /);
  });
});

describe("canDropPublicCorpus", () => {
  const copied = {
    key: "oomt",
    provisionApplied: true,
    publicDocuments: 2,
    schemaDocuments: 2,
    publicChunks: 10,
    schemaChunks: 10,
    publicEvents: 3,
    schemaEvents: 3,
  };

  it("allows drop when every active fund is copied", () => {
    const decision = canDropPublicCorpus([copied], true);
    assert.equal(decision.ok, true);
  });

  it("refuses drop when a fund is not provisioned", () => {
    const decision = canDropPublicCorpus([{ ...copied, provisionApplied: false }], true);
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.reasons.join(" "), /0001_provision/);
    }
  });

  it("refuses drop when the schema copy is smaller than public", () => {
    const decision = canDropPublicCorpus([{ ...copied, schemaChunks: 1 }], true);
    assert.equal(decision.ok, false);
  });

  it("refuses drop when no funds are registered", () => {
    const decision = canDropPublicCorpus([], true);
    assert.equal(decision.ok, false);
  });
});

describe("dropPublicCorpusSql", () => {
  it("drops only the three public corpus tables", () => {
    assert.equal(
      dropPublicCorpusSql(),
      "DROP TABLE IF EXISTS public.chunks, public.documents, public.interaction_events",
    );
  });
});
