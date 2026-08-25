"use client";

import { Button, Field, Textarea } from "@wunderstack/ui";
import { useActionState } from "react";
import {
  rotateInstanceKeyAction,
  updateCorsAction,
  type FormErrorState,
} from "./actions";

export function RotateKeyForm({
  fundKey,
  agentKey,
  fundName,
  agentLabel,
  publicKey,
}: {
  fundKey: string;
  agentKey: string;
  fundName: string;
  agentLabel: string;
  publicKey: string;
}) {
  const [state, action, pending] = useActionState(
    rotateInstanceKeyAction,
    null as FormErrorState,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value={agentKey} />
      <div>
        <span className="text-sm font-medium">Publieke sleutel</span>
        <code className="mt-1 block truncate rounded bg-surface-sunk px-2 py-1 text-xs">
          {publicKey}
        </code>
      </div>
      <p className="text-sm text-text-muted">
        Roteren maakt de huidige sleutel ongeldig. Bestaande snippets voor{" "}
        <strong>{agentLabel}</strong> van <strong>{fundName}</strong> werken niet meer tot je ze
        bijwerkt.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">
          Typ <code className="font-mono">{agentKey}</code> om te bevestigen
        </span>
        <Field name="confirmation" autoComplete="off" placeholder={agentKey} />
      </label>
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-state-verified-fg">Sleutel geroteerd.</p>
      ) : null}
      <Button type="submit" variant="ghost" size="default" className="self-start" disabled={pending}>
        {pending ? "Bezig…" : "Roteer sleutel"}
      </Button>
    </form>
  );
}

export function CorsForm({
  fundKey,
  agentKey,
  corsAllowlist,
}: {
  fundKey: string;
  agentKey: string;
  corsAllowlist: string[];
}) {
  const [state, action, pending] = useActionState(updateCorsAction, null as FormErrorState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value={agentKey} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Toegestane websites</span>
        <Textarea
          name="corsAllowlist"
          rows={3}
          defaultValue={corsAllowlist.join("\n")}
          placeholder="https://www.fonds.nl"
        />
      </label>
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-state-verified-fg">Opgeslagen.</p>
      ) : null}
      <Button type="submit" variant="ghost" size="default" className="self-start" disabled={pending}>
        {pending ? "Bezig…" : "Opslaan"}
      </Button>
    </form>
  );
}
