"use client";

import { Button } from "@wunderstack/ui";
import { useActionState } from "react";
import { pinCorpusAction, type FormErrorState } from "@/app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/actions";

export function ApproveCorpusForm({
  fundKey,
  agentKey,
  fingerprint,
  approved,
  expired,
}: {
  fundKey: string;
  agentKey: string;
  fingerprint: string;
  approved: boolean;
  expired: boolean;
}) {
  const [state, action, pending] = useActionState(pinCorpusAction, null as FormErrorState);

  if (approved) {
    return (
      <p className="text-sm text-state-verified-fg">
        Goedgekeurd voor corpus <code className="font-mono">{fingerprint}</code>.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value={agentKey} />
      <input type="hidden" name="fingerprint" value={fingerprint} />
      <p className="text-sm text-text-muted">
        {expired
          ? "Het corpus is gewijzigd sinds de vorige goedkeuring. Keur het opnieuw goed voor "
          : "Goedkeuring geldt voor dit corpus in zijn geheel ("}
        <code className="font-mono">{fingerprint}</code>
        {expired ? "." : ")."}
      </p>
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-state-verified-fg">Corpus goedgekeurd.</p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Bezig…" : "Keur dit corpus goed"}
      </Button>
    </form>
  );
}
