import { retrieveContext } from "./index.js";

/**
 * Manual smoke test for the retrieval pipeline. Not run in CI.
 * Requires DATABASE_URL (with an ingested corpus) and SCALEWAY_API_KEY in the environment.
 *
 *   pnpm --filter @wunderstack/rag smoke ["your question here"]
 */
async function main(): Promise<void> {
  const question = process.argv[2] ?? "Hoeveel vakantiedagen krijg ik volgens de CAO?";
  console.log(`Retrieving context for: "${question}"\n`);

  const result = await retrieveContext({ query: question, topK: 5 });

  console.log(`Chunks (${String(result.chunks.length)}):`);
  result.chunks.forEach((hit, index) => {
    console.log(
      `  ${String(index + 1)}. score=${hit.score.toFixed(3)} ` +
        `[${hit.source.title}] ordinal=${String(hit.ordinal)}`,
    );
  });

  console.log(`\nSources:`);
  for (const source of result.sources) {
    console.log(
      `  [${String(source.ref)}] ${source.title} (${source.sourceUri}) ` +
        `v${source.version} — fund=${source.fund}`,
    );
  }

  console.log(`\n--- assembled context ---\n${result.context}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
