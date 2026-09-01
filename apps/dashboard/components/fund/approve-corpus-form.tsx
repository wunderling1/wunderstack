"use client";

import { Button } from "@wunderstack/ui";
import { useActionState } from "react";
import { pinCorpusAction, type FormErrorState } from "@/app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/actions";

export function ApproveCorpusForm({
  fundKey,
  agentKey,
  corpusVersion,
  approved,
}: {
  fundKey: string;
  agentKey: string;
  corpusVersion: string;
  approved: boolean;
}) {
  const [state, action, pending] = useActionState(pinCorpusAction, null as FormErrorState);

  if (approved) {
    return (
      <p className="text-sm text-state-verified-fg">
        Goedgekeurd voor corpusversie <code className="font-mono">{corpusVersion}</code>.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value={agentKey} />
      <input type="hidden" name="corpusVersion" value={corpusVersion} />
      <p className="text-sm text-text-muted">
        Goedkeuring geldt voor dezelfde corpusversie als de gate-uitslag hierboven (
        <code className="font-mono">{corpusVersion}</code>).
      </p>
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-state-verified-fg">Corpusversie goedgekeurd.</p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Bezig…" : "Keur deze versie goed"}
      </Button>
    </form>
  );
}
