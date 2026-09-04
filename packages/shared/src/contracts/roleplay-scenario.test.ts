import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ROLEPLAY_DIFFICULTIES,
  ROLEPLAY_DIFFICULTY_LABELS,
  emptyRoleplayScenarioDraft,
  roleplayDifficultyMapSchema,
  roleplayEndReasonSchema,
  roleplayOriginSchema,
  roleplayRubricSchema,
  roleplayScenarioDraftSchema,
  roleplayScenarioSlugSchema,
  roleplayScenarioStatusSchema,
  rubricCriterionSchema,
} from "./roleplay-scenario";

describe("rubricCriterionSchema", () => {
  it("fills the optional fields so a minimal criterion is complete", () => {
    const parsed = rubricCriterionSchema.parse({ question: "Vraagt de deelnemer door?" });
    assert.equal(parsed.description, "");
    assert.equal(parsed.weight, 3);
    assert.deepEqual(parsed.behavioralIndicators, []);
  });

  it("keeps weight an importance rating, not a percentage", () => {
    assert.equal(rubricCriterionSchema.safeParse({ question: "q", weight: 5 }).success, true);
    assert.equal(rubricCriterionSchema.safeParse({ question: "q", weight: 6 }).success, false);
    assert.equal(rubricCriterionSchema.safeParse({ question: "q", weight: 0 }).success, false);
    assert.equal(rubricCriterionSchema.safeParse({ question: "q", weight: 2.5 }).success, false);
  });

  it("rejects an empty question — an unnamed criterion cannot be scored", () => {
    assert.equal(rubricCriterionSchema.safeParse({ question: "" }).success, false);
  });
});

describe("roleplayRubricSchema", () => {
  it("requires at least one criterion", () => {
    assert.equal(roleplayRubricSchema.safeParse({ criteria: [] }).success, false);
  });

  it("defaults the pass mark to the 0-10 scale the reviewer reports", () => {
    const parsed = roleplayRubricSchema.parse({ criteria: [{ question: "q" }] });
    assert.equal(parsed.passThreshold, 5.5);
    assert.equal(parsed.reviewPrompt, "");
  });

  it("rejects a threshold outside the reviewer's scale", () => {
    const criteria = [{ question: "q" }];
    assert.equal(roleplayRubricSchema.safeParse({ criteria, passThreshold: 11 }).success, false);
  });
});

describe("roleplayDifficultyMapSchema", () => {
  it("accepts an empty map — a scenario is playable without difficulty content", () => {
    assert.deepEqual(roleplayDifficultyMapSchema.parse({}), {});
  });

  it("accepts a single level without demanding the other two", () => {
    const parsed = roleplayDifficultyMapSchema.parse({
      expert: { conversationPrompt: "Wees kortaf.", reviewPrompt: "Beoordeel streng." },
    });
    assert.equal(parsed.expert?.conversationPrompt, "Wees kortaf.");
    assert.equal(parsed.basic, undefined);
  });

  it("rejects an unknown level", () => {
    assert.equal(roleplayDifficultyMapSchema.safeParse({ nightmare: {} }).success, false);
  });

  it("labels every level for the authoring UI", () => {
    for (const level of ROLEPLAY_DIFFICULTIES) {
      assert.ok(ROLEPLAY_DIFFICULTY_LABELS[level].length > 0);
    }
  });
});

describe("roleplayScenarioSlugSchema", () => {
  it("accepts the same alphabet as a fund key", () => {
    assert.equal(roleplayScenarioSlugSchema.safeParse("klachtgesprek").success, true);
    assert.equal(roleplayScenarioSlugSchema.safeParse("late-levering").success, true);
  });

  it("rejects uppercase, spaces, and leading hyphens", () => {
    assert.equal(roleplayScenarioSlugSchema.safeParse("Klacht").success, false);
    assert.equal(roleplayScenarioSlugSchema.safeParse("late levering").success, false);
    assert.equal(roleplayScenarioSlugSchema.safeParse("-oops").success, false);
  });
});

describe("roleplayScenarioDraftSchema", () => {
  it("accepts an empty draft so an author can save incomplete work", () => {
    const parsed = roleplayScenarioDraftSchema.parse(emptyRoleplayScenarioDraft());
    assert.equal(parsed.title, "");
    assert.equal(parsed.status, "draft");
    assert.equal(parsed.maxTurns, 12);
    assert.equal(parsed.rubric.criteria[0]?.question, "");
  });

  it("keeps behavioral indicators on criteria only — not as a scenario-level field", () => {
    const draft = emptyRoleplayScenarioDraft();
    assert.equal("behavioralIndicators" in draft, false);
    assert.ok(Array.isArray(draft.rubric.criteria[0]?.behavioralIndicators));
    assert.equal(
      roleplayScenarioDraftSchema.safeParse({
        ...draft,
        behavioralIndicators: ["scenario-level should be rejected"],
      }).success,
      false,
    );
  });

  it("rejects a maxTurns outside the CHECK range", () => {
    const draft = emptyRoleplayScenarioDraft();
    assert.equal(roleplayScenarioDraftSchema.safeParse({ ...draft, maxTurns: 0 }).success, false);
    assert.equal(roleplayScenarioDraftSchema.safeParse({ ...draft, maxTurns: 101 }).success, false);
  });
});

describe("lifecycle vocabularies", () => {
  it("matches the CHECK constraints in the database", () => {
    assert.equal(roleplayScenarioStatusSchema.safeParse("published").success, true);
    assert.equal(roleplayScenarioStatusSchema.safeParse("live").success, false);
    assert.equal(roleplayOriginSchema.safeParse("lti13").success, true);
    assert.equal(roleplayOriginSchema.safeParse("scorm").success, false);
    assert.equal(roleplayEndReasonSchema.safeParse("max_turns_reached").success, true);
    assert.equal(roleplayEndReasonSchema.safeParse("timeout").success, false);
  });
});
