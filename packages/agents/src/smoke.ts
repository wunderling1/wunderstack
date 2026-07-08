import { createCaoAgent } from "./index.js";

/**
 * Manual smoke test for the CAO-agent. Not run in CI.
 * Requires DATABASE_URL (with an ingested corpus), SCALEWAY_API_KEY and MISTRAL_API_KEY. Set
 * LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY to also see the run in Langfuse.
 *
 *   pnpm --filter @wunderstack/agents smoke ["your question here"]
 */
async function main(): Promise<void> {
  const question = process.argv[2] ?? "Hoeveel vakantiedagen krijg ik volgens de CAO?";
  const fund = process.argv[3] ?? "demo";
  console.log(`Asking the CAO-agent (fund=${fund}): "${question}"\n`);

  const agent = createCaoAgent();
  const result = await agent.answer({ question, fund });

  console.log(`found: ${String(result.found)}`);
  console.log(`citationVerificationFailed: ${String(result.citationVerificationFailed)}`);
  console.log(
    `usage: prompt=${String(result.usage.promptTokens)} ` +
      `completion=${String(result.usage.completionTokens)} total=${String(result.usage.totalTokens)}`,
  );

  console.log(`\nVerified citations (${String(result.citations.length)}):`);
  for (const citation of result.citations) {
    console.log(
      `  [${String(citation.ref)}] ${citation.sourceRef ?? citation.title} — ` +
        `"${citation.quote.slice(0, 80)}…" (fund=${citation.fund} v${citation.version})`,
    );
  }

  console.log(`\n--- answer ---\n${result.answer}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
