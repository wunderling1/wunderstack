"use server";

import { rotateTenantKey, upsertTenantConfig } from "@wunderstack/db";
import { tenantTextsSchema, tenantThemeSchema } from "@wunderstack/shared";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { decideAccess } from "@/lib/authz";

/**
 * Embed-console server actions (Fase 4, admin-only, D12). Writes go through the tenant_config_writer
 * connection (getWriterDb inside @wunderstack/db); reads elsewhere use the read connection. Every
 * action re-checks admin access server-side — never trust the client to have hidden the form.
 */

async function assertAdmin(): Promise<void> {
  const session = await auth();
  if (!decideAccess(session, "admin").allow) {
    throw new Error("forbidden");
  }
}

function str(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : undefined;
}

function clean<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function createTenantConfig(formData: FormData): Promise<void> {
  await assertAdmin();
  const tenantId = str(formData.get("tenantId"));
  if (!tenantId) return;
  await upsertTenantConfig({ tenantId });
  revalidatePath("/admin/embed");
}

export async function rotateKey(formData: FormData): Promise<void> {
  await assertAdmin();
  const tenantId = str(formData.get("tenantId"));
  if (!tenantId) return;
  await rotateTenantKey(tenantId);
  revalidatePath("/admin/embed");
}

export async function updateCors(formData: FormData): Promise<void> {
  await assertAdmin();
  const tenantId = str(formData.get("tenantId"));
  if (!tenantId) return;
  const corsAllowlist = String(formData.get("corsAllowlist") ?? "")
    .split(/[\n,]/)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  await upsertTenantConfig({ tenantId, corsAllowlist });
  revalidatePath("/admin/embed");
}

export async function updateTheme(formData: FormData): Promise<void> {
  await assertAdmin();
  const tenantId = str(formData.get("tenantId"));
  if (!tenantId) return;

  // Validate against the same shared schemas the runtime serves, so the console cannot write config
  // the embed would reject (single source of truth for the token subset).
  const theme = tenantThemeSchema.parse(
    clean({
      primary: str(formData.get("primary")),
      radius: str(formData.get("radius")),
      logo: str(formData.get("logo")),
    }),
  );
  const texts = tenantTextsSchema.parse(
    clean({
      tagline: str(formData.get("tagline")),
      article50: str(formData.get("article50")),
    }),
  );

  await upsertTenantConfig({ tenantId, theme, texts });
  revalidatePath("/admin/embed");
}
