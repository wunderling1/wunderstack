import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRoleplayAgent } from "./agent.js";
import { scenarioFixture } from "./scenario-fixture.js";
import type { RoleplayMessage, RoleplayModelCall } from "./types.js";
import { ROLEPLAY_PROMPT_VERSION } from "./version.js";

interface Captured {
  branch: string;
  system: string;
  user: string;
  sessionId?: string;
}

/** Records what the agent asked for and returns a canned response. No network, no database. */
function stubModel(response: string): { call: RoleplayModelCall; calls: Captured[] } {
  const calls: Captured[] = [];
  const call: RoleplayModelCall = ({ branch, system, user, sessionId }) => {
    calls.push({ branch, system, user, ...(sessionId === undefined ? {} : { sessionId }) });
    return Promise.resolve({
      text: response,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: "mistral-large-2512",
    });
  };
  return { call, calls };
}

/** Same, but a different response per call — for the review branch's single parse-retry. */
function stubModelSequence(responses: string[]): { call: RoleplayModelCall; calls: Captured[] } {
  const calls: Captured[] = [];
  const call: RoleplayModelCall = ({ branch, system, user, sessionId }) => {
    const text = responses[calls.length] ?? responses.at(-1) ?? "";
    calls.push({ branch, system, user, ...(sessionId === undefined ? {} : { sessionId }) });
    return Promise.resolve({
      text,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: "mistral-large-2512",
    });
  };
  return { call, calls };
}

const REVIEW_RESPONSE = JSON.stringify({
  feedback: [
    { question: "Vraagt de deelnemer door?", answer: "Sterk doorgevraagd.", score: 8 },
    { question: "Vat de deelnemer samen?", answer: "Geen samenvatting.", score: 3 },
  ],
  feedbackSummary: "Een redelijk gesprek.\n\n### Was dit een goed gesprek of niet?\nDeels.",
  isPassed: true,
  scores: [
    { criterion: "Vraagt de deelnemer door?", score: 8 },
    { criterion: "Vat de deelnemer samen?", score: 3 },
  ],
});

describe("openingLine", () => {
  it("returns the parsed opening and stamps the prompt version", async () => {
    const { call, calls } = stubModel('{"text":"Ik bel over die afwijzing."}');
    const result = await createRoleplayAgent({ generate: call }).openingLine({
      scenario: scenarioFixture(),
    });

    assert.equal(result.text, "Ik bel over die afwijzing.");
    assert.equal(result.promptVersion, ROLEPLAY_PROMPT_VERSION);
    assert.equal(result.model, "mistral-large-2512");
    assert.equal(calls[0]?.branch, "opening");
  });

  it("tolerates the model fencing its JSON", async () => {
    const { call } = stubModel('```json\n{"text":"Hallo."}\n```');
    const result = await createRoleplayAgent({ generate: call }).openingLine({
      scenario: scenarioFixture(),
    });
    assert.equal(result.text, "Hallo.");
  });

  it("forwards the session id so the turn joins one Langfuse trace", async () => {
    const { call, calls } = stubModel('{"text":"Hallo."}');
    await createRoleplayAgent({ generate: call }).openingLine(
      { scenario: scenarioFixture() },
      { sessionId: "session-1" },
    );
    assert.equal(calls[0]?.sessionId, "session-1");
  });
});

describe("nextTurn", () => {
  const history: RoleplayMessage[] = [
    { role: "assistant", content: "Eindelijk iemand." },
    { role: "user", content: "Waar gaat het over?" },
  ];

  it("returns the persona reply and its own end signal", async () => {
    const { call } = stubModel('{"text":"Dit duurt te lang.","conversationEnd":false}');
    const result = await createRoleplayAgent({ generate: call }).nextTurn({
      scenario: scenarioFixture(),
      history,
      message: "Wat vervelend voor u.",
      isClosingTurn: false,
    });

    assert.equal(result.text, "Dit duurt te lang.");
    assert.equal(result.conversationEnd, false);
    assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("ends the conversation on the closing turn even when the model says otherwise", async () => {
    // The turn budget belongs to the runtime. A persona that forgets the flag cannot extend it.
    const { call } = stubModel('{"text":"Ik denk er nog over na.","conversationEnd":false}');
    const result = await createRoleplayAgent({ generate: call }).nextTurn({
      scenario: scenarioFixture(),
      history,
      message: "Zullen we een afspraak maken?",
      isClosingTurn: true,
    });
    assert.equal(result.conversationEnd, true);
  });

  it("puts the history in the user message and the persona in the system prompt", async () => {
    const { call, calls } = stubModel('{"text":"Ja.","conversationEnd":false}');
    await createRoleplayAgent({ generate: call }).nextTurn({
      scenario: scenarioFixture(),
      history,
      message: "Wat vervelend voor u.",
      isClosingTurn: false,
    });

    const captured = calls[0];
    assert.match(captured?.user ?? "", /Gesprekshistorie \(laatste beurten\):/);
    assert.match(captured?.user ?? "", /Klantadviseur: "Wat vervelend voor u\."/);
    assert.match(captured?.system ?? "", /## Persona/);
  });

  it("windows a long history so the turn prompt does not grow without bound", async () => {
    const long: RoleplayMessage[] = Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `bericht ${String(index)}`,
    }));
    const { call, calls } = stubModel('{"text":"Ja.","conversationEnd":false}');
    await createRoleplayAgent({ generate: call }).nextTurn({
      scenario: scenarioFixture(),
      history: long,
      message: "En?",
      isClosingTurn: false,
    });

    const user = calls[0]?.user ?? "";
    assert.doesNotMatch(user, /bericht 0\b/);
    assert.match(user, /bericht 59/);
  });

  it("throws on a response that carries no JSON, rather than storing prose as a reply", async () => {
    const { call } = stubModel("Sorry, ik kan hier niet aan meewerken.");
    await assert.rejects(
      createRoleplayAgent({ generate: call }).nextTurn({
        scenario: scenarioFixture(),
        history,
        message: "Hoi",
        isClosingTurn: false,
      }),
      /no JSON object/,
    );
  });

  it("retries an empty response once, so a provider hiccup does not eat a claimed turn", async () => {
    // Measured, not hypothetical: a nulmeting turn came back with empty text. Under R9 the turn was
    // already spent, so without this the learner pays for a beurt they never received.
    const { call, calls } = stubModelSequence(["", '{"text":"Nou zeg.","conversationEnd":false}']);
    const result = await createRoleplayAgent({ generate: call }).nextTurn({
      scenario: scenarioFixture(),
      history,
      message: "Hoi",
      isClosingTurn: false,
    });

    assert.equal(result.text, "Nou zeg.");
    assert.equal(calls.length, 2);
    assert.match(calls[1]?.user ?? "", /Je vorige antwoord was leeg\./);
    // The retry keeps the learner's message, or the persona answers a question it can no longer see.
    assert.match(calls[1]?.user ?? "", /Klantadviseur: "Hoi"/);
  });
});

describe("reviewSession", () => {
  it("computes the weighted score itself instead of trusting the model", async () => {
    const { call } = stubModel(REVIEW_RESPONSE);
    const result = await createRoleplayAgent({ generate: call }).reviewSession({
      scenario: scenarioFixture(),
      history: [{ role: "user", content: "hoi" }],
      endReason: "completed",
    });

    // 8 × 0.60 + 3 × 0.40 = 6.0
    assert.equal(result.weightedScore, 6);
    assert.equal(result.passed, true);
  });

  it("derives passed from the threshold, not from the model's claim", async () => {
    const lowScores = JSON.stringify({
      feedback: [
        { question: "Vraagt de deelnemer door?", answer: "Zwak.", score: 3 },
        { question: "Vat de deelnemer samen?", answer: "Niet gedaan.", score: 2 },
      ],
      // The model insists the participant passed; 2.6 is below the 5.5 threshold.
      feedbackSummary: "…",
      isPassed: true,
    });
    const { call } = stubModel(lowScores);
    const result = await createRoleplayAgent({ generate: call }).reviewSession({
      scenario: scenarioFixture(),
      history: [],
      endReason: "completed",
    });

    assert.equal(result.weightedScore, 2.6);
    assert.equal(result.passed, false);
    assert.equal(result.modelReportedPassed, true);
  });

  it("normalises the criteria onto the authored rubric", async () => {
    const { call } = stubModel(REVIEW_RESPONSE);
    const result = await createRoleplayAgent({ generate: call }).reviewSession({
      scenario: scenarioFixture(),
      history: [],
      endReason: "completed",
    });

    // The stub answered with the shortened question "Vraagt de deelnemer door?"; normalisation
    // replaces it with the authored wording, which is what makes reviews comparable across sessions.
    assert.deepEqual(
      result.criteria.map((item) => ({ question: item.question, score: item.score, weight: item.weight })),
      [
        { question: "Vraagt de deelnemer door op weerstand?", score: 8, weight: 60 },
        { question: "Vat de deelnemer samen?", score: 3, weight: 40 },
      ],
    );
  });

  it("sends the whole transcript, unwindowed", async () => {
    const long: RoleplayMessage[] = Array.from({ length: 80 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `bericht ${String(index)}`,
    }));
    const { call, calls } = stubModel(REVIEW_RESPONSE);
    await createRoleplayAgent({ generate: call }).reviewSession({
      scenario: scenarioFixture(),
      history: long,
      endReason: "completed",
    });

    const user = calls[0]?.user ?? "";
    assert.match(user, /bericht 0\b/);
    assert.match(user, /bericht 79/);
    assert.equal(calls[0]?.branch, "review");
  });

  it("retries once when the review will not parse, and keeps the second answer", async () => {
    const { call, calls } = stubModelSequence(['{"feedback": [', REVIEW_RESPONSE]);
    const result = await createRoleplayAgent({ generate: call }).reviewSession({
      scenario: scenarioFixture(),
      history: [],
      endReason: "completed",
    });

    assert.equal(calls.length, 2);
    assert.match(calls[1]?.user ?? "", /kon niet worden gelezen als JSON/);
    assert.match(calls[1]?.user ?? "", /Verander de inhoud van je/);
    // The transcript must survive into the retry; without it the model invents a judgement.
    assert.match(calls[1]?.user ?? "", /# Gesprek transcript/);
    assert.equal(result.weightedScore, 6);
    // A retried review really did cost two calls; reporting one would understate it.
    assert.deepEqual(result.usage, { promptTokens: 20, completionTokens: 40, totalTokens: 60 });
  });

  it("gives up after one retry rather than looping on a model that will not comply", async () => {
    const { call, calls } = stubModelSequence(["nog steeds geen json", "en nu ook niet"]);
    await assert.rejects(
      createRoleplayAgent({ generate: call }).reviewSession({
        scenario: scenarioFixture(),
        history: [],
        endReason: "completed",
      }),
      /no JSON object/,
    );
    assert.equal(calls.length, 2);
  });

  it("tells the reviewer how the conversation ended", async () => {
    const { call, calls } = stubModel(REVIEW_RESPONSE);
    await createRoleplayAgent({ generate: call }).reviewSession({
      scenario: scenarioFixture(),
      history: [],
      endReason: "max_turns_reached",
    });
    assert.match(calls[0]?.system ?? "", /maximum aantal beurten/);
  });
});
