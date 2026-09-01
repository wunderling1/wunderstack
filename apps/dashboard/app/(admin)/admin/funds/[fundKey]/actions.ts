"use server";

import {
  addFundAgent,
  AgentInstanceExistsError,
  ConfirmationMismatchError,
  createFundUser,
  deactivateFund,
  DumpRequiredError,
  FUND_KEY_RE,
  FundInactiveError,
  FundNotFoundError,
  resetFundUserPassword,
  updateFundDisplayName,
  updateFundUserEmail,
  UserExistsError,
  UserNotFoundError,
} from "@wunderstack/db";
import { agentKeySchema } from "@wunderstack/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/assert-admin";
import { updateFundConfigCache } from "@/lib/config-cache";
import { generatePassword, hashPassword } from "@/lib/password";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseFundKey(formData: FormData): string | null {
  const fundKey = str(formData.get("fundKey")).toLowerCase();
  return FUND_KEY_RE.test(fundKey) ? fundKey : null;
}

export type FormErrorState = { ok: false; error: string } | { ok: true } | null;

export type PasswordOnceState =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string }
  | null;

export type AddAgentState =
  | { ok: true; agentKey: string; publicKey: string }
  | { ok: false; error: string }
  | null;

function revalidateFund(fundKey: string): void {
  updateFundConfigCache(fundKey);
  revalidatePath(`/admin/funds/${fundKey}`);
  revalidatePath(`/admin/funds/${fundKey}/agents`);
  revalidatePath(`/admin/funds/${fundKey}/instellingen`);
  revalidatePath("/instellingen");
  revalidatePath("/admin/funds");
}

export async function updateFundNameAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(formData);
  const name = str(formData.get("name"));
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!name) return { ok: false, error: "Vul een weergavenaam in." };
  try {
    await updateFundDisplayName({ fundKey, name });
    revalidateFund(fundKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof FundNotFoundError) {
      return { ok: false, error: "Fonds niet gevonden." };
    }
    console.error("[updateFundNameAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Opslaan mislukt. Zie de serverlog." };
  }
}

export async function addFundAgentAction(
  _prev: AddAgentState,
  formData: FormData,
): Promise<AddAgentState> {
  await assertAdmin();
  const fundKey = parseFundKey(formData);
  const parsed = agentKeySchema.safeParse(str(formData.get("agentKey")));
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!parsed.success) return { ok: false, error: "Ongeldige agent." };
  try {
    const result = await addFundAgent({ fundKey, agentKey: parsed.data });
    revalidateFund(fundKey);
    return { ok: true, agentKey: result.agentKey, publicKey: result.publicKey };
  } catch (error) {
    if (error instanceof AgentInstanceExistsError) {
      return { ok: false, error: `Agent "${error.agentKey}" bestaat al voor dit fonds.` };
    }
    if (error instanceof FundInactiveError) {
      return { ok: false, error: "Dit fonds is gedeactiveerd; er kunnen geen agents bij." };
    }
    if (error instanceof FundNotFoundError) {
      return { ok: false, error: "Fonds niet gevonden." };
    }
    console.error("[addFundAgentAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Toevoegen mislukt. Zie de serverlog." };
  }
}

export async function addFundUserAction(
  _prev: PasswordOnceState,
  formData: FormData,
): Promise<PasswordOnceState> {
  await assertAdmin();
  const fundKey = parseFundKey(formData);
  const email = str(formData.get("email")).toLowerCase();
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }
  const password = generatePassword();
  try {
    await createFundUser({
      email,
      passwordHash: hashPassword(password),
      tenantId: fundKey,
      mustChangePassword: true,
    });
    revalidateFund(fundKey);
    return { ok: true, email, password };
  } catch (error) {
    if (error instanceof UserExistsError) {
      return { ok: false, error: `Er bestaat al een account met e-mail ${error.email}.` };
    }
    if (error instanceof Error && error.message.includes("PROVISIONER_DATABASE_URL")) {
      return {
        ok: false,
        error: "PROVISIONER_DATABASE_URL ontbreekt. Zet die in de omgeving.",
      };
    }
    console.error("[addFundUserAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Aanmaken mislukt. Zie de serverlog." };
  }
}

export async function changeFundUserEmailAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(formData);
  const userId = str(formData.get("userId"));
  const email = str(formData.get("email")).toLowerCase();
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!userId) return { ok: false, error: "Ontbrekende gebruiker." };
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }
  try {
    await updateFundUserEmail({ userId, tenantId: fundKey, email });
    revalidateFund(fundKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof UserExistsError) {
      return { ok: false, error: `Er bestaat al een account met e-mail ${error.email}.` };
    }
    if (error instanceof UserNotFoundError) {
      return { ok: false, error: "Gebruiker niet gevonden bij dit fonds." };
    }
    console.error("[changeFundUserEmailAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Wijzigen mislukt. Zie de serverlog." };
  }
}

export async function resetFundUserPasswordAction(
  _prev: PasswordOnceState,
  formData: FormData,
): Promise<PasswordOnceState> {
  await assertAdmin();
  const fundKey = parseFundKey(formData);
  const userId = str(formData.get("userId"));
  const email = str(formData.get("email")).toLowerCase();
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  if (!userId) return { ok: false, error: "Ontbrekende gebruiker." };
  const password = generatePassword();
  try {
    const user = await resetFundUserPassword({
      userId,
      tenantId: fundKey,
      passwordHash: hashPassword(password),
    });
    revalidateFund(fundKey);
    return { ok: true, email: user.email || email, password };
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return { ok: false, error: "Gebruiker niet gevonden bij dit fonds." };
    }
    console.error("[resetFundUserPasswordAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Reset mislukt. Zie de serverlog." };
  }
}

export async function deactivateFundAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(formData);
  const confirmation = str(formData.get("confirmation")).toLowerCase();
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };
  try {
    await deactivateFund({ fundKey, confirmation });
    revalidateFund(fundKey);
  } catch (error) {
    if (error instanceof DumpRequiredError) {
      return {
        ok: false,
        error: "Download eerst een schema-dump. Deactiveren is geblokkeerd tot die auditregel bestaat.",
      };
    }
    if (error instanceof ConfirmationMismatchError) {
      return { ok: false, error: "Typ de fondssleutel exact om te bevestigen." };
    }
    if (error instanceof FundInactiveError) {
      return { ok: false, error: "Dit fonds is al gedeactiveerd." };
    }
    if (error instanceof FundNotFoundError) {
      return { ok: false, error: "Fonds niet gevonden." };
    }
    console.error("[deactivateFundAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Deactiveren mislukt. Zie de serverlog." };
  }
  redirect("/admin/funds");
}
