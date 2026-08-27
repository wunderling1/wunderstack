"use server";

import {
  ConsumerKeyTakenError,
  createLti11Consumer,
  deactivateLti11Consumer,
  generateLti11Credentials,
  Lti11ConsumerNotFoundError,
  setLti11GradePassback,
} from "@wunderstack/db";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/assert-admin";
import { updateFundConfigCache } from "@/lib/config-cache";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

export type LtiConsumerFormState =
  | { ok: false; error: string }
  | { ok: true; created?: { consumerKey: string; consumerSecret: string } }
  | null;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function gate(formData: FormData): { fundKey: string } | { error: string } {
  const fundKey = parseFundKey(str(formData.get("fundKey")));
  const agentKey = parseAgentKey(str(formData.get("agentKey")).toLowerCase());
  if (!fundKey) return { error: "Ongeldige fondssleutel." };
  if (agentKey !== "roleplay") return { error: "LTI hoort alleen bij de rollenspelagent." };
  return { fundKey };
}

function revalidateLti(fundKey: string): void {
  updateFundConfigCache(fundKey, "roleplay");
  const base = `/admin/funds/${fundKey}/agents/roleplay`;
  revalidatePath(`${base}/lti`);
  revalidatePath(base);
}

const CONSUMER_KEY_RE = /^[A-Za-z0-9._~-]{8,200}$/;

export async function createLtiConsumerAction(
  _prev: LtiConsumerFormState,
  formData: FormData,
): Promise<LtiConsumerFormState> {
  await assertAdmin();
  const scoped = gate(formData);
  if ("error" in scoped) return { ok: false, error: scoped.error };

  const name = str(formData.get("name"));
  if (name.length === 0 || name.length > 200) {
    return { ok: false, error: "Geef de koppeling een naam (max. 200 tekens)." };
  }

  const generated = generateLti11Credentials();
  const consumerKey = str(formData.get("consumerKey")) || generated.consumerKey;
  const consumerSecret = str(formData.get("consumerSecret")) || generated.consumerSecret;
  if (!CONSUMER_KEY_RE.test(consumerKey)) {
    return {
      ok: false,
      error: "De consumer key is 8–200 tekens: letters, cijfers, punt, streepje, underscore of tilde.",
    };
  }
  if (consumerSecret.length < 16 || consumerSecret.length > 500) {
    return { ok: false, error: "Het shared secret is minstens 16 tekens." };
  }

  try {
    const created = await createLti11Consumer({
      fundKey: scoped.fundKey,
      name,
      consumerKey,
      consumerSecret,
      gradePassbackEnabled: str(formData.get("gradePassbackEnabled")) === "on",
    });
    revalidateLti(scoped.fundKey);
    return {
      ok: true,
      created: { consumerKey: created.consumer.consumerKey, consumerSecret: created.consumerSecret },
    };
  } catch (error) {
    if (error instanceof ConsumerKeyTakenError) {
      return { ok: false, error: "Deze consumer key is al in gebruik." };
    }
    console.error("[createLtiConsumerAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "De koppeling kon niet worden opgeslagen." };
  }
}

export async function deactivateLtiConsumerAction(
  _prev: LtiConsumerFormState,
  formData: FormData,
): Promise<LtiConsumerFormState> {
  await assertAdmin();
  const scoped = gate(formData);
  if ("error" in scoped) return { ok: false, error: scoped.error };
  const id = str(formData.get("consumerId"));
  if (!id) return { ok: false, error: "Ontbrekende koppeling." };
  try {
    await deactivateLti11Consumer(scoped.fundKey, id);
    revalidateLti(scoped.fundKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof Lti11ConsumerNotFoundError) {
      return { ok: false, error: "Deze koppeling bestaat niet." };
    }
    console.error("[deactivateLtiConsumerAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "De koppeling kon niet worden uitgezet." };
  }
}

export async function setLtiGradePassbackAction(
  _prev: LtiConsumerFormState,
  formData: FormData,
): Promise<LtiConsumerFormState> {
  await assertAdmin();
  const scoped = gate(formData);
  if ("error" in scoped) return { ok: false, error: scoped.error };
  const id = str(formData.get("consumerId"));
  if (!id) return { ok: false, error: "Ontbrekende koppeling." };
  try {
    await setLti11GradePassback(scoped.fundKey, id, str(formData.get("enabled")) === "true");
    revalidateLti(scoped.fundKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof Lti11ConsumerNotFoundError) {
      return { ok: false, error: "Deze koppeling bestaat niet." };
    }
    console.error("[setLtiGradePassbackAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Cijferteruggave kon niet worden bijgewerkt." };
  }
}
