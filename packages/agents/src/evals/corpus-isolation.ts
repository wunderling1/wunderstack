/**
 * Corpus-isolation checks shared across agent eval entries (CAO + arbo).
 * Contract layer is offline; live layer needs DATABASE_URL + SCALEWAY_API_KEY.
 */
import { bindClaimsToInstance, instanceFromRow, listActiveFunds, pickUnkeyedInstance, retrievalScope } from "@wunderstack/db";
import { listCorpora, retrieveContext, retrieveInputSchema } from "@wunderstack/rag";

import type { EvalCheck } from "./harness";

export function corpusIsolationContractChecks(): EvalCheck[] {
  const noFund = retrieveInputSchema.safeParse({ query: "vakantiedagen" });
  const noAgentKey = retrieveInputSchema.safeParse({ query: "vakantiedagen", fund: "demo" });
  const scoped = retrieveInputSchema.safeParse({
    query: "vakantiedagen",
    fund: "demo",
    agentKey: "cao",
  });
  const twoActive = pickUnkeyedInstance([
    { status: "active", agentKey: "cao" },
    { status: "active", agentKey: "arbo" },
  ]);
  const arboRow = instanceFromRow({
    tenantId: "oomt",
    agentKey: "arbo",
    schemaName: "fund_oomt",
    connectionKey: null,
  });
  const caoRow = instanceFromRow({
    tenantId: "oomt",
    agentKey: "cao",
    schemaName: "fund_oomt",
    connectionKey: null,
  });
  const arboKeyCaoClaim = bindClaimsToInstance(arboRow, { agentKey: "cao" });
  const caoKeyArboClaim = bindClaimsToInstance(caoRow, { agentKey: "arbo" });
  return [
    {
      name: "corpus-isolation: retrieval seam rejects an unscoped (no-fund) query",
      ok: !noFund.success,
    },
    {
      name: "corpus-isolation: retrieval seam rejects a query without agentKey",
      ok: !noAgentKey.success,
    },
    {
      name: "corpus-isolation: retrieval seam accepts a fund- and agent-scoped query",
      ok: scoped.success,
    },
    {
      name: "corpus-isolation: tenant with cao+arbo and no key is 4xx, no answer",
      ok: !twoActive.ok && twoActive.status === 401,
    },
    {
      name: "corpus-isolation: arbo key + data-agent=cao is arbo or 4xx, never cao",
      ok: !arboKeyCaoClaim.ok && retrievalScope(arboRow).agentKey === "arbo",
    },
    {
      name: "corpus-isolation: cao key + data-agent=arbo is cao or 4xx, never arbo",
      ok: !caoKeyArboClaim.ok && retrievalScope(caoRow).agentKey === "cao",
    },
  ];
}

export async function corpusIsolationLiveChecks(): Promise<EvalCheck[]> {
  let corpora: Awaited<ReturnType<typeof listCorpora>>;
  try {
    corpora = await listCorpora();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [
      {
        name: "corpus-isolation: listCorpora() against the database",
        ok: false,
        detail,
      },
    ];
  }
  if (corpora.length === 0) {
    return [
      {
        name: "corpus-isolation: corpus has at least one fund to test",
        ok: false,
        detail: "no corpora ingested",
      },
    ];
  }

  const probeQuery = "vakantie loon toeslag pensioen arbeidsduur tillen pbm beeldscherm";
  let funds: Awaited<ReturnType<typeof listActiveFunds>>;
  try {
    funds = await listActiveFunds();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [
      {
        name: "corpus-isolation: listActiveFunds() against the control plane",
        ok: false,
        detail,
      },
    ];
  }
  const schemaByFund = new Map(funds.map((fund) => [fund.key, fund.schemaName]));
  const checks: EvalCheck[] = [];
  for (const { fund, agentKey } of corpora) {
    const result = await retrieveContext({ query: probeQuery, fund, agentKey, topK: 20, minScore: 0 });
    const leaked = result.chunks.filter(
      (chunk) => chunk.source.fund !== fund || chunk.source.agentKey !== agentKey,
    );
    // Compare against control.funds.schemaName — not a reconstructed `fund_${fund}` string — so the
    // check proves the registry, not the formula the writer itself uses.
    const expectedSchema = schemaByFund.get(fund);
    const wrongSchema =
      expectedSchema === undefined
        ? result.chunks
        : result.chunks.filter((chunk) => chunk.source.schemaName !== expectedSchema);
    checks.push({
      name: `corpus-isolation: fund "${fund}" agent "${agentKey}" returns only its own chunks`,
      ok: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `${String(result.chunks.length)} chunks, 0 cross-corpus`
          : `${String(leaked.length)} chunk(s) leaked from other fund/agent pairs`,
    });
    checks.push({
      name: `corpus-isolation: fund "${fund}" agent "${agentKey}" reports the control-plane schema`,
      ok: expectedSchema !== undefined && wrongSchema.length === 0,
      detail:
        expectedSchema === undefined
          ? `fund "${fund}" missing from control.funds`
          : wrongSchema.length === 0
            ? `schemaName=${expectedSchema}`
            : `${String(wrongSchema.length)} chunk(s) reported a different schema than ${expectedSchema}`,
    });
  }

  console.log(
    `\nCorpus isolation — probed ${String(corpora.length)} corpus(es): ${corpora.map((c) => `${c.fund}/${c.agentKey}`).join(", ")} with a broad query.`,
  );
  return checks;
}
