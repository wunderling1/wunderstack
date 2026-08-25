"use server";

import {
  createFundEnvironment,
  FundExistsError,
  FUND_KEY_RE,
  UserExistsError,
} from "@wunderstack/db";
import { AGENT_KEYS, agentKeySchema } from "@wunderstack/shared";
import { auth } from "@/auth";
import { decideAccess } from "@/lib/authz";
import { generatePassword, hashPassword } from "@/lib/password";

async function assertAdmin(): Promise<void> {
  const session = await auth();
  if (!decideAccess(session, "admin").allow) {
    throw new Error("forbidden");
  }
}

export type CreateFundState =
  | {
      ok: true;
      fundKey: string;
      name: string;
      password: string;
      instances: Array<{ agentKey: string; publicKey: string }>;
    }
  | { ok: false; error: string }
  | null;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Create a complete fund environment. Returns one-time state (incl. plaintext password) to the
 * form via useActionState — never put the password in a URL or log it.
 */
export async function createFundAction(
  _prev: CreateFundState,
  formData: FormData,
): Promise<CreateFundState> {
  await assertAdmin();

  const fundKey = str(formData.get("fundKey")).toLowerCase();
  const name = str(formData.get("name"));
  const email = str(formData.get("email")).toLowerCase();

  if (!FUND_KEY_RE.test(fundKey)) {
    return {
      ok: false,
      error:
        "Ongeldige fondssleutel. Gebruik alleen kleine letters, cijfers en koppeltekens (bijv. oomt of elektronische-detailhandel).",
    };
  }
  if (!name) {
    return { ok: false, error: "Vul een weergavenaam in." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Vul een geldig e-mailadres in voor de fondsbeheerder." };
  }

  const selected = AGENT_KEYS.filter((key) => formData.get(`agent_${key}`) === "on");
  if (selected.length === 0) {
    return { ok: false, error: "Selecteer minimaal één agent." };
  }
  // Validate against the shared schema (defense in depth; filter already uses AGENT_KEYS).
  if (selected.some((key) => !agentKeySchema.safeParse(key).success)) {
    return { ok: false, error: "Ongeldige agent-selectie." };
  }

  const password = generatePassword();
  try {
    const result = await createFundEnvironment({
      fundKey,
      name,
      agentKeys: selected,
      user: { email, passwordHash: hashPassword(password) },
    });
    return {
      ok: true,
      fundKey: result.fundKey,
      name: result.name,
      password,
      instances: result.instances.map((row) => ({
        agentKey: row.agentKey,
        publicKey: row.publicKey,
      })),
    };
  } catch (error) {
    if (error instanceof FundExistsError) {
      return { ok: false, error: `Fonds "${error.fundKey}" bestaat al.` };
    }
    if (error instanceof UserExistsError) {
      return { ok: false, error: `Er bestaat al een account met e-mail ${error.email}.` };
    }
    if (error instanceof Error && error.message.includes("PROVISIONER_DATABASE_URL")) {
      return {
        ok: false,
        error:
          "PROVISIONER_DATABASE_URL ontbreekt. Zet die in de omgeving (lokaal: gelijk aan DATABASE_URL).",
      };
    }
    console.error("[createFundAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Aanmaken mislukt. Zie de serverlog." };
  }
}
