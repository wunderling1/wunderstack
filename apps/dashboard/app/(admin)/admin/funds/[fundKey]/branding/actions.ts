"use server";

import { updateFundTheme } from "@wunderstack/db";
import { tenantThemeSchema } from "@wunderstack/shared";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/assert-admin";
import { parseFundKey } from "@/lib/route-params";

export type FormErrorState = { ok: false; error: string } | { ok: true } | null;

function str(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : undefined;
}

function clean<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function updateFundThemeAction(
  _prev: FormErrorState,
  formData: FormData,
): Promise<FormErrorState> {
  await assertAdmin();
  const fundKey = parseFundKey(String(formData.get("fundKey") ?? ""));
  if (!fundKey) return { ok: false, error: "Ongeldige fondssleutel." };

  try {
    const theme = tenantThemeSchema.parse(
      clean({
        primary: str(formData.get("primary")),
        accent: str(formData.get("accent")),
        radius: str(formData.get("radius")),
        logo: str(formData.get("logo")),
      }),
    );
    await updateFundTheme({ fundKey, theme });
    revalidatePath(`/admin/funds/${fundKey}/branding`);
    revalidatePath(`/admin/funds/${fundKey}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return { ok: false, error: "Controleer de huisstijlvelden (hex-kleuren, geldige logo-URL)." };
    }
    console.error("[updateFundThemeAction]", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Opslaan mislukt. Zie de serverlog." };
  }
}
