import {
  roleplayScenarioDraftSchema,
  roleplayScenarioSlugSchema,
  type RoleplayScenarioDraft,
} from "@wunderstack/shared";
import { and, desc, eq } from "drizzle-orm";

import { getDb, getWriterDb } from "./client";
import { assertFundKey } from "./ident";
import {
  roleplayScenarios,
  type RoleplayScenario,
} from "./schema/control/roleplay-scenarios";

/**
 * Roleplay scenario data-access (`control.roleplay_scenarios`). Reads use the default connection;
 * writes use the tenant-config writer (same role as `updateTenantConfig`). This table is control
 * plane, not fund schema — apps may call these functions without crossing `no-apps-to-fund-schema`.
 *
 * Session snapshots live in the fund schema and are never rewritten here. A content change bumps
 * `version` so a finished session can still say which text it ran on.
 */

export class ScenarioSlugTakenError extends Error {
  readonly fundKey: string;
  readonly slug: string;

  constructor(fundKey: string, slug: string) {
    super(`Scenario slug ${JSON.stringify(slug)} already exists for fund ${JSON.stringify(fundKey)}.`);
    this.name = "ScenarioSlugTakenError";
    this.fundKey = fundKey;
    this.slug = slug;
  }
}

export class ScenarioNotFoundError extends Error {
  readonly fundKey: string;
  readonly slug: string;

  constructor(fundKey: string, slug: string) {
    super(`No scenario ${JSON.stringify(slug)} for fund ${JSON.stringify(fundKey)}.`);
    this.name = "ScenarioNotFoundError";
    this.fundKey = fundKey;
    this.slug = slug;
  }
}

/** Stable fingerprint of authored content. Status is lifecycle, not content — it does not bump version. */
export function scenarioContentFingerprint(draft: RoleplayScenarioDraft): string {
  return JSON.stringify({
    title: draft.title,
    description: draft.description,
    partnerRole: draft.partnerRole,
    userRole: draft.userRole,
    userTitle: draft.userTitle,
    persona: draft.persona,
    contextDescription: draft.contextDescription,
    hiddenInformation: draft.hiddenInformation,
    learningObjective: draft.learningObjective,
    secondaryObjective: draft.secondaryObjective,
    commonPitfalls: draft.commonPitfalls,
    instructions: draft.instructions,
    openingLine: draft.openingLine,
    endCondition: draft.endCondition,
    maxTurns: draft.maxTurns,
    briefing: draft.briefing,
    rubric: draft.rubric,
    difficulties: draft.difficulties,
  });
}

export function nextScenarioVersion(
  currentVersion: number,
  previous: RoleplayScenarioDraft,
  next: RoleplayScenarioDraft,
): number {
  return scenarioContentFingerprint(previous) === scenarioContentFingerprint(next)
    ? currentVersion
    : currentVersion + 1;
}

export function rowToDraft(row: RoleplayScenario): RoleplayScenarioDraft {
  return roleplayScenarioDraftSchema.parse({
    title: row.title,
    description: row.description,
    partnerRole: row.partnerRole,
    userRole: row.userRole,
    userTitle: row.userTitle,
    persona: row.persona,
    contextDescription: row.contextDescription,
    hiddenInformation: row.hiddenInformation,
    learningObjective: row.learningObjective,
    secondaryObjective: row.secondaryObjective,
    commonPitfalls: row.commonPitfalls,
    instructions: row.instructions,
    openingLine: row.openingLine,
    endCondition: row.endCondition,
    maxTurns: row.maxTurns,
    briefing: row.briefing,
    rubric: row.rubric,
    difficulties: row.difficulties,
    status: row.status,
  });
}

function draftToColumns(draft: RoleplayScenarioDraft) {
  return {
    title: draft.title,
    description: draft.description,
    partnerRole: draft.partnerRole,
    userRole: draft.userRole,
    userTitle: draft.userTitle,
    persona: draft.persona,
    contextDescription: draft.contextDescription,
    hiddenInformation: draft.hiddenInformation,
    learningObjective: draft.learningObjective,
    secondaryObjective: draft.secondaryObjective,
    commonPitfalls: draft.commonPitfalls,
    instructions: draft.instructions,
    openingLine: draft.openingLine,
    endCondition: draft.endCondition,
    maxTurns: draft.maxTurns,
    briefing: draft.briefing,
    rubric: draft.rubric,
    difficulties: draft.difficulties,
    status: draft.status,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return code === "23505";
}

export async function listScenarios(fundKey: string): Promise<RoleplayScenario[]> {
  const key = assertFundKey(fundKey);
  return getDb()
    .select()
    .from(roleplayScenarios)
    .where(eq(roleplayScenarios.fundKey, key))
    .orderBy(desc(roleplayScenarios.updatedAt));
}

export async function getScenario(
  fundKey: string,
  slug: string,
): Promise<RoleplayScenario | null> {
  const key = assertFundKey(fundKey);
  const parsedSlug = roleplayScenarioSlugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return null;
  }
  const [row] = await getDb()
    .select()
    .from(roleplayScenarios)
    .where(and(eq(roleplayScenarios.fundKey, key), eq(roleplayScenarios.slug, parsedSlug.data)))
    .limit(1);
  return row ?? null;
}

export async function createScenario(input: {
  fundKey: string;
  slug: string;
  draft: RoleplayScenarioDraft;
}): Promise<RoleplayScenario> {
  const fundKey = assertFundKey(input.fundKey);
  const slug = roleplayScenarioSlugSchema.parse(input.slug);
  const draft = roleplayScenarioDraftSchema.parse(input.draft);

  try {
    const [row] = await getWriterDb()
      .insert(roleplayScenarios)
      .values({
        fundKey,
        slug,
        ...draftToColumns(draft),
        version: 1,
      })
      .returning();
    if (!row) {
      throw new Error("createScenario returned no row");
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ScenarioSlugTakenError(fundKey, slug);
    }
    throw error;
  }
}

export async function updateScenario(input: {
  fundKey: string;
  slug: string;
  draft: RoleplayScenarioDraft;
}): Promise<RoleplayScenario> {
  const fundKey = assertFundKey(input.fundKey);
  const slug = roleplayScenarioSlugSchema.parse(input.slug);
  const draft = roleplayScenarioDraftSchema.parse(input.draft);

  const existing = await getScenario(fundKey, slug);
  if (!existing) {
    throw new ScenarioNotFoundError(fundKey, slug);
  }

  const version = nextScenarioVersion(existing.version, rowToDraft(existing), draft);
  const [row] = await getWriterDb()
    .update(roleplayScenarios)
    .set({
      ...draftToColumns(draft),
      version,
      updatedAt: new Date(),
    })
    .where(and(eq(roleplayScenarios.fundKey, fundKey), eq(roleplayScenarios.slug, slug)))
    .returning();
  if (!row) {
    throw new ScenarioNotFoundError(fundKey, slug);
  }
  return row;
}
