import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentAnswer } from "@wunderstack/agents";
import { answeredGrounded } from "@wunderstack/shared";

import {
  ASK_CAO_ERROR_MESSAGE,
  askCaoErrorResult,
  askCaoSuccessResult,
  corpusVersionsFromCitations,
  renderAskCaoText,
  toAskCaoOutput,
} from "./mcp-ask-cao";

function sampleAnswer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    answer: "Je hebt recht op 25 vakantiedagen per jaar [1].",
    found: true,
    needsClarification: false,
    turnOutcome: answeredGrounded(),
    retrievedCount: 3,
    topScore: 0.72,
    citations: [
      {
        ref: 1,
        chunkId: "11111111-1111-4111-8111-111111111111",
        quote: "25 vakantiedagen",
        title: "CAO Demo",
        sourceUri: "demo://cao",
        fund: "demo",
        version: "demo-1",
        chapter: null,
        article: "12",
        lid: "1",
        sourceRef: "Artikel 12, lid 1",
        heading: "Artikel 12 — Vakantie",
        snippet: "…25 vakantiedagen…",
      },
    ],
    traceId: "trace-abc",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    citationVerificationFailed: false,
    followUpQuestions: [],
    ...overrides,
  };
}

describe("mcp-ask-cao render (M9)", () => {
  it("derives distinct corpus_versions from citations", () => {
    const output = toAskCaoOutput(
      sampleAnswer({
        citations: [
          { ...sampleAnswer().citations[0]!, version: "a", ref: 1 },
          { ...sampleAnswer().citations[0]!, version: "b", ref: 2, chunkId: "22222222-2222-4222-8222-222222222222" },
          { ...sampleAnswer().citations[0]!, version: "a", ref: 3, chunkId: "33333333-3333-4333-8333-333333333333" },
        ],
      }),
    );
    assert.deepEqual(corpusVersionsFromCitations(output.citations).sort(), ["a", "b"]);
    assert.deepEqual([...output.corpus_versions].sort(), ["a", "b"]);
  });

  it("returns empty corpus_versions on refusal", () => {
    const output = toAskCaoOutput(
      sampleAnswer({
        answer: "Ik kan dit niet terugvinden…",
        found: false,
        citations: [],
        traceId: null,
      }),
    );
    assert.deepEqual(output.corpus_versions, []);
    assert.equal(renderAskCaoText(output), output.answer);
  });

  it("renders answer plus sources so [n] markers stay grounded", () => {
    const output = toAskCaoOutput(sampleAnswer());
    const text = renderAskCaoText(output);
    assert.match(text, /25 vakantiedagen/);
    assert.match(text, /Bronnen:/);
    assert.match(text, /\[1\] Artikel 12, lid 1 \(vdemo-1\)/);
    const result = askCaoSuccessResult(output);
    assert.equal(result.content[0]?.text, text);
    assert.equal(result.structuredContent.trace_id, "trace-abc");
  });

  it("returns isError results that instruct the host not to invent CAO answers", () => {
    const result = askCaoErrorResult();
    assert.equal(result.isError, true);
    assert.equal(result.content[0]?.text, ASK_CAO_ERROR_MESSAGE);
    assert.match(result.content[0]?.text ?? "", /Verzin geen antwoord/);
  });
});
