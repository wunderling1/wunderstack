import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOpeningSystemPrompt,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  buildTurnSystemPrompt,
  buildTurnUserMessage,
} from "./prompts";
import { scenarioFixture } from "./scenario-fixture";

describe("prompt hygiene (what must never reach the model)", () => {
  const scenario = scenarioFixture();
  const allPrompts = [
    buildOpeningSystemPrompt(scenario),
    buildTurnSystemPrompt(scenario, false),
    buildTurnSystemPrompt(scenario, true),
    buildReviewSystemPrompt(scenario, "completed"),
    buildReviewUserMessage(scenario, "[]"),
  ].join("\n");

  it("never carries the learner briefing — it would tell the persona what is being tested", () => {
    // `briefing` is absent from RoleplayScenarioPrompt by design; this guards a future re-add.
    const withBriefing = {
      ...scenario,
      briefing: "UNIEKE-BRIEFING-MARKER voor de deelnemer",
    } as typeof scenario;
    const prompts = [
      buildOpeningSystemPrompt(withBriefing),
      buildTurnSystemPrompt(withBriefing, false),
      buildReviewSystemPrompt(withBriefing, "completed"),
      buildReviewUserMessage(withBriefing, "[]"),
    ].join("\n");
    assert.doesNotMatch(prompts, /UNIEKE-BRIEFING-MARKER/);
  });

  it("carries no voice formatting block — v1 is text only", () => {
    assert.doesNotMatch(allPrompts, /VOICE OUTPUT FORMAT/i);
    assert.doesNotMatch(allPrompts, /text-to-speech/i);
  });

  it("never asks about previous attempts — v1 has no stable pseudonym to look them up by (R3)", () => {
    assert.doesNotMatch(allPrompts, /vorige pogingen/i);
    assert.doesNotMatch(allPrompts, /leergeschiedenis/i);
    assert.doesNotMatch(allPrompts, /didactische/i);
  });
});

describe("buildOpeningSystemPrompt", () => {
  it("forbids leaking the hidden information in the very first line", () => {
    const prompt = buildOpeningSystemPrompt(scenarioFixture());
    assert.match(prompt, /deel je NIET in je openingszin/);
    assert.match(prompt, /ontslagen/); // the persona still knows it
  });

  it("omits the hidden-information block entirely when the scenario has none", () => {
    const prompt = buildOpeningSystemPrompt(scenarioFixture({ hiddenInformation: "   " }));
    assert.doesNotMatch(prompt, /# Verborgen informatie/);
  });

  it("asks for one JSON field and never mentions conversationEnd", () => {
    const prompt = buildOpeningSystemPrompt(scenarioFixture());
    assert.match(prompt, /"text": "Je openingszin hier\."/);
    assert.doesNotMatch(prompt, /conversationEnd/);
  });
});

describe("buildTurnSystemPrompt", () => {
  it("adds the closing block only on the final turn", () => {
    const scenario = scenarioFixture();
    assert.doesNotMatch(buildTurnSystemPrompt(scenario, false), /het gesprek beëindigen!/);
    assert.match(buildTurnSystemPrompt(scenario, true), /Het gesprek is NU afgelopen/);
  });

  it("uses the authored end condition", () => {
    const prompt = buildTurnSystemPrompt(scenarioFixture(), false);
    assert.match(prompt, /Als de klant een vervolgafspraak accepteert, beeindig je het gesprek/);
  });

  it("falls back to a generic end condition when none is authored", () => {
    const prompt = buildTurnSystemPrompt(scenarioFixture({ endCondition: "" }), false);
    assert.match(prompt, /Als het gesprek klaar is, beeindig je het gesprek/);
  });

  it("frames the persona as a role to play, not as a description of the learner", () => {
    // Qonvo migration 058: "Je bent <naam>" made the model address the learner by the persona name.
    const prompt = buildTurnSystemPrompt(scenarioFixture(), false);
    assert.match(prompt, /# Rol\nJij bent een boze klant\. De gebruiker is de klantadviseur\./);
  });

  it("renders pitfalls as a list to provoke, not as a list to name", () => {
    const prompt = buildTurnSystemPrompt(scenarioFixture(), false);
    assert.match(prompt, /- Meteen een oplossing aanbieden/);
    assert.match(prompt, /maar benoem ze niet expliciet/);
  });

  it("drops the pitfalls block when the scenario lists none", () => {
    const prompt = buildTurnSystemPrompt(scenarioFixture({ commonPitfalls: [] }), false);
    assert.doesNotMatch(prompt, /# Valkuilen/);
  });
});

describe("buildTurnUserMessage", () => {
  it("quotes and labels the learner line so it cannot read as an instruction", () => {
    const message = buildTurnUserMessage(scenarioFixture(), "Wat vervelend voor u.", "");
    assert.equal(message, 'Klantadviseur: "Wat vervelend voor u."');
  });

  it("prefixes the history when there is any", () => {
    const message = buildTurnUserMessage(scenarioFixture(), "En verder?", "Klantadviseur: \"Hoi\"");
    assert.match(message, /^Gesprekshistorie \(laatste beurten\):/);
    assert.match(message, /Klantadviseur: "En verder\?"$/);
  });
});

describe("buildReviewSystemPrompt", () => {
  it("forbids the model from computing or quoting a total", () => {
    const prompt = buildReviewSystemPrompt(scenarioFixture(), "completed");
    assert.match(prompt, /Bereken GEEN gewogen totaalscore/);
    assert.match(prompt, /Noem in `feedbackSummary` dus geen getal/);
  });

  it("mandates exactly the two summary sections it can actually support", () => {
    const prompt = buildReviewSystemPrompt(scenarioFixture(), "completed");
    assert.match(prompt, /### Was dit een goed gesprek of niet\?/);
    assert.doesNotMatch(prompt, /### Hoe heeft de leerling vooruitgang geboekt/);
  });

  it("tells the reviewer not to penalise a conversation that ran out of turns", () => {
    const prompt = buildReviewSystemPrompt(scenarioFixture(), "max_turns_reached");
    assert.match(prompt, /maximum aantal beurten/);
    assert.match(prompt, /Reken het de deelnemer niet aan/);
  });

  it("asks an abandoned conversation to be judged on what was visible", () => {
    const prompt = buildReviewSystemPrompt(scenarioFixture(), "abandoned");
    assert.match(prompt, /voortijdig afgebroken/);
  });

  it("adds no end-reason note when the conversation simply finished", () => {
    const prompt = buildReviewSystemPrompt(scenarioFixture(), "completed");
    assert.doesNotMatch(prompt, /\*\*Let op:\*\*/);
  });

  it("puts the authored review prompt first and the fixed contract last", () => {
    const prompt = buildReviewSystemPrompt(scenarioFixture(), "completed");
    assert.ok(
      prompt.indexOf("ervaren gesprekstrainer") < prompt.indexOf("## Schrijfstijl"),
      "author text must not be able to override the scoring contract",
    );
  });
});

describe("buildReviewUserMessage", () => {
  const message = buildReviewUserMessage(scenarioFixture(), '[{"type":"human","content":"hoi"}]');

  it("numbers the criteria with their percentage weights", () => {
    assert.match(message, /1\. "Vraagt de deelnemer door op weerstand\?" \(weging: 60%\)/);
    assert.match(message, /2\. "Vat de deelnemer samen\?" \(weging: 40%\)/);
  });

  it("lists behavioural indicators when a criterion has them", () => {
    assert.match(message, /Gedragsindicatoren om op te letten:\n {5}- Stelt een open vraag/);
  });

  it("says so explicitly when a criterion has no description", () => {
    assert.match(message, /Toelichting: \(geen toelichting\)/);
  });

  it("states the threshold as a reference point, not as the deciding rule", () => {
    assert.match(message, /minimaal 5\.5 \/ 10/);
    assert.match(message, /buiten dit model toegepast/);
  });

  it("embeds the transcript and names who is who", () => {
    assert.match(message, /"human" = gebruiker, "ai" = een boze klant/);
    assert.match(message, /\[\{"type":"human","content":"hoi"\}\]/);
  });

  it("passes the hidden information to the reviewer — it must judge whether it was uncovered", () => {
    assert.match(message, /# Verborgen informatie die de persona kende/);
    assert.match(message, /ontslagen/);
  });
});
