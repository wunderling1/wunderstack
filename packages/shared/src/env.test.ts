import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { envSchema } from "./env.js";

describe("envSchema ingest chunker vars", () => {
  it("coerces a numeric string to a positive integer", () => {
    const parsed = envSchema.parse({ INGEST_CHUNK_CHARS: "1800", INGEST_OVERLAP_CHARS: "200" });
    assert.equal(parsed.INGEST_CHUNK_CHARS, 1800);
    assert.equal(parsed.INGEST_OVERLAP_CHARS, 200);
  });

  it("treats an unset value as undefined (chunker falls back to its defaults)", () => {
    const parsed = envSchema.parse({});
    assert.equal(parsed.INGEST_CHUNK_CHARS, undefined);
    assert.equal(parsed.INGEST_OVERLAP_CHARS, undefined);
  });

  it("fails loud on a non-numeric value instead of yielding NaN", () => {
    assert.throws(
      () => envSchema.parse({ INGEST_CHUNK_CHARS: "abc" }),
      (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
  });

  it("rejects a non-positive value", () => {
    assert.throws(
      () => envSchema.parse({ INGEST_OVERLAP_CHARS: "0" }),
      (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
  });
});
