import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FUND_KEY_RE } from "./ident.js";
import {
  AgentInstanceExistsError,
  ConfirmationMismatchError,
  DumpRequiredError,
  FundInactiveError,
  FundNotFoundError,
  assertDeactivateAllowed,
  buildPgDumpArgs,
  redactSecrets,
} from "./fund-lifecycle.js";

describe("buildPgDumpArgs", () => {
  it("dumps one schema without --clean (no DROP SCHEMA in the dump)", () => {
    const args = buildPgDumpArgs("fund_oomt");
    assert.deepEqual(args, ["--no-owner", "--no-acl", "--schema=fund_oomt"]);
    assert.equal(
      args.some((arg) => arg.includes("clean") || arg.toLowerCase().includes("drop")),
      false,
    );
  });

  it("accepts hyphenated schema names and rejects unsafe identifiers", () => {
    assert.equal(
      buildPgDumpArgs("fund_elektronische-detailhandel")[2],
      "--schema=fund_elektronische-detailhandel",
    );
    assert.throws(() => buildPgDumpArgs('fund_oomt"; DROP SCHEMA public'), /unsafe schema name/);
  });
});

describe("redactSecrets", () => {
  it("strips postgres URLs so dump errors never leak credentials", () => {
    assert.match(
      redactSecrets("failed postgres://user:secret@host:5432/db extra"),
      /\[redacted\]/,
    );
    assert.doesNotMatch(redactSecrets("failed postgres://user:secret@host/db"), /secret/);
  });
});

describe("assertDeactivateAllowed", () => {
  const fund = { key: "proefonds", status: "active" as const };

  it("allows deactivate when a dump audit exists and the typed key matches", () => {
    const result = assertDeactivateAllowed({
      fund,
      confirmation: "proefonds",
      dumpCount: 1,
    });
    assert.equal(result.key, "proefonds");
  });

  it("refuses without a fund_dumped audit (soft-delete dump step)", () => {
    assert.throws(
      () => assertDeactivateAllowed({ fund, confirmation: "proefonds", dumpCount: 0 }),
      (error: unknown) => error instanceof DumpRequiredError && error.fundKey === "proefonds",
    );
  });

  it("refuses a confirmation that does not match the fund key", () => {
    assert.throws(
      () => assertDeactivateAllowed({ fund, confirmation: "other", dumpCount: 1 }),
      (error: unknown) => error instanceof ConfirmationMismatchError,
    );
  });

  it("refuses an already-inactive fund", () => {
    assert.throws(
      () =>
        assertDeactivateAllowed({
          fund: { key: "proefonds", status: "inactive" },
          confirmation: "proefonds",
          dumpCount: 1,
        }),
      (error: unknown) => error instanceof FundInactiveError,
    );
  });

  it("refuses a missing fund", () => {
    assert.throws(
      () => assertDeactivateAllowed({ fund: null, confirmation: "ghost", dumpCount: 1 }),
      (error: unknown) => error instanceof FundNotFoundError,
    );
  });
});

describe("named lifecycle errors", () => {
  it("AgentInstanceExistsError carries fund and agent", () => {
    const error = new AgentInstanceExistsError("oomt", "cao");
    assert.equal(error.name, "AgentInstanceExistsError");
    assert.equal(error.fundKey, "oomt");
    assert.equal(error.agentKey, "cao");
  });
});

describe("FUND_KEY_RE on detail params", () => {
  it("accepts catalog keys and rejects path injection", () => {
    assert.equal(FUND_KEY_RE.test("oomt"), true);
    assert.equal(FUND_KEY_RE.test("elektronische-detailhandel"), true);
    assert.equal(FUND_KEY_RE.test("../control"), false);
    assert.equal(FUND_KEY_RE.test("OOMT"), false);
  });
});
