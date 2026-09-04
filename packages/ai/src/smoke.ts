import { embed, generateText } from "./index";

/**
 * Manual smoke test for the AI seam. Not run in CI.
 * Requires SCALEWAY_API_KEY and MISTRAL_API_KEY in the environment.
 *
 *   pnpm --filter @wunderstack/ai smoke
 */
async function main(): Promise<void> {
  console.log("[1/2] Embedding a string via Scaleway (EU)...");
  const embedding = await embed({
    texts: ["Wat betekent de afkorting CAO?"],
    model: "bge-multilingual-gemma2",
  });
  console.log(
    `  ok: model=${embedding.model} dim=${String(embedding.dim)} version=${embedding.version} vectors=${String(embedding.embeddings.length)}`,
  );

  console.log("[2/2] LLM call via Mistral (FR, sovereign default)...");
  const answer = await generateText({
    messages: [
      { role: "system", content: "Antwoord kort en in het Nederlands." },
      { role: "user", content: "Wat betekent de afkorting CAO?" },
    ],
    maxTokens: 120,
  });
  console.log(
    `  ok: model=${answer.model} finishReason=${String(answer.finishReason)} totalTokens=${String(answer.usage.totalTokens)}`,
  );
  console.log(`  answer: ${answer.text}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
