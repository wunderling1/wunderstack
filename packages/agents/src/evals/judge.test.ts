import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@wunderstack/ai";

import { parseJudgeOutput, runJudgeWithParseRetry } from "./judge.js";

describe("parseJudgeOutput", () => {
  it("parses a clean JSON object", () => {
    const parsed = parseJudgeOutput('{"faithfulness":1,"relevance":0.5,"completeness":0.75}');
    assert.equal(parsed.faithfulness, 1);
    assert.equal(parsed.relevance, 0.5);
    assert.equal(parsed.completeness, 0.75);
  });

  it("extracts a JSON object embedded in prose", () => {
    const text =
      'Beoordeling: {"faithfulness":0.8,"relevance":0.9,"completeness":0.7,"reasoning":"ok"}. Klaar.';
    const parsed = parseJudgeOutput(text);
    assert.equal(parsed.faithfulness, 0.8);
    assert.equal(parsed.reasoning, "ok");
  });

  it("throws when there is no JSON object", () => {
    assert.throws(() => parseJudgeOutput("geen json hier"), /no JSON object/);
  });

  it("throws on malformed JSON", () => {
    assert.throws(() => parseJudgeOutput('{"faithfulness":0.8,}'), /malformed JSON/);
  });

  it("throws on a schema violation (value out of range)", () => {
    assert.throws(() => parseJudgeOutput('{"faithfulness":2,"relevance":0.5,"completeness":0.5}'));
  });

  it("throws on a schema violation (missing field)", () => {
    assert.throws(() => parseJudgeOutput('{"faithfulness":0.5,"relevance":0.5}'));
  });
});

describe("runJudgeWithParseRetry", () => {
  const validJson = '{"faithfulness":0.5,"relevance":0.5,"completeness":0.5}';

  it("returns the parsed result on first success without retrying", async () => {
    let calls = 0;
    const result = await runJudgeWithParseRetry(async () => {
      calls += 1;
      return '{"faithfulness":1,"relevance":1,"completeness":1}';
    });
    assert.equal(calls, 1);
    assert.equal(result.faithfulness, 1);
  });

  it("retries once when the first output is not valid JSON, feeding the failure back", async () => {
    const outputs = ["kapot, geen json", validJson];
    let calls = 0;
    let retryExtra: ChatMessage[] = [];
    const result = await runJudgeWithParseRetry(async (extraMessages) => {
      const out = outputs[calls] ?? "";
      calls += 1;
      if (calls === 2) {
        retryExtra = extraMessages;
      }
      return out;
    });

    assert.equal(calls, 2);
    assert.equal(result.completeness, 0.5);
    // The retry feeds the previous (bad) output back as an assistant turn plus a corrective user turn.
    assert.equal(retryExtra.length, 2);
    assert.equal(retryExtra[0]?.role, "assistant");
    assert.equal(retryExtra[0]?.content, "kapot, geen json");
    assert.equal(retryExtra[1]?.role, "user");
    assert.match(retryExtra[1]?.content ?? "", /geen geldig JSON/);
  });

  it("throws when the retry also fails (fail-loud, no default score)", async () => {
    let calls = 0;
    await assert.rejects(
      runJudgeWithParseRetry(async () => {
        calls += 1;
        return "nog steeds kapot";
      }),
    );
    assert.equal(calls, 2);
  });
});
