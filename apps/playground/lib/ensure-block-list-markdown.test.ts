import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ensureBlockListMarkdown } from "./ensure-block-list-markdown";

describe("ensureBlockListMarkdown", () => {
  it("leaves already-structured nested lists unchanged", () => {
    const nested =
      "Dit zijn de stappen:\n\n1. **Zet het voertuig vast**\n   - Schakel uit\n\n2. **Berg de sleutel op**\n   - Minimaal 5 meter";
    assert.equal(ensureBlockListMarkdown(nested), nested);
  });

  it("turns a one-paragraph procedure into block list markdown", () => {
    const flat =
      "Dit zijn de stappen: 1. **Zet het voertuig vast** - Schakel de tractie uit - Zet de parkeerrem vast 2. **Berg de sleutel op** - Minimaal 5 meter weg.";
    const restored = ensureBlockListMarkdown(flat);
    assert.match(restored, /\n\n1\. \*\*Zet het voertuig vast\*\*/);
    assert.match(restored, /\n {3}- Schakel de tractie uit/);
    assert.match(restored, /\n\n2\. \*\*Berg de sleutel op\*\*/);
    assert.match(restored, /\n {3}- Minimaal 5 meter weg\./);
  });
});
