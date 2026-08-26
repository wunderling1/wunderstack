"use server";

import {
  createScenario,
  ScenarioNotFoundError,
  ScenarioSlugTakenError,
  updateScenario,
} from "@wunderstack/db";
import { publicationIssues, type RoleplayScenarioDraft } from "@wunderstack/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/assert-admin";
import { parseRoleplayForm } from "@/lib/roleplay-form";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

export type ScenarioFormState = { ok: false; error: string } | { ok: true } | null;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function revalidateScenarios(fundKey: string, slug?: string): void {
  const base = `/admin/funds/${fundKey}/agents/roleplay`;
  revalidatePath(`${base}/scenarios`);
  revalidatePath(`${base}/scenarios/new`);
  revalidatePath(base);
  revalidatePath(`/admin/funds/${fundKey}/agents`);
  if (slug) {
    revalidatePath(`${base}/scenarios/${slug}`);
  }
}

function gate(formData: FormData): { fundKey: string } | { error: string } {
  const fundKey = parseFundKey(str(formData.get("fundKey")));
  const agentKey = parseAgentKey(str(formData.get("agentKey")).toLowerCase());
  if (!fundKey) return { error: "Ongeldige fondssleutel." };
  if (agentKey !== "roleplay") return { error: "Scenario's horen alleen bij de rollenspelagent." };
  return { fundKey };
}

/**
 * If the author asked to publish but the checks fail, keep the work as a draft and tell them why.
 * Losing a long form to a validation bounce is worse than a second save.
 */
function clampPublished(draft: RoleplayScenarioDraft): {
  draft: RoleplayScenarioDraft;
  blocked: string | null;
} {
  if (draft.status !== "published") {
    return { draft, blocked: null };
  }
  const issues = publicationIssues(draft);
  if (issues.length === 0) {
    return { draft, blocked: null };
  }
  return {
    draft: { ...draft, status: "draft" },
    blocked: `Opgeslagen als concept: ${issues.join(" ")}`,
  };
}

export async function createScenarioAction(
  _prev: ScenarioFormState,
  formData: FormData,
): Promise<ScenarioFormState> {
  await assertAdmin();
  const scoped = gate(formData);
  if ("error" in scoped) return { ok: false, error: scoped.error };

  const parsed = parseRoleplayForm(formData);
  if (!parsed.ok) return parsed;

  const { draft, blocked } = clampPublished(parsed.draft);
  try {
    await createScenario({ fundKey: scoped.fundKey, slug: parsed.slug, draft });
  } catch (error) {
    if (error instanceof ScenarioSlugTakenError) {
      return { ok: false, error: `De slug "${error.slug}" bestaat al voor dit fonds.` };
    }
    console.error("[createScenarioAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Opslaan mislukt. Zie de serverlog." };
  }

  revalidateScenarios(scoped.fundKey, parsed.slug);
  // Always leave /new after a successful insert: a retry would hit the unique slug.
  const notice = blocked ? "?notice=unpublished" : "";
  redirect(`/admin/funds/${scoped.fundKey}/agents/roleplay/scenarios/${parsed.slug}${notice}`);
}

export async function updateScenarioAction(
  _prev: ScenarioFormState,
  formData: FormData,
): Promise<ScenarioFormState> {
  await assertAdmin();
  const scoped = gate(formData);
  if ("error" in scoped) return { ok: false, error: scoped.error };

  const parsed = parseRoleplayForm(formData);
  if (!parsed.ok) return parsed;

  const { draft, blocked } = clampPublished(parsed.draft);
  try {
    await updateScenario({ fundKey: scoped.fundKey, slug: parsed.slug, draft });
  } catch (error) {
    if (error instanceof ScenarioNotFoundError) {
      return { ok: false, error: "Dit scenario bestaat niet meer." };
    }
    console.error("[updateScenarioAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Opslaan mislukt. Zie de serverlog." };
  }

  revalidateScenarios(scoped.fundKey, parsed.slug);
  if (blocked) {
    return { ok: false, error: blocked };
  }
  return { ok: true };
}
