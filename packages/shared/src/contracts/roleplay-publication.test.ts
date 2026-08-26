import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { publicationIssues } from "./roleplay-publication.js";
import { emptyRoleplayScenarioDraft, type RoleplayScenarioDraft } from "./roleplay-scenario.js";

function publishable(): RoleplayScenarioDraft {
  return {
    ...emptyRoleplayScenarioDraft(),
    title: "Klachtgesprek",
    partnerRole: "ontevreden klant",
    userRole: "medewerker klantenservice",
    persona: "Jij speelt de rol van een ontevreden klant die al drie weken wacht op een levering.",
    contextDescription: "De klant belt over een late levering.",
    learningObjective: "De deelnemer de-escaleert zonder beloftes die hij niet kan waarmaken.",
    openingLine: "Ik bel nu al voor de derde keer en niemand doet iets!",
    briefing: "Je oefent een klachtgesprek. De AI speelt de klant.",
    rubric: {
      criteria: [{ question: "Vraagt de deelnemer door?", description: "", weight: 3, behavioralIndicators: [] }],
      reviewPrompt: "",
      passThreshold: 5.5,
    },
  };
}

describe("publicationIssues", () => {
  it("returns nothing for a complete scenario", () => {
    assert.deepEqual(publicationIssues(publishable()), []);
  });

  it("lists every missing required field", () => {
    const issues = publicationIssues(emptyRoleplayScenarioDraft());
    assert.ok(issues.includes("Titel ontbreekt."));
    assert.ok(issues.includes("De rol van de AI ontbreekt."));
    assert.ok(issues.includes("De rol van de deelnemer ontbreekt."));
    assert.ok(issues.includes("De persona-instructie ontbreekt."));
    assert.ok(issues.includes("De situatiebeschrijving ontbreekt."));
    assert.ok(issues.includes("Het leerdoel ontbreekt."));
    assert.ok(issues.includes("De openingszin ontbreekt."));
    assert.ok(issues.includes("De briefing voor de deelnemer ontbreekt."));
    assert.ok(issues.includes("De rubriek heeft geen criterium met een vraag."));
  });

  it("rejects 'Je bent' persona framing unless the role-play phrasing is also present", () => {
    const draft = publishable();
    draft.persona = "Je bent Marie, een boze klant.";
    assert.ok(
      publicationIssues(draft).includes(
        'Zet de persona in de vorm "Jij speelt de rol van …", niet "Je bent …".',
      ),
    );
  });

  it("accepts a persona that uses the required role-play phrasing", () => {
    const draft = publishable();
    draft.persona = "Jij speelt de rol van Marie. Je bent kortaf als de deelnemer beloftes doet.";
    assert.deepEqual(publicationIssues(draft), []);
  });

  it("treats whitespace-only rubric questions as missing", () => {
    const draft = publishable();
    draft.rubric.criteria = [{ question: "   ", description: "", weight: 3, behavioralIndicators: [] }];
    assert.ok(publicationIssues(draft).includes("De rubriek heeft geen criterium met een vraag."));
  });
});
