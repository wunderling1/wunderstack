import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canDropPublicCorpus } from "./drop-public-corpus.js";
import {
  createRoleplayTurnFunctionSql,
  dropPublicCorpusSql,
  provisionDdl,
  revokePublicFundSchemaSql,
  roleplayDdl,
} from "./fund-ddl.js";

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

  it("revokes EXECUTE too — Postgres hands new functions to PUBLIC by default", () => {
    const sql = revokePublicFundSchemaSql("fund_oomt").join("\n");
    assert.match(sql, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "fund_oomt" FROM PUBLIC/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  });
});

describe("roleplayDdl", () => {
  it("creates the four tables inside the fund schema, never in public", () => {
    const sql = roleplayDdl("fund_oomt").join("\n");
    for (const table of [
      "roleplay_sessions",
      "roleplay_messages",
      "roleplay_reviews",
      "roleplay_result_deliveries",
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "fund_oomt"\\.${table}\\b`));
    }
    assert.doesNotMatch(sql, /\bpublic\.roleplay/);
  });

  it("is idempotent — every statement tolerates a schema that already has it", () => {
    for (const statement of roleplayDdl("fund_oomt")) {
      assert.match(statement, /IF NOT EXISTS|CREATE OR REPLACE FUNCTION/);
    }
  });

  it("claims the review with review_started_at so two processes cannot race a grade", () => {
    const sql = roleplayDdl("fund_oomt").join("\n");
    assert.match(sql, /review_started_at timestamptz/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS review_started_at/);
  });

  it("keeps the scenario reference a plain column: the scenario lives in control", () => {
    const sql = roleplayDdl("fund_oomt").join("\n");
    assert.match(sql, /scenario_slug text NOT NULL/);
    assert.doesNotMatch(sql, /REFERENCES "control"/);
  });

  it("cascades child rows from the session so a deleted session leaves no transcript", () => {
    const sql = roleplayDdl("fund_oomt").join("\n");
    const cascades = sql.match(
      /REFERENCES "fund_oomt"\.roleplay_sessions\(id\) ON DELETE CASCADE/g,
    );
    assert.equal(cascades?.length, 3);
  });

  it("carries no identity column — roleplay follows the pseudonymous model (R3)", () => {
    const sql = roleplayDdl("fund_oomt").join("\n");
    assert.doesNotMatch(sql, /\bemail\b/i);
    assert.doesNotMatch(sql, /\bfull_name\b|\bdisplay_name\b/i);
    assert.match(sql, /external_user_ref text/);
  });
});

describe("createRoleplayTurnFunctionSql", () => {
  const sql = createRoleplayTurnFunctionSql("fund_oomt");

  it("claims the turn in the same UPDATE that checks the budget", () => {
    // Read-then-write loses a turn when two tabs post at once, and a separate pre-flight check lets
    // two concurrent turns both pass and together exceed max_turns.
    assert.match(sql, /SET turns_used = s\.turns_used \+ 1/);
    assert.match(sql, /AND s\.turns_used < s\.max_turns/);
    assert.match(sql, /AND s\.status = 'active'/);
  });

  it("qualifies every column so the RETURNS TABLE out-params cannot shadow one", () => {
    const body = sql.slice(sql.indexOf("AS $$"));
    // The SET target is the one bare column name SQL requires; everything else carries an alias.
    const bare = body
      .split("\n")
      .filter((line) => !/^\s*SET turns_used =/.test(line))
      .filter((line) => /(?<![.\w])(turns_used|max_turns|status)\b/.test(line));
    assert.deepEqual(bare, [], `unqualified column reference(s):\n${bare.join("\n")}`);
  });

  it("reports refusal instead of failing, so the caller can distinguish 'done' from 'error'", () => {
    assert.match(sql, /accepted boolean/);
    assert.match(sql, /UNION ALL/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM claimed\)/);
  });

  it("stays plain SQL: provisionDdl must contain no BEGIN", () => {
    assert.match(sql, /LANGUAGE sql/);
    assert.doesNotMatch(sql, /\bBEGIN\b/);
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
