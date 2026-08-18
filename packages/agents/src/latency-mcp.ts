import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCaoAgent } from "./index.js";
import { goldenFundSets } from "./evals/golden-set.js";

/**
 * One-off pipeline-latency measurement for PLAN-mcp-server Fase 1b.
 * Calls `createCaoAgent().answer()` over every fund-set case (etd + demo) against the real DB.
 * Not run in CI — costs ~34 generation calls. Requires DATABASE_URL, SCALEWAY_API_KEY, MISTRAL_API_KEY.
 *
 *   pnpm --filter @wunderstack/agents latency:mcp
 *
 * Writes `docs/audit/mcp/latency-pipeline.md` (relative to the monorepo root).
 */

interface CaseTiming {
  id: string;
  fund: string;
  setKey: string;
  category: string;
  hasHistory: boolean;
  ms: number;
  found: boolean;
  error?: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function summarize(timings: CaseTiming[]): { p50: number; p95: number; max: number; n: number } {
  const values = timings
    .filter((t) => t.error === undefined)
    .map((t) => t.ms)
    .sort((a, b) => a - b);
  return {
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values[values.length - 1] ?? 0,
  };
}

function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

function renderMarkdown(all: CaseTiming[], generatedAt: string): string {
  const ok = all.filter((t) => t.error === undefined);
  const overall = summarize(ok);
  const byCategory = new Map<string, CaseTiming[]>();
  const byHistory = { withHistory: [] as CaseTiming[], withoutHistory: [] as CaseTiming[] };

  for (const timing of ok) {
    const bucket = byCategory.get(timing.category) ?? [];
    bucket.push(timing);
    byCategory.set(timing.category, bucket);
    if (timing.hasHistory) {
      byHistory.withHistory.push(timing);
    } else {
      byHistory.withoutHistory.push(timing);
    }
  }

  const slowest = [...ok].sort((a, b) => b.ms - a.ms).slice(0, 10);
  const categoryLines = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, cases]) => {
      const s = summarize(cases);
      return `| ${category} | ${String(s.n)} | ${formatMs(s.p50)} | ${formatMs(s.p95)} | ${formatMs(s.max)} |`;
    });

  const historyWith = summarize(byHistory.withHistory);
  const historyWithout = summarize(byHistory.withoutHistory);

  const errors = all.filter((t) => t.error !== undefined);

  return `# Pipeline latency — MCP feasibility (Fase 1b)

**Generated:** ${generatedAt}
**Method:** \`createCaoAgent().answer()\` over fund golden sets (etd + demo), wall-clock per case.
**Not CI:** one-off measurement; re-run with \`pnpm --filter @wunderstack/agents latency:mcp\`.

## Overall

| Metric | Value |
|---|---|
| Cases measured (ok) | ${String(overall.n)} |
| Cases failed | ${String(errors.length)} |
| p50 | ${formatMs(overall.p50)} |
| p95 | ${formatMs(overall.p95)} |
| max | ${formatMs(overall.max)} |

Compare p95 to the Copilot Studio host limit (\`docs/audit/mcp/hostlimit-copilot.md\`) and to the
runtime turn budget (45s in \`apps/runtime/lib/chat-stream.ts\`).

## By category

| Category | n | p50 | p95 | max |
|---|---|---|---|---|
${categoryLines.join("\n")}

## By history (condense-path proxy)

| Slice | n | p50 | p95 | max |
|---|---|---|---|---|
| with history | ${String(historyWith.n)} | ${formatMs(historyWith.p50)} | ${formatMs(historyWith.p95)} | ${formatMs(historyWith.max)} |
| without history | ${String(historyWithout.n)} | ${formatMs(historyWithout.p50)} | ${formatMs(historyWithout.p95)} | ${formatMs(historyWithout.max)} |

## Slowest 10 cases

| id | fund | category | history | ms | found |
|---|---|---|---|---|---|
${slowest
  .map(
    (t) =>
      `| ${t.id} | ${t.fund} | ${t.category} | ${t.hasHistory ? "yes" : "no"} | ${formatMs(t.ms)} | ${String(t.found)} |`,
  )
  .join("\n")}

## Traagste categorie (conclusie)

De traagste slice is de categorie of history-groep met de hoogste p95 hierboven. Noteer die
expliciet bij de M2-beslissing (synchroon haalbaar ja/nee).

${
  errors.length === 0
    ? ""
    : `## Errors

| id | fund | error |
|---|---|---|
${errors.map((t) => `| ${t.id} | ${t.fund} | ${t.error ?? ""} |`).join("\n")}
`
}
`;
}

async function main(): Promise<void> {
  const agent = createCaoAgent();
  const all: CaseTiming[] = [];

  for (const set of goldenFundSets) {
    console.log(`\n=== fund set ${set.key} (${set.fund}, ${String(set.cases.length)} cases) ===`);
    for (const testCase of set.cases) {
      const hasHistory = (testCase.history?.length ?? 0) > 0;
      process.stdout.write(`  ${testCase.id}… `);
      const started = performance.now();
      try {
        const result = await agent.answer({
          question: testCase.question,
          fund: set.fund,
          ...(hasHistory ? { history: testCase.history } : {}),
        });
        const ms = performance.now() - started;
        all.push({
          id: testCase.id,
          fund: set.fund,
          setKey: set.key,
          category: testCase.category,
          hasHistory,
          ms,
          found: result.found,
        });
        console.log(`${formatMs(ms)} found=${String(result.found)}`);
      } catch (error) {
        const ms = performance.now() - started;
        const message = error instanceof Error ? error.message : String(error);
        all.push({
          id: testCase.id,
          fund: set.fund,
          setKey: set.key,
          category: testCase.category,
          hasHistory,
          ms,
          found: false,
          error: message,
        });
        console.log(`ERROR after ${formatMs(ms)}: ${message}`);
      }
    }
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const outPath = join(repoRoot, "docs/audit/mcp/latency-pipeline.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderMarkdown(all, new Date().toISOString()), "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
