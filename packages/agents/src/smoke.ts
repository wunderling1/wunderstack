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
  console.log(`Asking the CAO-agent: "${question}"\n`);

  const agent = createCaoAgent();
  const result = await agent.answer({ question });

  console.log(`found: ${String(result.found)}`);
  console.log(
    `usage: prompt=${String(result.usage.promptTokens)} ` +
      `completion=${String(result.usage.completionTokens)} total=${String(result.usage.totalTokens)}`,
  );

  console.log(`\nSources (${String(result.sources.length)}):`);
  for (const source of result.sources) {
    console.log(
      `  [${String(source.ref)}] ${source.title} (${source.sourceUri}) ` +
        `v${source.version} — fund=${source.fund}`,
    );
  }

  console.log(`\n--- answer ---\n${result.answer}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
