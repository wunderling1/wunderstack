import { retrieveContext } from "./index.js";

/**
 * Manual smoke test for the retrieval pipeline. Not run in CI.
 * Requires DATABASE_URL (with an ingested corpus) and SCALEWAY_API_KEY in the environment.
 *
 *   pnpm --filter @wunderstack/rag smoke ["your question here"]
 */
async function main(): Promise<void> {
  const question = process.argv[2] ?? "Hoeveel vakantiedagen krijg ik volgens de CAO?";
  const fund = process.argv[3] ?? "demo";
  console.log(`Retrieving context for (fund=${fund}): "${question}"\n`);

  const result = await retrieveContext({ query: question, fund, agentKey: "cao", topK: 5 });

  console.log(`Chunks (${String(result.chunks.length)}):`);
  result.chunks.forEach((hit, index) => {
    console.log(
      `  ${String(index + 1)}. score=${hit.score.toFixed(3)} ` +
        `[${hit.source.title}] ordinal=${String(hit.ordinal)}`,
    );
  });

  console.log(`\nCitations:`);
  for (const citation of result.citations) {
    console.log(
      `  [${String(citation.ref)}] ${citation.sourceRef ?? citation.title} ` +
        `(${citation.sourceUri}) v${citation.version} — fund=${citation.fund}`,
    );
  }

  console.log(`\n--- assembled context ---\n${result.context}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
