import { syncLangfuseModelPrices } from "./observability/langfuse-model-prices.js";

/**
 * Sync @wunderstack/ai model list prices into Langfuse so traces show accurate cost.
 * Requires LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (and LANGFUSE_BASE_URL when self-hosted).
 * Idempotent; only affects traces created after it runs.
 *
 *   pnpm --filter @wunderstack/agents sync-model-prices
 */
async function main(): Promise<void> {
  const { created, unchanged } = await syncLangfuseModelPrices();

  if (created.length > 0) {
    console.log(`Created Langfuse model prices: ${created.join(", ")}`);
  }
  if (unchanged.length > 0) {
    console.log(`Already up to date: ${unchanged.join(", ")}`);
  }
  console.log("Langfuse model prices are in sync.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
