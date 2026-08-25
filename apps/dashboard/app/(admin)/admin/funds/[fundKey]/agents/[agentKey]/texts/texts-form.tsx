"use client";

import { Button, Field, Textarea } from "@wunderstack/ui";
import { useActionState } from "react";
import { updateTextsAction, type FormErrorState } from "../actions";

export function TextsForm({
  fundKey,
  agentKey,
  texts,
}: {
  fundKey: string;
  agentKey: string;
  texts: {
    tagline?: string;
    intro?: string;
    article50?: string;
    starters?: string[];
  };
}) {
  const [state, action, pending] = useActionState(updateTextsAction, null as FormErrorState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value={agentKey} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Tagline</span>
        <Field name="tagline" defaultValue={texts.tagline ?? ""} placeholder="Vragen over je CAO?" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Intro (lege chat)</span>
        <Field
          name="intro"
          defaultValue={texts.intro ?? ""}
          placeholder="De AI-assistent geeft antwoord uit de catalogus, met de bron erbij."
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Artikel 50-tekst</span>
        <Textarea
          name="article50"
          rows={3}
          defaultValue={texts.article50 ?? ""}
          placeholder="Leeg laten = wettelijke standaardtekst"
        />
        <span className="text-xs text-text-subtle">
          Leeg laten betekent de wettelijke standaardtekst (Artikel 50 AI-verordening).
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Starters (één per regel)</span>
        <Textarea
          name="starters"
          rows={4}
          defaultValue={(texts.starters ?? []).join("\n")}
          placeholder="Hoeveel vakantiedagen heb ik?"
        />
      </label>
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-state-verified-fg">Teksten opgeslagen.</p>
      ) : null}
      <Button type="submit" variant="ghost" size="default" className="self-start" disabled={pending}>
        {pending ? "Bezig…" : "Opslaan"}
      </Button>
    </form>
  );
}
