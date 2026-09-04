import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";

import { parseFundSetProfile } from "./fund-set-profile";

describe("parseFundSetProfile", () => {
  it("rejects unknown fields (strict schema)", () => {
    assert.throws(
      () =>
        parseFundSetProfile({
          key: "probe",
          fund: "probe-fund",
          agentKey: "cao",
          corpusVersion: "probe-1",
          contentStatus: "scaffold",
          extraField: true,
        }),
      (error: unknown) => error instanceof ZodError && error.issues.some((issue) => issue.code === "unrecognized_keys"),
    );
  });
});
