"use client";

import { AnswerCard, Button, Field } from "@wunderstack/ui";
import { useActionState, useMemo, useState, type CSSProperties } from "react";
import { updateFundThemeAction, type FormErrorState } from "./actions";

export function BrandingForm({
  fundKey,
  theme,
  agentNames,
}: {
  fundKey: string;
  theme: {
    primary?: string;
    accent?: string;
    radius?: string;
    logo?: string;
  };
  agentNames: string[];
}) {
  const [state, action, pending] = useActionState(updateFundThemeAction, null as FormErrorState);
  const [primary, setPrimary] = useState(theme.primary ?? "#4f46e5");
  const [accent, setAccent] = useState(theme.accent ?? "#0f766e");
  const [radius, setRadius] = useState(theme.radius ?? "12px");

  const previewStyle = useMemo(
    () =>
      ({
        "--color-primary": primary || "#4f46e5",
        "--color-primary-hover": primary || "#4f46e5",
        "--color-primary-tint": `color-mix(in srgb, ${primary || "#4f46e5"} 12%, white)`,
        "--color-on-primary": "#ffffff",
        "--radius-card": radius || "12px",
        "--radius-control": radius || "12px",
      }) as CSSProperties,
    [primary, radius],
  );

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
        <Button type="submit" variant="ghost" shape="control" className="self-start" disabled={pending}>
          {pending ? "Bezig…" : "Opslaan"}
        </Button>
        <p className="text-xs text-text-subtle">
          Deze huisstijl geldt voor alle agents van dit fonds
          {agentNames.length > 0 ? `: ${agentNames.join(", ")}` : ""}.
        </p>
      </form>

      <div className="flex flex-col gap-3" style={previewStyle}>
        <span className="text-sm font-medium">Voorbeeld</span>
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-page p-4">
          <AnswerCard role="user" size="sm">
            Wat zegt de CAO over vakantie?
          </AnswerCard>
          <AnswerCard role="agent" size="sm" agentLabel="AI-assistent" agentSubLabel="CAO-agent">
            Volgens artikel … heb je recht op …
          </AnswerCard>
        </div>
      </div>
    </div>
  );
}
