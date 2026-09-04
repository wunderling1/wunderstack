import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyRoleplayScenarioDraft, type RoleplayScenarioDraft } from "@wunderstack/shared";

import { nextScenarioVersion, scenarioContentFingerprint } from "./roleplay-scenarios";

function sample(overrides: Partial<RoleplayScenarioDraft> = {}): RoleplayScenarioDraft {
  return {
    ...emptyRoleplayScenarioDraft(),
    title: "Klachtgesprek",
    partnerRole: "klant",
    userRole: "medewerker",
    persona: "Jij speelt de rol van een klant.",
    contextDescription: "Late levering.",
    learningObjective: "De-escaleren.",
    openingLine: "Dit duurt veel te lang.",
    briefing: "Oefen een klachtgesprek.",
    ...overrides,
  };
}

describe("nextScenarioVersion", () => {
  it("stays put when only status changes — snapshots must not be rewritten for a publish click", () => {
    const draft = sample({ status: "draft" });
    const published = sample({ status: "published" });
    assert.equal(scenarioContentFingerprint(draft), scenarioContentFingerprint(published));
    assert.equal(nextScenarioVersion(3, draft, published), 3);
  });

  it("bumps when authored text changes", () => {
    const previous = sample();
    const next = sample({ openingLine: "Andere openingszin." });
    assert.equal(nextScenarioVersion(1, previous, next), 2);
  });

  it("bumps when the rubric changes", () => {
    const previous = sample();
    const next = sample({
      rubric: {
        ...previous.rubric,
        criteria: [
          { question: "Nieuwe vraag", description: "", weight: 4, behavioralIndicators: [] },
        ],
      },
    });
    assert.equal(nextScenarioVersion(4, previous, next), 5);
  });

  it("does not bump when the same content is saved again", () => {
    const draft = sample({ status: "published" });
    assert.equal(nextScenarioVersion(2, draft, { ...draft }), 2);
  });
});
