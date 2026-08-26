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

describe("envSchema DB_APPLICATION_NAME", () => {
  it("accepts a short prefix", () => {
    const parsed = envSchema.parse({ DB_APPLICATION_NAME: "wunderstack-dashboard" });
    assert.equal(parsed.DB_APPLICATION_NAME, "wunderstack-dashboard");
  });

  it("treats unset and empty as undefined", () => {
    assert.equal(envSchema.parse({}).DB_APPLICATION_NAME, undefined);
    assert.equal(envSchema.parse({ DB_APPLICATION_NAME: "" }).DB_APPLICATION_NAME, undefined);
  });

  it("rejects a name longer than 63 characters", () => {
    assert.throws(
      () => envSchema.parse({ DB_APPLICATION_NAME: "w".repeat(64) }),
      (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
  });
});

describe("envSchema chat-stream robustness vars", () => {
  it("coerces turn-budget and heartbeat ms", () => {
    const parsed = envSchema.parse({
      RUNTIME_CHAT_TURN_BUDGET_MS: "45000",
      RUNTIME_CHAT_HEARTBEAT_MS: "10000",
    });
    assert.equal(parsed.RUNTIME_CHAT_TURN_BUDGET_MS, 45_000);
    assert.equal(parsed.RUNTIME_CHAT_HEARTBEAT_MS, 10_000);
  });

  it("treats unset values as undefined (route falls back to defaults)", () => {
    const parsed = envSchema.parse({});
    assert.equal(parsed.RUNTIME_CHAT_TURN_BUDGET_MS, undefined);
    assert.equal(parsed.RUNTIME_CHAT_HEARTBEAT_MS, undefined);
  });

  it("rejects a non-positive turn budget", () => {
    assert.throws(
      () => envSchema.parse({ RUNTIME_CHAT_TURN_BUDGET_MS: "0" }),
      (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
  });
});
