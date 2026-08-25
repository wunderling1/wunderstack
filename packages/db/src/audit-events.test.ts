import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUDIT_ACTIONS } from "./audit-events.js";

describe("audit_events", () => {
  it("only records fund lifecycle actions, not corpus text", () => {
    assert.deepEqual(
      [...AUDIT_ACTIONS],
      [
        "fund_created",
        "fund_dumped",
        "fund_deactivated",
        "fund_deleted",
        "fund_restored",
        "fund_promoted",
      ],
    );
  });
});
