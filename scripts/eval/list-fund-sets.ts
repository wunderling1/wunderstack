/**
 * Emit fund-set profiles for CI ingest/promote-check loops.
 *
 *   pnpm --filter @wunderstack/eval-scripts list-fund-sets              # JSON array
 *   pnpm --filter @wunderstack/eval-scripts list-fund-sets --promote-keys # space-separated set keys
 */

import { parseArgs } from "node:util";

import { goldenFundSets, loadFundSetProfiles } from "@wunderstack/agents/evals/golden-set";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "promote-keys": { type: "boolean", default: false },
    },
  });

  const profiles = loadFundSetProfiles();
  if (profiles.length === 0) {
    console.error("No fund set profiles discovered — refusing empty output.");
    process.exitCode = 1;
    return;
  }

  if (values["promote-keys"] === true) {
    const keys = goldenFundSets.map((set) => set.key).sort();
    process.stdout.write(`${keys.join(" ")}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(profiles, null, 2)}\n`);
}

await main();
