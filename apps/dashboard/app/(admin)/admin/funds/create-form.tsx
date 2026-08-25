"use client";

import { Button, Card, Chip, Field } from "@wunderstack/ui";
import Link from "next/link";
import { useActionState } from "react";
import { createFundAction, type CreateFundState } from "./actions";

export interface AgentOption {
  id: string;
  label: string;
}

function envBlock(fundKey: string, instances: Array<{ agentKey: string; publicKey: string }>): string {
  const cao = instances.find((row) => row.agentKey === "cao");
  const arbo = instances.find((row) => row.agentKey === "arbo");
  const lines = [
    `TENANT=${fundKey}`,
    `CAO_FUNDS=${fundKey}`,
    `DATABASE_URL=<addon-owner connection string>`,
    cao ? `NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY=${cao.publicKey}` : null,
    arbo ? `NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO=${arbo.publicKey}` : null,
    `EMBED_SCRIPT_BASE=<runtime origin, e.g. https://api.example.nl>`,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function CreateFundForm({ agents }: { agents: AgentOption[] }) {
  const [state, action, pending] = useActionState<CreateFundState, FormData>(
    createFundAction,
    null,
  );

  if (state?.ok) {
    return (
      <Card className="flex flex-col gap-4 border-state-caution-fg/30 bg-state-caution-bg p-5">
        <div>
          <h3 className="text-sm font-semibold text-text">Fonds aangemaakt: {state.name}</h3>
          <p className="mt-1 text-sm text-text-muted">
            Sleutel <code className="font-mono text-xs">{state.fundKey}</code>. Het wachtwoord
            hieronder verdwijnt zodra je deze pagina verlaat of herlaadt — bewaar het nu.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted">Eenmalig wachtwoord</p>
          <code className="mt-1 block break-all rounded bg-surface-sunk px-3 py-2 font-mono text-sm">
            {state.password}
          </code>
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted">Tenant-keys per agent</p>
          <ul className="mt-1 flex flex-col gap-1">
            {state.instances.map((row) => (
              <li key={row.agentKey} className="font-mono text-xs">
                {row.agentKey}: {row.publicKey}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2">
            <Chip variant="caution">Nog niet live</Chip>
            <span className="text-xs text-text-muted">
              Runtime-deploy is handwerk — zet deze env-vars op de fondsinstance:
            </span>
          </div>
          <pre className="overflow-x-auto rounded bg-surface-sunk p-3 text-xs text-text">
            {envBlock(state.fundKey, state.instances)}
          </pre>
        </div>

        <p className="text-xs text-text-subtle">
          Herladen van deze pagina toont het wachtwoord niet opnieuw. Corpus laden gebeurt via
          ingest; zie het runbook nieuw fonds.{" "}
          <Link href={`/admin/funds/${state.fundKey}`} className="text-primary hover:underline">
            Fonds beheren
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Nieuw fonds</h3>
      <p className="mt-1 text-sm text-text-muted">
        Maakt in één stap: control.funds, schema, agent-instances, fondsaccount en auditregel.
      </p>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Fondssleutel</span>
          <Field name="fundKey" required placeholder="proefonds" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Weergavenaam</span>
          <Field name="name" required placeholder="Proefonds" />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-text-muted">Agents</legend>
          {agents.map((agent) => (
            <label key={agent.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`agent_${agent.id}`} defaultChecked={agent.id === "cao"} />
              {agent.label}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">E-mail fondsbeheerder</span>
          <Field type="email" name="email" required placeholder="beheer@fonds.nl" />
        </label>
        {state && !state.ok ? (
          <p className="text-sm text-state-danger-fg" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Bezig…" : "Fonds aanmaken"}
        </Button>
      </form>
    </Card>
  );
}
