/**
 * Corpus-isolation checks shared across agent eval entries (CAO + arbo).
 * Contract layer is offline; live layer needs DATABASE_URL + SCALEWAY_API_KEY.
 */
import { listCorpora, retrieveContext, retrieveInputSchema } from "@wunderstack/rag";

import type { EvalCheck } from "./harness.js";

export function corpusIsolationContractChecks(): EvalCheck[] {
  const noFund = retrieveInputSchema.safeParse({ query: "vakantiedagen" });
  const noAgentKey = retrieveInputSchema.safeParse({ query: "vakantiedagen", fund: "demo" });
  const scoped = retrieveInputSchema.safeParse({
    query: "vakantiedagen",
    fund: "demo",
    agentKey: "cao",
  });
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
  const checks: EvalCheck[] = [];
  for (const { fund, agentKey } of corpora) {
    const result = await retrieveContext({ query: probeQuery, fund, agentKey, topK: 20, minScore: 0 });
    const leaked = result.chunks.filter(
      (chunk) => chunk.source.fund !== fund || chunk.source.agentKey !== agentKey,
    );
    checks.push({
      name: `corpus-isolation: fund "${fund}" agent "${agentKey}" returns only its own chunks`,
      ok: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `${String(result.chunks.length)} chunks, 0 cross-corpus`
          : `${String(leaked.length)} chunk(s) leaked from other fund/agent pairs`,
    });
  }

  console.log(
    `\nCorpus isolation — probed ${String(corpora.length)} corpus(es): ${corpora.map((c) => `${c.fund}/${c.agentKey}`).join(", ")} with a broad query.`,
  );
  return checks;
}
