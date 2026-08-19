import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RetrievedChunk } from "@wunderstack/rag";

import type { CaoStreamEvent, CaoUsage } from "../types.js";
import { settledAnswerBody, settledAnswerEvents, verifyAndBuild } from "./agent.js";
import { CITATIONS_SENTINEL } from "./generation-schema.js";
import { NOT_FOUND_MESSAGE, UNVERIFIABLE_MESSAGE } from "./prompt.js";
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

/** Retrieval carrying one real chunk, so a verifying quote can build a UI citation card. */
function retrievalWithChunk(chunkId: string, content: string): RetrievalOutput {
  const chunk: RetrievedChunk = {
    chunkId,
    ordinal: 0,
    content,
    score: 1,
    source: { documentId: "doc", title: "CAO", sourceUri: "", fund: "eval", agentKey: "cao", version: "1" },
    structure: { chapter: null, article: null, lid: null, sourceRef: null, chunkType: "text" },
    metadata: {},
  };
  return {
    context: "",
    citations: [],
    hits: [],
    timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
    chunks: [chunk],
    fullChunkContent: [[chunkId, content]],
  };
}

/** Build raw model output: prose (+markers) followed by the sentinel-delimited citation JSON. */
function raw(prose: string, citations: { marker: number; chunk_id: string; quote: string }[]): string {
  return `${prose}\n${CITATIONS_SENTINEL}\n${JSON.stringify(citations)}`;
}

describe("verifyAndBuild — G4 hard-fact guard", () => {
  it("passes a grounded, cited hard fact through unchanged", () => {
    const content = "Een fulltimer heeft recht op 190 uur vakantie per jaar.";
    const retrieval = retrievalWithChunk("c1", content);
    const output = raw("Een fulltimer heeft 190 uur vakantie [1].", [
      { marker: 1, chunk_id: "c1", quote: "190 uur vakantie" },
    ]);
    const result = verifyAndBuild(output, retrieval, "");
    assert.equal(result.hardFactGuardTriggered, false);
    assert.equal(result.found, true);
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

/**
 * G4 citation-coupling guard: a substantive answer with zero verified citations is a FORBIDDEN state —
 * `found=true` + `citations=[]` no longer ships. This is the invariant the screenshot bug violated: a
 * grounded, confident number served without a single source card. The guard converts it to an honest,
 * recoverable over-refusal (UNVERIFIABLE_MESSAGE, not NOT_FOUND — retrieval DID find context).
 */
describe("verifyAndBuild — G4 citation coupling", () => {
  const grounding =
    "Werknemers van 55 t/m 59 jaar krijgen twee extra vakantiedagen, oftewel 15,2 uur per jaar.";

  it("refuses a grounded hard fact whose only citation fails verbatim verification", () => {
    const retrieval = retrievalWithGrounding(grounding);
    const output = raw("Je krijgt 15,2 uur extra vakantie [1].", [
      { marker: 1, chunk_id: "c1", quote: "een quote die niet in de bron staat" },
    ]);
    const result = verifyAndBuild(output, retrieval, "");
    assert.equal(result.hardFactGuardTriggered, false, "the number IS grounded, so the hard-fact guard passes");
    assert.equal(result.unverifiable, true);
    assert.equal(result.found, false);
    assert.equal(result.answer, UNVERIFIABLE_MESSAGE);
    assert.deepEqual(result.citations, []);
    assert.ok(!result.answer.includes("15,2"), "the sourceless number is not served");
  });

  it("also refuses when the answer has no marker but asserts a hard fact with no verified citation", () => {
    const retrieval = retrievalWithGrounding(grounding);
    // No [n] in prose and an empty citation block: still substantive (carries "15,2 uur"), so refused.
    const result = verifyAndBuild("Je krijgt 15,2 uur extra vakantie.", retrieval, "");
    assert.equal(result.unverifiable, true);
    assert.equal(result.found, false);
    assert.equal(result.answer, UNVERIFIABLE_MESSAGE);
  });

  it("serves a grounded answer whose quote verifies verbatim, with the citation card", () => {
    const content = "Artikel 5.3 — Vakantie. Werknemers van 55 t/m 59 jaar krijgen 15,2 uur extra per jaar.";
    const retrieval = retrievalWithChunk("chunk-5-3", content);
    const output = raw("Je krijgt 15,2 uur extra per jaar [1].", [
      { marker: 1, chunk_id: "chunk-5-3", quote: "15,2 uur extra per jaar" },
    ]);
    const result = verifyAndBuild(output, retrieval, "");
    assert.equal(result.found, true);
    assert.equal(result.unverifiable, false);
    assert.equal(result.citations.length, 1);
    assert.ok(result.answer.includes("15,2 uur"));
    assert.ok(result.answer.includes("[1]"));
  });

  it("does not convert a legitimate model refusal (no fact, no marker) into UNVERIFIABLE", () => {
    const retrieval = retrievalWithGrounding(grounding);
    const result = verifyAndBuild(NOT_FOUND_MESSAGE, retrieval, "");
    assert.equal(result.unverifiable, false);
    assert.equal(result.answer, NOT_FOUND_MESSAGE);
  });
});

describe("settledAnswerEvents — no ungrounded hard fact can be streamed", () => {
  it("emits exactly one text event, then citations, then done", () => {
    const result = {
      answer: "Je hebt recht op 190 uur.",
      citations: [],
      found: true,
      verificationFailed: false,
      hardFactGuardTriggered: false,
      unverifiable: false,
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
        {
          answer: "",
          citations: [],
          found: true,
          verificationFailed: false,
          hardFactGuardTriggered: false,
          unverifiable: false,
          usage: ZERO_USAGE,
        },
        null,
      ),
    ];
    assert.deepEqual(
      events.map((event) => event.type),
      ["citations", "done"],
    );
  });
});

describe("settledAnswerBody — prefix for optional followups before done", () => {
  it("emits text then citations without done (live stream inserts followups in between)", () => {
    const events: CaoStreamEvent[] = [
      ...settledAnswerBody({
        answer: "Je hebt recht op 190 uur.",
        citations: [],
        found: true,
        verificationFailed: false,
        hardFactGuardTriggered: false,
        unverifiable: false,
        usage: ZERO_USAGE,
      }),
    ];
    assert.deepEqual(
      events.map((event) => event.type),
      ["text", "citations"],
    );
  });
});
