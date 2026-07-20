import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@wunderstack/ai";

import { CITATIONS_SENTINEL } from "./generation-schema.js";
import { NOT_FOUND_MESSAGE } from "./prompt.js";
import { assessCitationContract, generateAnswerWithRepair } from "./generate-answer.js";

const chunks = new Map<string, string>([
  ["adv", "De werknemer heeft recht op 104 roostervrije uren per jaar."],
  ["reiskosten", "Voor normaal woon-werkverkeer bestaat geen recht op vergoeding."],
]);

/** Build a raw model output: prose (+markers) followed by the sentinel-delimited citation JSON. */
function raw(prose: string, citations: { marker: number; chunk_id: string; quote: string }[]): string {
  return `${prose}\n${CITATIONS_SENTINEL}\n${JSON.stringify(citations)}`;
}

describe("assessCitationContract", () => {
  it("passes a clean answer whose every quote verifies verbatim", () => {
    const output = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    assert.equal(assessCitationContract(output, chunks).penalty, 0);
  });

  it("passes a claim-free refusal with no citation block", () => {
    assert.equal(assessCitationContract(NOT_FOUND_MESSAGE, chunks).penalty, 0);
  });

  it("flags an answerable answer whose citation block failed to parse", () => {
    const output = `Je hebt recht op iets [1].\n${CITATIONS_SENTINEL}\nnot json`;
    assert.ok(assessCitationContract(output, chunks).penalty > 0);
  });

  it("flags a quote that is not verbatim in its chunk", () => {
    const output = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "honderdvier roostervrije uren" },
    ]);
    assert.ok(assessCitationContract(output, chunks).penalty > 0);
  });

  it("flags a prose marker with no citation object behind it (dangling)", () => {
    const output = raw("Je hebt recht op 104 roostervrije uren [1].", []);
    assert.ok(assessCitationContract(output, chunks).penalty > 0);
  });

  it("flags an ungrounded hard fact carried by an unverifiable citation", () => {
    // The "16 weken" case: a load-bearing quantity cited to a source that is not in the context.
    const output = raw("Je hebt recht op 16 weken zwangerschapsverlof [1].", [
      { marker: 1, chunk_id: "wazo", quote: "16 weken zwangerschapsverlof" },
    ]);
    assert.ok(assessCitationContract(output, chunks).penalty > 0);
  });

  it("flags a decorative citation: a VERIFIED quote that does not carry the asserted figure (etd-026)", () => {
    // The real etd-026: the quote is verbatim in the chunk (so it verifies), but "16 weken" appears
    // nowhere in the context. The old trigger passed this — a verified citation was enough. The
    // widened trigger grounds the figure itself, so the decorative citation no longer buys a pass.
    const wazoChunks = new Map<string, string>([
      ["wet-arbeid-zorg", "5.9. Wet Arbeid en Zorg. De Wet Arbeid en Zorg is van toepassing."],
    ]);
    const output = raw("Je hebt recht op 16 weken zwangerschapsverlof [1].", [
      { marker: 1, chunk_id: "wet-arbeid-zorg", quote: "De Wet Arbeid en Zorg is van toepassing." },
    ]);
    assert.ok(assessCitationContract(output, wazoChunks).penalty > 0);
  });

  it("does not flag a grounded figure whose verified quote carries it (no false positive)", () => {
    // Guardrail against over-refusal: the number IS in the cited, verbatim quote — clean contract.
    const output = raw("Je krijgt € 6,25 netto [1].", [
      { marker: 1, chunk_id: "meal", quote: "€ 6,25 netto" },
    ]);
    const mealChunks = new Map<string, string>([["meal", "Na 19:00 uur krijg je € 6,25 netto."]]);
    assert.equal(assessCitationContract(output, mealChunks).penalty, 0);
  });
});

/** A scripted generator: returns the next queued output per call, recording the messages it saw. */
function scriptedGenerate(outputs: string[]): {
  generate: (extra: ChatMessage[]) => Promise<{ text: string }>;
  calls: ChatMessage[][];
} {
  const calls: ChatMessage[][] = [];
  let index = 0;
  return {
    calls,
    generate: (extra) => {
      calls.push(extra);
      const text = outputs[index] ?? outputs[outputs.length - 1] ?? "";
      index += 1;
      return Promise.resolve({ text });
    },
  };
}

describe("generateAnswerWithRepair", () => {
  it("returns the first attempt unchanged when it already honours the contract", async () => {
    const clean = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate, calls } = scriptedGenerate([clean]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.attempts, 1);
    assert.equal(result.repaired, false);
    assert.equal(result.text, clean);
    assert.equal(calls.length, 1);
  });

  it("retries once and keeps the repaired attempt when it fixes the contract", async () => {
    const broken = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "honderdvier roostervrije uren" },
    ]);
    const fixed = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate, calls } = scriptedGenerate([broken, fixed]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.attempts, 2);
    assert.equal(result.repaired, true);
    assert.equal(result.text, fixed);
    // The repair turn must feed the previous attempt back so the model can correct itself.
    assert.equal(calls[1]?.[0]?.role, "assistant");
    assert.equal(calls[1]?.[0]?.content, broken);
    assert.equal(calls[1]?.[1]?.role, "user");
  });

  it("resolves an ungrounded assertion to a refusal after the repair turn", async () => {
    const invented = raw("Je hebt recht op 16 weken zwangerschapsverlof [1].", [
      { marker: 1, chunk_id: "wazo", quote: "16 weken zwangerschapsverlof" },
    ]);
    const { generate } = scriptedGenerate([invented, NOT_FOUND_MESSAGE]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.attempts, 2);
    assert.equal(result.repaired, true);
    assert.equal(result.text, NOT_FOUND_MESSAGE);
  });

  it("keeps the first attempt when the retry is no better (tie broken toward fewer violations)", async () => {
    const brokenA = raw("Antwoord met 50% toeslag [1].", [
      { marker: 1, chunk_id: "adv", quote: "een quote die niet klopt" },
    ]);
    const brokenBworse = raw("Antwoord met 50% toeslag [1][2].", [
      { marker: 1, chunk_id: "adv", quote: "ook fout" },
      { marker: 2, chunk_id: "adv", quote: "nog een foute quote" },
    ]);
    const { generate } = scriptedGenerate([brokenA, brokenBworse]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.attempts, 2);
    assert.equal(result.repaired, false);
    assert.equal(result.text, brokenA);
  });

  it("best-of-N: keeps sampling past the repair turn until a clean attempt (maxAttempts=3)", async () => {
    const brokenA = raw("Recht op 104 roostervrije uren [1].", [{ marker: 1, chunk_id: "adv", quote: "fout A" }]);
    const brokenB = raw("Recht op 104 roostervrije uren [1].", [{ marker: 1, chunk_id: "adv", quote: "fout B" }]);
    const clean = raw("Recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate, calls } = scriptedGenerate([brokenA, brokenB, clean]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate, maxAttempts: 3 });

    assert.equal(result.attempts, 3);
    assert.equal(result.repaired, true);
    assert.equal(result.text, clean);
    assert.equal(calls.length, 3);
    // Each later attempt gets a repair turn fed the best-so-far attempt.
    assert.equal(calls[2]?.[0]?.role, "assistant");
  });

  it("best-of-N: stops early as soon as an attempt is clean (does not exhaust the budget)", async () => {
    const broken = raw("Recht op 104 roostervrije uren [1].", [{ marker: 1, chunk_id: "adv", quote: "fout" }]);
    const clean = raw("Recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate, calls } = scriptedGenerate([broken, clean, clean]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate, maxAttempts: 3 });

    assert.equal(result.attempts, 2);
    assert.equal(result.text, clean);
    assert.equal(calls.length, 2);
  });

  it("sums token usage across both attempts", async () => {
    const broken = raw("Recht op 104 uur [1].", [{ marker: 1, chunk_id: "adv", quote: "fout citaat" }]);
    const fixed = raw("Recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    let call = 0;
    const generate = (): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> => {
      const text = call === 0 ? broken : fixed;
      call += 1;
      return Promise.resolve({ text, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
    };

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.usage.promptTokens, 20);
    assert.equal(result.usage.completionTokens, 10);
    assert.equal(result.usage.totalTokens, 30);
  });
});
