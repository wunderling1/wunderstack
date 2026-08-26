"use client";

import { Button, Field } from "@wunderstack/ui";
import { useActionState } from "react";
import {
  createLtiConsumerAction,
  deactivateLtiConsumerAction,
  setLtiGradePassbackAction,
  type LtiConsumerFormState,
} from "./actions";

export function CreateLtiConsumerForm({ fundKey }: { fundKey: string }) {
  const [state, action, pending] = useActionState(createLtiConsumerAction, null as LtiConsumerFormState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value="roleplay" />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Naam</span>
        <Field name="name" autoComplete="off" placeholder="Moodle productie" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Consumer key (leeg = genereren)</span>
        <Field name="consumerKey" autoComplete="off" className="font-mono" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Shared secret (leeg = genereren)</span>
        <Field name="consumerSecret" type="password" autoComplete="new-password" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="gradePassbackEnabled" className="size-4" />
        <span>Cijferteruggave naar het LMS (opt-in; standaard uit)</span>
      </label>
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true && state.created ? (
        <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunk p-3 text-sm">
          <p className="font-medium">Bewaar het secret nu — het wordt niet opnieuw getoond.</p>
          <p className="mt-2 font-mono text-xs break-all">
            key: {state.created.consumerKey}
          </p>
          <p className="mt-1 font-mono text-xs break-all">
            secret: {state.created.consumerSecret}
          </p>
        </div>
      ) : null}
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Bezig…" : "Koppeling toevoegen"}
      </Button>
    </form>
  );
}

export function DeactivateLtiConsumerForm({
  fundKey,
  consumerId,
}: {
  fundKey: string;
  consumerId: string;
}) {
  const [state, action, pending] = useActionState(
    deactivateLtiConsumerAction,
    null as LtiConsumerFormState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value="roleplay" />
      <input type="hidden" name="consumerId" value={consumerId} />
      {state?.ok === false ? (
        <p className="mb-2 text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Bezig…" : "Deactiveren"}
      </Button>
    </form>
  );
}

export function LtiPassbackToggle({
  fundKey,
  consumerId,
  enabled,
}: {
  fundKey: string;
  consumerId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    setLtiGradePassbackAction,
    null as LtiConsumerFormState,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value="roleplay" />
      <input type="hidden" name="consumerId" value={consumerId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Bezig…" : enabled ? "Cijferteruggave uit" : "Cijferteruggave aan"}
      </Button>
    </form>
  );
}
