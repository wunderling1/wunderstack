"use client";

import { Button, Card, Checkbox, Chip, Field, Select } from "@wunderstack/ui";
import { useActionState } from "react";
import {
  addFundAgentAction,
  addFundUserAction,
  changeFundUserEmailAction,
  deactivateFundAction,
  resetFundUserPasswordAction,
  updateFundNameAction,
  type AddAgentState,
  type FormErrorState,
  type PasswordOnceState,
} from "./actions";

export interface AgentOption {
  id: string;
  label: string;
}

function Alert({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="text-sm text-state-danger-fg" role="alert">
      {error}
    </p>
  );
}

function OneTimePassword({ email, password }: { email: string; password: string }) {
  return (
    <Card className="flex flex-col gap-2 border-state-caution-fg/30 bg-state-caution-bg p-4">
      <p className="text-sm font-medium text-text">Eenmalig wachtwoord voor {email}</p>
      <code className="block break-all rounded bg-surface-sunk px-3 py-2 font-mono text-sm">
        {password}
      </code>
      <p className="text-xs text-text-subtle">
        Dit wachtwoord verdwijnt bij herladen. De gebruiker moet het bij de volgende login wijzigen.
      </p>
    </Card>
  );
}

export function UpdateNameForm({ fundKey, name }: { fundKey: string; name: string }) {
  const [state, action, pending] = useActionState<FormErrorState, FormData>(
    updateFundNameAction,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Weergavenaam</span>
        <Field name="name" required defaultValue={name} />
      </label>
      <p className="text-xs text-text-subtle">
        De fondssleutel <code className="font-mono">{fundKey}</code> is niet wijzigbaar (primary key
        en schema <code className="font-mono">fund_{fundKey}</code>).
      </p>
      <Alert error={state && !state.ok ? state.error : undefined} />
      {state?.ok ? <p className="text-sm text-state-verified-fg">Opgeslagen.</p> : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Bezig…" : "Naam opslaan"}
      </Button>
    </form>
  );
}

export function AddAgentForm({
  fundKey,
  agents,
}: {
  fundKey: string;
  agents: AgentOption[];
}) {
  const [state, action, pending] = useActionState<AddAgentState, FormData>(addFundAgentAction, null);
  if (agents.length === 0) {
    return <p className="text-sm text-text-subtle">Alle catalogus-agents staan al op dit fonds.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">Agent toevoegen</span>
        <Select name="agentKey" required defaultValue={agents[0]?.id}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
            </option>
          ))}
        </Select>
      </label>
      <Alert error={state && !state.ok ? state.error : undefined} />
      {state?.ok ? (
        <Card className="flex flex-col gap-1 border-state-caution-fg/30 bg-state-caution-bg p-4">
          <p className="text-sm font-medium">
            Agent {state.agentKey} toegevoegd. Tenant-key (eenmalig in dit scherm):
          </p>
          <code className="block break-all font-mono text-xs">{state.publicKey}</code>
        </Card>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Bezig…" : "Agent toevoegen"}
      </Button>
    </form>
  );
}

export function AddUserForm({ fundKey }: { fundKey: string }) {
  const [state, action, pending] = useActionState<PasswordOnceState, FormData>(
    addFundUserAction,
    null,
  );
  if (state?.ok) {
    return <OneTimePassword email={state.email} password={state.password} />;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">E-mail extra fondsaccount</span>
        <Field type="email" name="email" required placeholder="beheer@fonds.nl" />
      </label>
      <Alert error={state && !state.ok ? state.error : undefined} />
      <Button type="submit" disabled={pending} variant="secondary" className="self-start">
        {pending ? "Bezig…" : "Account aanmaken"}
      </Button>
    </form>
  );
}

export function ChangeEmailForm({
  fundKey,
  userId,
  email,
}: {
  fundKey: string;
  userId: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<FormErrorState, FormData>(
    changeFundUserEmailAction,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="userId" value={userId} />
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
        <span className="sr-only">E-mail</span>
        <Field type="email" name="email" required defaultValue={email} />
      </label>
      <Button type="submit" disabled={pending} variant="secondary" size="default">
        {pending ? "…" : "E-mail opslaan"}
      </Button>
      <Alert error={state && !state.ok ? state.error : undefined} />
      {state?.ok ? <span className="text-xs text-state-verified-fg">Opgeslagen.</span> : null}
    </form>
  );
}

export function ResetPasswordForm({
  fundKey,
  userId,
  email,
}: {
  fundKey: string;
  userId: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<PasswordOnceState, FormData>(
    resetFundUserPasswordAction,
    null,
  );
  if (state?.ok) {
    return <OneTimePassword email={state.email} password={state.password} />;
  }
  return (
    <form action={action}>
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <Alert error={state && !state.ok ? state.error : undefined} />
      <Button type="submit" disabled={pending} variant="secondary" size="default">
        {pending ? "Bezig…" : "Wachtwoord resetten"}
      </Button>
    </form>
  );
}

export function DumpForm({ fundKey }: { fundKey: string }) {
  return (
    <form action={`/admin/funds/${fundKey}/export`} method="POST">
      <Button type="submit" variant="secondary">
        Download schema-dump
      </Button>
    </form>
  );
}

export function DeactivateForm({
  fundKey,
  hasDump,
}: {
  fundKey: string;
  hasDump: boolean;
}) {
  const [state, action, pending] = useActionState<FormErrorState, FormData>(
    deactivateFundAction,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <Chip variant="caution">Soft-delete</Chip>
      <p className="text-sm text-text-muted">
        Zet het fonds op inactief. Het schema <code className="font-mono">fund_{fundKey}</code> blijft
        staan (geen DROP). Embed-keys stoppen met resolven. Het runtime-proces moet de operator nog
        uitzetten.
      </p>
      {!hasDump ? (
        <p className="text-sm text-state-danger-fg">
          Download eerst een dump. Zonder <code className="font-mono">fund_dumped</code>-auditregel
          weigert de server.
        </p>
      ) : null}
      <Checkbox
        name="dumpedConfirmed"
        required
        disabled={!hasDump}
        label="Ik heb de schema-dump gedownload en bewaard."
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">
          Typ <code className="font-mono">{fundKey}</code> ter bevestiging
        </span>
        <Field name="confirmation" required autoComplete="off" disabled={!hasDump} />
      </label>
      <Alert error={state && !state.ok ? state.error : undefined} />
      <Button type="submit" disabled={pending || !hasDump} className="self-start">
        {pending ? "Bezig…" : "Fonds deactiveren"}
      </Button>
    </form>
  );
}
