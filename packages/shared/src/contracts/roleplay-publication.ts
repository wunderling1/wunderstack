import type { RoleplayScenarioDraft } from "./roleplay-scenario.js";

/**
 * Reasons a scenario cannot leave draft. Empty list means `status = published` is allowed.
 *
 * Required fields match what a learner session actually needs: a persona that can speak, a
 * situation, an opening line, a briefing the participant reads *before* that line, and at least
 * one rubric question the reviewer can score. The briefing is learner-only (never sent to the
 * model) but without it the start screen has nothing to show.
 *
 * "Je bent X" as persona framing is rejected because the model then addresses the *learner* as X
 * (Qonvo migration 058_fix_persona_role_framing). "Jij speelt de rol van …" is the required shape.
 */
export function publicationIssues(draft: RoleplayScenarioDraft): string[] {
  const issues: string[] = [];

  if (!draft.title.trim()) issues.push("Titel ontbreekt.");
  if (!draft.partnerRole.trim()) issues.push("De rol van de AI ontbreekt.");
  if (!draft.userRole.trim()) issues.push("De rol van de deelnemer ontbreekt.");
  if (!draft.persona.trim()) issues.push("De persona-instructie ontbreekt.");
  if (!draft.contextDescription.trim()) issues.push("De situatiebeschrijving ontbreekt.");
  if (!draft.learningObjective.trim()) issues.push("Het leerdoel ontbreekt.");
  if (!draft.openingLine.trim()) issues.push("De openingszin ontbreekt.");
  if (!draft.briefing.trim()) issues.push("De briefing voor de deelnemer ontbreekt.");

  const persona = draft.persona.trim();
  if (persona && /\bje bent\b/i.test(persona) && !/jij speelt de rol van/i.test(persona)) {
    issues.push('Zet de persona in de vorm "Jij speelt de rol van …", niet "Je bent …".');
  }

  const scored = draft.rubric.criteria.filter((criterion) => criterion.question.trim().length > 0);
  if (scored.length === 0) {
    issues.push("De rubriek heeft geen criterium met een vraag.");
  }

  return issues;
}
