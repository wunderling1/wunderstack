import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CaoStreamEvent, CaoUsage } from "../types.js";
import { settledAnswerEvents, verifyAndBuild } from "./agent.js";
import { NOT_FOUND_MESSAGE } from "./prompt.js";
import type { RetrievalOutput } from "./tools.js";

/**
 * G4 buffer-to-verify contract (Fase 5): the streaming path must never surface an ungrounded hard
 * fact. Two seams enforce this and are locked here:
 *   - verifyAndBuild applies the hard-fact guard and returns NOT_FOUND_MESSAGE on a trip;
 *   - settledAnswerEvents only ever emits that ALREADY-settled answer, in one text delta.
 * A future change that streams model tokens before verification would have to abandon this seam.
 */

const ZERO_USAGE: CaoUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function retrievalWithGrounding(grounding: string): RetrievalOutput {
  return {
    context: "",
    citations: [],
    hits: [],
    timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
    chunks: [],
    fullChunkContent: [["c1", grounding]],
  };
}

describe("verifyAndBuild — G4 hard-fact guard", () => {
  it("passes a grounded hard fact through unchanged", () => {
    const retrieval = retrievalWithGrounding("Een fulltimer heeft recht op 190 uur vakantie per jaar.");
    const result = verifyAndBuild("Een fulltimer heeft 190 uur vakantie.", retrieval, "");
    assert.equal(result.hardFactGuardTriggered, false);
    assert.ok(result.answer.includes("190 uur"));
  });

  it("refuses an answer that asserts an UNgrounded hard fact", () => {
    const retrieval = retrievalWithGrounding("Een fulltimer heeft recht op 190 uur vakantie per jaar.");
    const result = verifyAndBuild("Bij deeltijd is dat 120 uur.", retrieval, "");
    assert.equal(result.hardFactGuardTriggered, true);
    assert.equal(result.answer, NOT_FOUND_MESSAGE);
    assert.ok(!result.answer.includes("120 uur"), "the ungrounded number is gone");
  });

  it("treats a user-supplied number as grounding (no false refusal on an echoed premise)", () => {
    const retrieval = retrievalWithGrounding("De CAO kent een naar-rato-berekening.");
    const result = verifyAndBuild("Bij 120 uur geldt dat naar rato.", retrieval, "en bij 120 uur?");
    assert.equal(result.hardFactGuardTriggered, false);
  });
});

describe("settledAnswerEvents — no ungrounded hard fact can be streamed", () => {
  it("emits exactly one text event, then citations, then done", () => {
    const result = {
      answer: "Je hebt recht op 190 uur.",
      citations: [],
      verificationFailed: false,
      hardFactGuardTriggered: false,
      usage: ZERO_USAGE,
    };
    const events: CaoStreamEvent[] = [...settledAnswerEvents(result, "trace-1")];
    assert.deepEqual(
      events.map((event) => event.type),
      ["text", "citations", "done"],
    );
    const citations = events.find((event) => event.type === "citations");
    assert.ok(citations?.type === "citations");
    assert.equal(citations.answer, result.answer);
    assert.equal(citations.found, true);
  });

  it("streams only the not-found message when the guard tripped — never the ungrounded number", () => {
    const retrieval = retrievalWithGrounding("Een fulltimer heeft recht op 190 uur vakantie per jaar.");
    const built = verifyAndBuild("Bij deeltijd is dat 120 uur.", retrieval, "");
    const events: CaoStreamEvent[] = [...settledAnswerEvents({ ...built, usage: ZERO_USAGE }, null)];

    assert.ok(!JSON.stringify(events).includes("120 uur"), "the ungrounded number never reaches the stream");
    const textEvents = events.filter((event) => event.type === "text");
    assert.equal(textEvents.length, 1);
    assert.ok(textEvents[0]?.type === "text" && textEvents[0].delta === NOT_FOUND_MESSAGE);
    const citations = events.find((event) => event.type === "citations");
    assert.ok(citations?.type === "citations" && citations.found === false);
  });

  it("omits the text event for an empty answer", () => {
    const events: CaoStreamEvent[] = [
      ...settledAnswerEvents(
        { answer: "", citations: [], verificationFailed: false, hardFactGuardTriggered: false, usage: ZERO_USAGE },
        null,
      ),
    ];
    assert.deepEqual(
      events.map((event) => event.type),
      ["citations", "done"],
    );
  });
});
