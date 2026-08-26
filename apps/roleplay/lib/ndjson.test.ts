import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseNdjsonLine, splitNdjson } from "./ndjson.js";

describe("splitNdjson", () => {
  it("returns complete lines and keeps the unfinished tail", () => {
    assert.deepEqual(splitNdjson('{"type":"status"}\n{"type":"te'), {
      lines: ['{"type":"status"}'],
      rest: '{"type":"te',
    });
  });

  it("treats a trailing newline as an empty rest, not a phantom line", () => {
    assert.deepEqual(splitNdjson('{"a":1}\n'), { lines: ['{"a":1}'], rest: "" });
  });
});

describe("parseNdjsonLine", () => {
  it("returns null for a heartbeat (empty line) instead of throwing", () => {
    assert.equal(parseNdjsonLine(""), null);
    assert.equal(parseNdjsonLine("   "), null);
  });

  it("parses a JSON object", () => {
    assert.deepEqual(parseNdjsonLine('{"type":"error","message":"x"}'), {
      type: "error",
      message: "x",
    });
  });
});
