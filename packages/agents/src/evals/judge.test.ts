import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@wunderstack/ai";

import { NOT_FOUND_MESSAGE } from "../cao/prompt";

import type { GoldenCase, GoldenPassage } from "./golden-set";
import {
  aggregateScores,
  answerRefuses,
  parseJudgeOutput,
  runJudgeWithParseRetry,
  scoreCitationVerification,
  type CaseScores,
} from "./judge";

describe("answerRefuses — grounded scope-refusal vs adjacent grant (etd-025 / etd-032)", () => {
  it("still treats the exact NOT_FOUND_MESSAGE as a refusal", () => {
    assert.equal(answerRefuses(NOT_FOUND_MESSAGE, NOT_FOUND_MESSAGE), true);
  });

  it("still treats 'niet terugvinden' as a refusal", () => {
    assert.equal(
      answerRefuses("Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb.", NOT_FOUND_MESSAGE),
      true,
    );
  });

  it("recognises a grounded scope-refusal with a verified citation (etd-025)", () => {
    // PR #29 artefact (run 32737827106): finishReason=stop, 338 chars, hardHallucination=1.
    // The CAO's own referenceAnswer for this case is the same shape. Treating only the template
    // as a refusal made the golden set and the gate reward opposite behaviour.
    const prose = [
      "De CAO loopt af op 31 december 2023 en bepaalt geen loonsverhoging per 1 januari 2024 [1].",
      "",
      "Vanaf 1 januari 2024 geldt dus geen cao meer uit deze documenten, en daarmee ook geen automatische loonsverhoging op die datum.",
    ].join("\n");
    assert.equal(answerRefuses(prose, NOT_FOUND_MESSAGE), true);
  });

  it("does not treat a scope-negation that then grants an adjacent entitlement as a refusal (etd-032)", () => {
    // Same artefact. First sentence is the etd-025 shape; the second assigns travel reimbursement
    // from the reiskosten distractor. A regex that only looks for "staat geen" would green this
    // without the prompt collision being fixed — the same form as the truncation-split we refused.
    const prose = [
      "In deze CAO staat geen regeling voor een fietsplan of een vaste fietsvergoeding [1].",
      "",
      "De CAO regelt alleen een vergoeding voor reizen die verder gaan dan het normale woon-werkverkeer, en dan alleen als je daarvoor toestemming of opdracht krijgt van je werkgever [1].",
    ].join("\n");
    assert.equal(answerRefuses(prose, NOT_FOUND_MESSAGE), false);
  });

  it("does not treat an in-corpus documented no as a refusal (etd-009)", () => {
    const prose =
      "Nee, voor het normale woon-werkverkeer bestaat geen recht op vergoeding. Alleen als je voor het werk verder moet reizen dan de gebruikelijke woon-werkafstand, krijg je voor dat extra deel een vergoeding.";
    assert.equal(answerRefuses(prose, NOT_FOUND_MESSAGE), false);
  });
});

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
    }, parseJudgeOutput);
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
    }, parseJudgeOutput);

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
      }, parseJudgeOutput),
    );
    assert.equal(calls, 2);
  });
});

describe("scoreCitationVerification — refusal prose scores the delivered output (§22)", () => {
  const refusalCase: GoldenCase = {
    id: "test-refusal",
    question: "Hoeveel weken zwangerschapsverlof krijg ik?",
    expectedPassageIds: [],
    distractorPassageIds: ["distractor-1"],
    referenceAnswer: "Refuse: the fact is absent from the near-miss distractor.",
    category: "refusal",
  };
  const passages: GoldenPassage[] = [
    {
      id: "distractor-1",
      source: "test",
      content: "Artikel over verlof zonder het exacte aantal weken.",
      chunkType: "text",
    },
  ];

  it("returns the pre-sentinel refusal prose, discarding a runaway post-sentinel tail", () => {
    // The generator refuses correctly, then runs away past the sentinel and dumps few-shot-example
    // markdown containing "16 weken" (etd-026, finishReason=length). The pipeline strips that tail, so
    // the gate must score only the delivered refusal — not the discarded numbers.
    const raw = [
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem contact op met je fonds.",
      "",
      "<<<CITATIONS>>>",
      "[]",
      "",
      "+++++ voorbeelden/cao-assistent/12.md",
      "Je hebt recht op ten minste 16 weken zwangerschapsverlof [1].",
    ].join("\n");

    const result = scoreCitationVerification(raw, refusalCase, passages);
    assert.equal(result.verification, 1);
    assert.doesNotMatch(result.prose, /16 weken/);
    assert.match(result.prose, /niet terugvinden/);
  });

  it("keeps an ungrounded fact in the prose when a refusal case WRONGLY answers (still catchable)", () => {
    // The alignment fix must not hide under-refusal-with-fabrication: a wrong answer keeps its invented
    // number in the pre-sentinel prose, so the downstream hard-hallucination scorer can still flag it.
    const raw = [
      "Je hebt recht op ten minste 16 weken zwangerschapsverlof [1].",
      "",
      "<<<CITATIONS>>>",
      '[{"marker":1,"chunk_id":"distractor-1","quote":"Artikel over verlof"}]',
    ].join("\n");

    const result = scoreCitationVerification(raw, refusalCase, passages);
    assert.match(result.prose, /16 weken/);
  });
});

describe("aggregateScores — answerable-only soft metrics (actie 6 + 2026-08-22)", () => {
  function caseScore(overrides: Partial<CaseScores>): CaseScores {
    return {
      hardHallucination: 1,
      faithfulness: 1,
      relevance: 1,
      citationCorrectness: 1,
      completeness: 1,
      refusalCalibration: 1,
      citationVerification: 1,
      orphanRate: 0,
      danglingMarkerRate: 0,
      refused: false,
      category: "in_scope",
      ...overrides,
    };
  }

  it("averages citationCorrectness over ANSWERABLE cases only (refusals excluded)", () => {
    const scores: CaseScores[] = [
      caseScore({ category: "in_scope", citationCorrectness: 0.6 }),
      caseScore({ category: "in_scope", citationCorrectness: 0.8 }),
      // Correct refusals score a vacuous 1.0; they must NOT lift the answerable-case mean.
      caseScore({ category: "refusal", refused: true, citationCorrectness: 1 }),
      caseScore({ category: "refusal", refused: true, citationCorrectness: 1 }),
    ];
    const aggregate = aggregateScores(scores);
    // Answerable-only mean = (0.6 + 0.8) / 2 = 0.7, NOT (0.6 + 0.8 + 1 + 1) / 4 = 0.85.
    assert.equal(aggregate.citationCorrectness, 0.7);
  });

  it("returns 0 citationCorrectness when there are no answerable cases", () => {
    const aggregate = aggregateScores([caseScore({ category: "refusal", refused: true, citationCorrectness: 1 })]);
    assert.equal(aggregate.citationCorrectness, 0);
  });

  it("does not let an allowed under-refusal zero faithfulness/relevance/completeness", () => {
    // Mirrors the 2026-08-22 PR-hot-path fail: under-refusal count ≤ 1 is allowed, but copying
    // refusalCalibration=0 onto faith/rel/complete and averaging over all cases dropped relevance
    // 0.002 below baseline−tolerance. Refusal quality stays on refusalCalibration + the count gate.
    const scores: CaseScores[] = [
      caseScore({ category: "in_scope", faithfulness: 1, relevance: 0.95, completeness: 0.9 }),
      caseScore({ category: "in_scope", faithfulness: 1, relevance: 0.95, completeness: 0.9 }),
      caseScore({
        category: "refusal",
        refused: false,
        refusalCalibration: 0,
        faithfulness: 0,
        relevance: 0,
        completeness: 0,
      }),
    ];
    const aggregate = aggregateScores(scores);
    assert.equal(aggregate.faithfulness, 1);
    assert.equal(aggregate.relevance, 0.95);
    assert.equal(aggregate.completeness, 0.9);
    // refusalCalibration still averages over ALL cases: (1 + 1 + 0) / 3.
    assert.equal(aggregate.refusalCalibration, 2 / 3);
    assert.equal(aggregate.underRefusalCount, 1);
  });

  it("does not let a correct refusal lift faithfulness/relevance/completeness", () => {
    const scores: CaseScores[] = [
      caseScore({
        category: "in_scope",
        faithfulness: 0.6,
        relevance: 0.6,
        completeness: 0.6,
        refusalCalibration: 0.6,
      }),
      caseScore({
        category: "refusal",
        refused: true,
        refusalCalibration: 1,
        faithfulness: 1,
        relevance: 1,
        completeness: 1,
      }),
    ];
    const aggregate = aggregateScores(scores);
    assert.equal(aggregate.faithfulness, 0.6);
    assert.equal(aggregate.relevance, 0.6);
    assert.equal(aggregate.completeness, 0.6);
    // refusalCalibration still averages over ALL cases: (0.6 + 1) / 2.
    assert.equal(aggregate.refusalCalibration, 0.8);
  });

  it("returns 0 faithfulness/relevance/completeness when there are no answerable cases", () => {
    const aggregate = aggregateScores([
      caseScore({
        category: "refusal",
        refused: true,
        refusalCalibration: 1,
        faithfulness: 1,
        relevance: 1,
        completeness: 1,
      }),
    ]);
    assert.equal(aggregate.faithfulness, 0);
    assert.equal(aggregate.relevance, 0);
    assert.equal(aggregate.completeness, 0);
    assert.equal(aggregate.refusalCalibration, 1);
  });
});
