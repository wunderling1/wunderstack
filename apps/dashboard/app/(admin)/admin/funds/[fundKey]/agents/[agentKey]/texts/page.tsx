import { redirect } from "next/navigation";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

export default async function AgentTextsRedirect({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey) redirect("/admin");
  redirect(`/admin/funds/${fundKey}/agents/${agentKey}/publication`);
}
