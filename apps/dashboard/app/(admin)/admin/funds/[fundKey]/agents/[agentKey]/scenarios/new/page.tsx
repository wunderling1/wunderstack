import { emptyRoleplayScenarioDraft } from "@wunderstack/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";
import { isExerciseAgentKey } from "@/lib/agent-profile";
import { ScenarioForm } from "../scenario-form";

export default async function NewRoleplayScenarioPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey || !isExerciseAgentKey(agentKey)) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Nieuw scenario</h3>
        <p className="mt-1 text-sm text-text-muted">
          Opslaan als concept mag onvolledig. Publiceren vereist persona, situatie, openingszin,
          briefing en minstens één rubriekvraag.
        </p>
        <p className="mt-2">
          <Link
            href={`/admin/funds/${fundKey}/agents/${agentKey}/scenarios`}
            className="text-sm text-text-muted hover:text-text"
          >
            ← Scenario&apos;s
          </Link>
        </p>
      </div>
      <ScenarioForm fundKey={fundKey} mode="create" slug="" draft={emptyRoleplayScenarioDraft()} />
    </div>
  );
}
