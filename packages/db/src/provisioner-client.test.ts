import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveProvisionerUrl } from "./client.js";
import { FundExistsError } from "./fund-environment.js";
import { UserExistsError } from "./dashboard-users.js";

describe("FundExistsError / UserExistsError", () => {
  it("FundExistsError carries fundKey and a stable name", () => {
    const error = new FundExistsError("oomt");
    assert.equal(error.name, "FundExistsError");
    assert.equal(error.fundKey, "oomt");
    assert.match(error.message, /oomt/);
  });

  it("UserExistsError carries email and a stable name", () => {
    const error = new UserExistsError("fonds@example.nl");
    assert.equal(error.name, "UserExistsError");
    assert.equal(error.email, "fonds@example.nl");
  });
});

describe("resolveProvisionerUrl / getProvisionerDb contract", () => {
  it("throws naming PROVISIONER_DATABASE_URL and does not fall back to DATABASE_URL", () => {
    assert.throws(
      () => resolveProvisionerUrl(undefined),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("PROVISIONER_DATABASE_URL") &&
        error.message.includes("no fallback to DATABASE_URL"),
    );
    assert.throws(
      () => resolveProvisionerUrl(""),
      (error: unknown) => error instanceof Error && error.message.includes("PROVISIONER_DATABASE_URL"),
    );
    assert.equal(
      resolveProvisionerUrl("postgresql://provisioner/local"),
      "postgresql://provisioner/local",
    );
  });
});
