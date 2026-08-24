import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@wunderstack/ai";

import { CITATIONS_SENTINEL } from "./generation-schema.js";
import { NOT_FOUND_MESSAGE } from "./prompt.js";
import {
  assessCitationContract,
  GenerationAbortedError,
  generateAnswerWithRepair,
  isProRataViolation,
} from "./generate-answer.js";

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

const UNGROUNDED_REASON =
  "de tekst noemt een concreet bedrag, percentage of aantal dat niet in de context staat (16 weken)";
const QUOTE_ONLY_REASON = "1 citaat(en) waren niet woordelijk in de context terug te vinden";

describe("isProRataViolation", () => {
  it("stays off for an ungrounded out-of-corpus fact without a deeltijd/pro-rata signal (etd-026)", () => {
    assert.equal(
      isProRataViolation(
        UNGROUNDED_REASON,
        "Je hebt recht op 16 weken zwangerschapsverlof [1].",
        "Hoeveel weken zwangerschapsverlof krijg ik?",
      ),
      false,
    );
  });

  it("fires for derived golden phrasings that do not say 'deeltijd'", () => {
    assert.equal(
      isProRataViolation(UNGROUNDED_REASON, "120 vakantie-uren", "Ik werk 24 uur per week. Op hoeveel vakantie-uren heb ik dan per jaar recht?"),
      true,
      "etd-d01: 24 uur per week",
    );
    assert.equal(
      isProRataViolation(UNGROUNDED_REASON, "48 vakantie-uren", "En als ik 12 uur per week werk?"),
      true,
      "etd-d02: 12 uur per week",
    );
    assert.equal(
      isProRataViolation(UNGROUNDED_REASON, "60 vakantie-uren", "Ik heb een contract van 12 uur per week."),
      true,
      "etd-d03-style: contract van N uur",
    );
    assert.equal(
      isProRataViolation(UNGROUNDED_REASON, "Naar rato is dat 120 uur.", "Op hoeveel vakantie-uren heb ik recht?"),
      true,
      "previous attempt already used naar rato",
    );
    assert.equal(
      isProRataViolation(UNGROUNDED_REASON, "", "Ik werk parttime, hoeveel vakantie-uren?"),
      true,
      "parttime without the word deeltijd",
    );
  });

  it("stays off when the violation is only a non-verbatim quote, even on a deeltijd question", () => {
    assert.equal(
      isProRataViolation(QUOTE_ONLY_REASON, "104 roostervrije uren", "Ik werk 24 uur per week."),
      false,
    );
  });
});

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
    const { generate, calls } = scriptedGenerate([invented, NOT_FOUND_MESSAGE]);

    const result = await generateAnswerWithRepair({
      chunkContentById: chunks,
      generate,
      userSupplied: "Hoeveel weken zwangerschapsverlof krijg ik?",
    });

    assert.equal(result.attempts, 2);
    assert.equal(result.repaired, true);
    assert.equal(result.text, NOT_FOUND_MESSAGE);
    const repairPrompt = calls[1]?.[1]?.content ?? "";
    assert.equal(repairPrompt.includes("weiger ook NIET"), false, "pro-rata hatch must stay off for etd-026");
    assert.ok(repairPrompt.includes("niet bepaalt, niet regelt of niet noemt"), "niet-regelt clause");
    assert.ok(repairPrompt.includes(NOT_FOUND_MESSAGE), "exact not-found template");
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

    // Option b fires the bounded extra attempt (brokenA is a substantive answer with zero verified
    // citations); the extra attempt (brokenBworse) is worse, so brokenA is still kept.
    assert.equal(result.attempts, 3);
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

  // Regression: an aborted generation comes back from Mastra as an EMPTY completion with
  // finishReason "tripwire" (not a throw). Such an attempt must never be served as an empty answer
  // nor overwrite a real one — the "abort → blank bubble / stuck" bug reproduced from the traces.
  it("keeps a real earlier attempt when a later (repair) attempt is aborted (empty + tripwire)", async () => {
    // Attempt 1 trips the contract (penalty > 0) so a repair turn is triggered.
    const flagged = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "honderdvier roostervrije uren" },
    ]);
    let call = 0;
    const generate = (): Promise<{ text: string; finishReason: string }> => {
      call += 1;
      return call === 1
        ? Promise.resolve({ text: flagged, finishReason: "stop" })
        : Promise.resolve({ text: "", finishReason: "tripwire" });
    };

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    // Attempt 2 (repair) aborts; option b then fires one more (also aborted) — the real flagged answer
    // survives all of it and is never overwritten by an empty attempt.
    assert.equal(result.attempts, 3);
    assert.equal(result.text, flagged, "the aborted empty attempt must not overwrite the real one");
    assert.notEqual(result.text, "");
  });

  it("throws GenerationAbortedError when every attempt is aborted/empty (tripwire)", async () => {
    const generate = (): Promise<{ text: string; finishReason: string }> =>
      Promise.resolve({ text: "", finishReason: "tripwire" });

    await assert.rejects(
      () => generateAnswerWithRepair({ chunkContentById: chunks, generate, maxAttempts: 2 }),
      (error: unknown) => error instanceof GenerationAbortedError,
    );
  });

  it("throws GenerationAbortedError when a lone attempt is blank (empty text, no finishReason)", async () => {
    const { generate } = scriptedGenerate(["   "]);

    await assert.rejects(
      () => generateAnswerWithRepair({ chunkContentById: chunks, generate, maxAttempts: 1 }),
      (error: unknown) => error instanceof GenerationAbortedError,
    );
  });

  it("option b: fires one bounded extra attempt that rescues a sourceless answer past the budget", async () => {
    // Both budgeted attempts leave a substantive answer with zero verified citations; the extra
    // targeted attempt (beyond maxAttempts=2) finally lands a verbatim quote.
    const broken = raw("Recht op 104 roostervrije uren [1].", [{ marker: 1, chunk_id: "adv", quote: "fout" }]);
    const clean = raw("Recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate, calls } = scriptedGenerate([broken, broken, clean]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.attempts, 3, "budget 2 + one rescue attempt");
    assert.equal(result.repaired, true);
    assert.equal(result.text, clean);
    assert.equal(calls.length, 3);
  });

  it("option b: does not fire when the chosen answer already has a verified citation", async () => {
    // A dangling extra marker keeps penalty > 0, but marker 1 verifies — so there IS a citation and the
    // sourceless-answer rescue must NOT run (attempts stays at the budget).
    const dangling = raw("Recht op 104 roostervrije uren [1] en meer [2].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate } = scriptedGenerate([dangling, dangling]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.attempts, 2);
  });

  it("repair turn echoes the exact stripped quote so the model fixes that specific span", async () => {
    const broken = raw("Recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "een niet-letterlijke quote" },
    ]);
    const clean = raw("Recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    const { generate, calls } = scriptedGenerate([broken, clean]);

    await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    const repairPrompt = calls[1]?.[1]?.content ?? "";
    assert.ok(repairPrompt.includes("NIET letterlijk"), "names the verbatim failure");
    assert.ok(repairPrompt.includes("een niet-letterlijke quote"), "echoes the exact stripped quote");
    assert.ok(repairPrompt.includes("niet bepaalt, niet regelt of niet noemt"), "niet-regelt is always in the repair turn");
    assert.equal(repairPrompt.includes("weiger ook NIET"), false, "quote-only violation is not a pro-rata hatch");
  });

  it("offers the naar-rato hatch when an ungrounded total sits on a deeltijd question (etd-d01)", async () => {
    const vacationChunks = new Map<string, string>([
      ["vac", "Een fulltimer heeft recht op 190 uur vakantie per jaar. Voor deeltijd gelden die rechten naar rato."],
    ]);
    const invented = raw("Bij 24 uur per week heb je recht op 120 vakantie-uren [1].", [
      { marker: 1, chunk_id: "vac", quote: "190 uur vakantie per jaar" },
    ]);
    const deferred = raw(
      "Een fulltimer heeft 190 uur vakantie [1]; bij 24 uur geldt dit naar rato. Je fonds rekent het exact uit.",
      [{ marker: 1, chunk_id: "vac", quote: "190 uur vakantie per jaar" }],
    );
    const { generate, calls } = scriptedGenerate([invented, deferred]);

    const result = await generateAnswerWithRepair({
      chunkContentById: vacationChunks,
      generate,
      userSupplied: "Ik werk 24 uur per week. Op hoeveel vakantie-uren heb ik dan per jaar recht?",
    });

    assert.equal(result.repaired, true);
    assert.equal(result.text, deferred);
    const repairPrompt = calls[1]?.[1]?.content ?? "";
    assert.ok(repairPrompt.includes("weiger ook NIET"), "pro-rata hatch on for a 24-uur-per-week question");
    assert.ok(repairPrompt.includes("niet bepaalt, niet regelt of niet noemt"), "niet-regelt still present beside the hatch");
  });

  it("does not let an empty attempt win the penalty tie over a real (flagged) attempt", async () => {
    // Both attempts are non-clean, but the second is EMPTY. Without the guard the empty string would
    // score penalty 0 and win the `<=` tie; with the guard the flagged real answer is kept.
    const flagged = raw("Je hebt recht op 104 roostervrije uren [1].", [
      { marker: 1, chunk_id: "adv", quote: "honderdvier roostervrije uren" },
    ]);
    const { generate } = scriptedGenerate([flagged, ""]);

    const result = await generateAnswerWithRepair({ chunkContentById: chunks, generate });

    assert.equal(result.text, flagged);
  });
});

/**
 * Stop-sequence regression (2026-08-23). Six of 38 Gate C cases finished on `length` with a COMPLETE
 * answer: prose, sentinel and a closed JSON array, followed by `\n\n\n+++++ <path>` and an invented
 * repository file. `GENERATION_CONFIG.stop = ["+++++"]` now ends generation at that separator, so the
 * chosen text stops right after the citation block. These assert that the contract assessor — the
 * seam the repair loop optimises — reads such a stopped answer as clean, not as a violation.
 */
describe("assessCitationContract with a stop-sequence-terminated answer", () => {
  it("scores a grounded answer that stopped at the separator as clean", () => {
    const output = raw("Je hebt recht op 104 roostervrije uren per jaar [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ]);
    // What the provider now returns: identical up to the closing `]`, nothing after it.
    assert.equal(assessCitationContract(output, chunks).penalty, 0);
  });

  it("is unchanged by a trailing newline where the runaway used to start", () => {
    const output = `${raw("Je hebt recht op 104 roostervrije uren per jaar [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ])}\n\n\n`;
    assert.equal(assessCitationContract(output, chunks).penalty, 0);
  });

  it("still flags the pre-stop answer when the citation block itself is broken", () => {
    // The stop sequence must not launder a real violation: an unbacked marker stays a violation.
    const output = `Je hebt recht op 104 roostervrije uren per jaar [1].\n${CITATIONS_SENTINEL}\n[]`;
    assert.ok(assessCitationContract(output, chunks).penalty > 0);
  });

  it("treats the runaway tail as scoreable text when a stop sequence did NOT fire", () => {
    // Old behaviour, kept as documentation: everything after the array is parsed away, so a case
    // that ran away still scored clean — which is why the runaway was invisible to every gate
    // except finishReason.
    const output = `${raw("Je hebt recht op 104 roostervrije uren per jaar [1].", [
      { marker: 1, chunk_id: "adv", quote: "104 roostervrije uren" },
    ])}\n\n\n+++++ examples/cao-assistent/voorbeeld-2.md\nJe bent een assistent…`;
    assert.equal(assessCitationContract(output, chunks).penalty, 0);
  });
});
