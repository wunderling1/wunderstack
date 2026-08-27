"use server";

import {
  ConfirmationMismatchError,
  getInstance,
  rotateTenantKey,
  updateTenantConfig,
} from "@wunderstack/db";
import { agentKeySchema, tenantTextsSchema } from "@wunderstack/shared";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/assert-admin";
import { updateFundConfigCache } from "@/lib/config-cache";
import { parseFundKey } from "@/lib/route-params";

export type FormErrorState = { ok: false; error: string } | { ok: true } | null;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalStr(value: FormDataEntryValue | null): string | undefined {
  const text = str(value);
  return text.length > 0 ? text : undefined;
}

function revalidateAgent(fundKey: string, agentKey: string): void {
  updateFundConfigCache(fundKey, agentKey);
  revalidatePath(`/admin/funds/${fundKey}/agents/${agentKey}`);
  revalidatePath(`/admin/funds/${fundKey}/agents/${agentKey}/distribution`);
  revalidatePath(`/admin/funds/${fundKey}/agents/${agentKey}/texts`);
  revalidatePath(`/admin/funds/${fundKey}/agents/${agentKey}/scenarios`);
  revalidatePath(`/admin/funds/${fundKey}/agents`);
}

export async function rotateInstanceKeyAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(str(formData.get("fundKey")));
  const parsed = agentKeySchema.safeParse(str(formData.get("agentKey")).toLowerCase());
  const confirmation = str(formData.get("confirmation")).toLowerCase();
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!parsed.success) return { ok: false, error: "Ongeldige agent." };
  const agentKey = parsed.data;
  try {
    if (confirmation !== agentKey) {
      throw new ConfirmationMismatchError();
    }
    await rotateTenantKey(fundKey, agentKey);
    revalidateAgent(fundKey, agentKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof ConfirmationMismatchError) {
      return {
        ok: false,
        error: `Typ de agentsleutel "${agentKey}" exact om te bevestigen. Bestaande snippets werken daarna niet meer.`,
      };
    }
    console.error("[rotateInstanceKeyAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Roteren mislukt. Zie de serverlog." };
  }
}

export async function updateCorsAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(str(formData.get("fundKey")));
  const parsed = agentKeySchema.safeParse(str(formData.get("agentKey")).toLowerCase());
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!parsed.success) return { ok: false, error: "Ongeldige agent." };
  const agentKey = parsed.data;
  const corsAllowlist = String(formData.get("corsAllowlist") ?? "")
    .split(/[\n,]/)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  try {
    await updateTenantConfig({ tenantId: fundKey, agentKey, corsAllowlist });
    revalidateAgent(fundKey, agentKey);
    return { ok: true };
  } catch (error) {
    console.error("[updateCorsAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Opslaan mislukt. Zie de serverlog." };
  }
}

export async function updateTextsAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(str(formData.get("fundKey")));
  const parsed = agentKeySchema.safeParse(str(formData.get("agentKey")).toLowerCase());
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!parsed.success) return { ok: false, error: "Ongeldige agent." };
  const agentKey = parsed.data;

  const startersRaw = str(formData.get("starters"));
  const starters = startersRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  try {
    const existing = await getInstance(fundKey, agentKey);
    const existingTexts = tenantTextsSchema.parse(existing?.texts ?? {});
    const texts = tenantTextsSchema.parse({
      ...existingTexts,
      tagline: optionalStr(formData.get("tagline")),
      intro: optionalStr(formData.get("intro")),
      article50: optionalStr(formData.get("article50")),
      starters: starters.length > 0 ? starters : undefined,
    });
    // Explicit empty starters clears the list when the textarea is blank.
    const next = { ...texts };
    if (starters.length === 0) {
      delete next.starters;
    }
    await updateTenantConfig({ tenantId: fundKey, agentKey, texts: next });
    revalidateAgent(fundKey, agentKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return { ok: false, error: "Controleer de tekstvelden." };
    }
    console.error("[updateTextsAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Opslaan mislukt. Zie de serverlog." };
  }
}
