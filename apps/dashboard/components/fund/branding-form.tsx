"use client";

import { Button, Field } from "@wunderstack/ui";
import { useActionState, useState, type CSSProperties } from "react";
import {
  updateFundThemeAction,
  type FormErrorState,
} from "@/app/(admin)/admin/funds/[fundKey]/(fund-console)/branding/actions";

export interface FundThemeFields {
  primary?: string;
  accent?: string;
  radius?: string;
  logo?: string;
}

export function BrandingForm({
  fundKey,
  theme,
  agentNames,
}: {
  fundKey: string;
  theme: FundThemeFields;
  agentNames: string[];
}) {
  const [state, action, pending] = useActionState(updateFundThemeAction, null as FormErrorState);
  const [primary, setPrimary] = useState(theme.primary ?? "#4f46e5");
  const [accent, setAccent] = useState(theme.accent ?? "#0f766e");
  const [radius, setRadius] = useState(theme.radius ?? "12px");

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="fundKey" value={fundKey} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Primaire kleur (hex)</span>
          <Field
            name="primary"
            value={primary}
            onChange={(event) => setPrimary(event.target.value)}
            placeholder="#4f46e5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Accentkleur (hex)</span>
          <Field
            name="accent"
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
            placeholder="#0f766e"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Radius</span>
          <Field
            name="radius"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
            placeholder="12px"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Logo-URL</span>
          <Field name="logo" defaultValue={theme.logo ?? ""} placeholder="https://…/logo.svg" />
        </label>
        {state?.ok === false ? (
          <p className="text-sm text-state-refusal-fg" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.ok === true ? (
          <p className="text-sm text-state-verified-fg">Huisstijl opgeslagen.</p>
        ) : null}
        <Button type="submit" variant="ghost" size="default" className="self-start" disabled={pending}>
          {pending ? "Bezig…" : "Opslaan"}
        </Button>
        <p className="text-xs text-text-subtle">
          Deze huisstijl geldt voor alle agents van dit fonds
          {agentNames.length > 0 ? `: ${agentNames.join(", ")}` : ""}.
        </p>
      </form>
      <BrandingPreview theme={{ primary, accent, radius }} />
    </div>
  );
}

export function BrandingPreview({
  theme,
}: {
  theme: Pick<FundThemeFields, "primary" | "accent" | "radius">;
}) {
  const previewStyle = {
    "--preview-primary": theme.primary || "#4f46e5",
    "--preview-accent": theme.accent || "#0f766e",
    "--preview-radius": theme.radius || "12px",
  } as CSSProperties;

  return (
    <div className="flex flex-col gap-3" style={previewStyle}>
      <span className="text-sm font-medium">Voorbeeld</span>
      <div
        className="border border-border bg-surface p-4"
        style={{ borderRadius: "var(--preview-radius)" }}
      >
        <div
          className="mb-3 max-w-[85%] px-3 py-2 text-sm text-white"
          style={{
            background: "var(--preview-primary)",
            borderRadius: "var(--preview-radius)",
          }}
        >
          Wat zegt de CAO over vakantie?
        </div>
        <div
          className="max-w-[85%] border px-3 py-2 text-sm text-text"
          style={{
            borderColor: "var(--preview-accent)",
            borderRadius: "var(--preview-radius)",
          }}
        >
          Volgens artikel … heb je recht op …
        </div>
      </div>
    </div>
  );
}
