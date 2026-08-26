import { getScenario, rowToDraft } from "@wunderstack/db";
import { roleplayScenarioSlugSchema } from "@wunderstack/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";
import { ScenarioForm } from "../scenario-form";

export const dynamic = "force-dynamic";

export default async function EditRoleplayScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ fundKey: string; agentKey: string; slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent, slug: rawSlug } = await params;
  const { notice } = await searchParams;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  const slug = roleplayScenarioSlugSchema.safeParse(rawSlug.toLowerCase());
  if (!fundKey || agentKey !== "roleplay" || !slug.success) notFound();

  const row = await getScenario(fundKey, slug.data);
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">{row.title.trim() || row.slug}</h3>
        <p className="mt-1 font-mono text-sm text-text-muted">{row.slug}</p>
        <p className="mt-2">
          <Link
            href={`/admin/funds/${fundKey}/agents/roleplay/scenarios`}
            className="text-sm text-text-muted hover:text-text"
          >
            ← Scenario&apos;s
          </Link>
        </p>
      </div>
      <ScenarioForm
        fundKey={fundKey}
        mode="edit"
        slug={row.slug}
        version={row.version}
        draft={rowToDraft(row)}
        notice={notice}
      />
    </div>
  );
}
