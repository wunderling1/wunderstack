import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMistralRequestBody, DEFAULT_LLM_MODEL, DEFAULT_MAX_OUTPUT_TOKENS } from "./models";

const messages = [{ role: "user" as const, content: "Hoeveel vakantie-uren heb ik?" }];

/**
 * The request body is the contract with the provider. A sampling parameter that is silently not
 * sent is indistinguishable from a model that ignores it — which is how the 2026-08-23 runaway
 * would have looked if `stop` had been added to GENERATION_CONFIG but never reached Mistral.
 */
describe("buildMistralRequestBody", () => {
  it("sends the stop sequences it was given", () => {
    const body = buildMistralRequestBody({ messages, stop: ["+++++"] }, false);
    assert.deepEqual(body.stop, ["+++++"]);
  });

  it("sends stop on the streaming path too", () => {
    const body = buildMistralRequestBody({ messages, stop: ["+++++"] }, true);
    assert.deepEqual(body.stop, ["+++++"]);
    assert.equal(body.stream, true);
  });

  it("omits the key entirely when no stop sequence is configured", () => {
    assert.equal("stop" in buildMistralRequestBody({ messages }, false), false);
  });

  it("omits the key for an empty list rather than sending stop: []", () => {
    assert.equal("stop" in buildMistralRequestBody({ messages, stop: [] }, false), false);
  });

  it("copies the caller's array so a shared config object cannot be mutated downstream", () => {
    const stop = ["+++++"] as const;
    const body = buildMistralRequestBody({ messages, stop }, false);
    assert.notEqual(body.stop, stop);
    assert.deepEqual(body.stop, [...stop]);
  });

  it("still carries model, messages and the token cap", () => {
    const body = buildMistralRequestBody({ messages, temperature: 0 }, false);
    assert.equal(body.model, DEFAULT_LLM_MODEL);
    assert.deepEqual(body.messages, messages);
    assert.equal(body.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS);
    assert.equal(body.temperature, 0);
  });
});
