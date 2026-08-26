import {
  ROLEPLAY_DIFFICULTIES,
  roleplayScenarioDraftSchema,
  roleplayScenarioSlugSchema,
  type RoleplayDifficultyMap,
  type RoleplayScenarioDraft,
} from "@wunderstack/shared";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseDifficulties(formData: FormData): RoleplayDifficultyMap {
  const difficulties: RoleplayDifficultyMap = {};
  for (const level of ROLEPLAY_DIFFICULTIES) {
    const conversationPrompt = str(formData.get(`difficulty_${level}_conversation`));
    const reviewPrompt = str(formData.get(`difficulty_${level}_review`));
    if (conversationPrompt || reviewPrompt) {
      difficulties[level] = { conversationPrompt, reviewPrompt };
    }
  }
  return difficulties;
}

export type ParsedRoleplayForm =
  | { ok: true; slug: string; draft: RoleplayScenarioDraft }
  | { ok: false; error: string };

/**
 * Turn the authoring form's FormData into a draft. Rubric travels as one JSON hidden field so
 * adding a criterion does not invent a new name-index convention. Common pitfalls are a
 * one-item-per-line textarea; per-criterion indicators live inside the rubric JSON.
 */
export function parseRoleplayForm(formData: FormData): ParsedRoleplayForm {
  const slugResult = roleplayScenarioSlugSchema.safeParse(str(formData.get("slug")).toLowerCase());
  if (!slugResult.success) {
    return {
      ok: false,
      error: "Ongeldige slug. Gebruik alleen kleine letters, cijfers en koppeltekens.",
    };
  }

  let rubricUnknown: unknown;
  try {
    rubricUnknown = JSON.parse(str(formData.get("rubric")) || "null");
  } catch {
    return { ok: false, error: "De rubriek is ongeldig." };
  }

  const maxTurns = Number.parseInt(str(formData.get("maxTurns")), 10);

  const parsed = roleplayScenarioDraftSchema.safeParse({
    title: str(formData.get("title")),
    description: str(formData.get("description")),
    partnerRole: str(formData.get("partnerRole")),
    userRole: str(formData.get("userRole")),
    userTitle: str(formData.get("userTitle")),
    persona: str(formData.get("persona")),
    contextDescription: str(formData.get("contextDescription")),
    hiddenInformation: str(formData.get("hiddenInformation")),
    learningObjective: str(formData.get("learningObjective")),
    secondaryObjective: str(formData.get("secondaryObjective")),
    commonPitfalls: lines(str(formData.get("commonPitfalls"))),
    instructions: str(formData.get("instructions")),
    openingLine: str(formData.get("openingLine")),
    endCondition: str(formData.get("endCondition")),
    maxTurns: Number.isFinite(maxTurns) ? maxTurns : Number.NaN,
    briefing: str(formData.get("briefing")),
    rubric: rubricUnknown,
    difficulties: parseDifficulties(formData),
    status: str(formData.get("status")) || "draft",
  });

  if (!parsed.success) {
    return { ok: false, error: "Controleer de velden. Een waarde valt buiten het toegestane bereik." };
  }

  const draft: RoleplayScenarioDraft = {
    ...parsed.data,
    rubric: {
      ...parsed.data.rubric,
      criteria: parsed.data.rubric.criteria.map((criterion) => ({
        ...criterion,
        behavioralIndicators: criterion.behavioralIndicators
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      })),
    },
  };

  return { ok: true, slug: slugResult.data, draft };
}
