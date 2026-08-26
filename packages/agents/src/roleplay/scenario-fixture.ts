import type { RoleplayScenarioPrompt } from "./types.js";

/**
 * Test-only scenario builder. Not exported from the package barrel — nothing in production should
 * construct a scenario from defaults; the real one comes from `control.roleplay_scenarios`.
 */
export function scenarioFixture(
  overrides: Partial<RoleplayScenarioPrompt> = {},
): RoleplayScenarioPrompt {
  return {
    partnerRole: "een boze klant",
    userRole: "de klantadviseur",
    userTitle: "Klantadviseur",
    persona: "Jij speelt de rol van Sam, kortaf en ongeduldig.",
    contextDescription: "De klant belt over een afgewezen declaratie.",
    hiddenInformation: "De echte reden is dat Sam vorige week is ontslagen.",
    learningObjective: "Omgaan met weerstand zonder in de verdediging te schieten.",
    secondaryObjective: "Samenvatten voordat je een oplossing aanbiedt.",
    commonPitfalls: ["Meteen een oplossing aanbieden", "De klant onderbreken"],
    instructions: "- Blijf zakelijk, ook als de klant scheldt.",
    openingLine: "Begin met een klacht over de afwijzing.",
    endCondition: "Als de klant een vervolgafspraak accepteert",
    rubric: {
      criteria: [
        {
          question: "Vraagt de deelnemer door op weerstand?",
          description: "Let op open vragen.",
          behavioralIndicators: ["Stelt een open vraag", "Benoemt de emotie"],
          weight: 60,
        },
        {
          question: "Vat de deelnemer samen?",
          description: "",
          behavioralIndicators: [],
          weight: 40,
        },
      ],
      reviewPrompt: "Beoordeel dit gesprek als ervaren gesprekstrainer.",
      passThreshold: 5.5,
    },
    ...overrides,
  };
}
