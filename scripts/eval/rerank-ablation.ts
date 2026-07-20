/**
 * Rerank ablation (audit fase 5 — MEASURE, do not fix).
 *
 * Open question: does the rerank step change retrieval ordering at all, or does it effectively
 * recompute the same similarity? The pinned rerank model is `qwen3-embedding-8b` — the SAME model
 * as the retrieval embeddings — because a true cross-encoder (bge-reranker-v2-m3) is not on
 * Scaleway's catalog (see packages/shared/src/config/rerank.ts). This script answers the question
 * empirically on the golden set, WITHOUT touching the production config.
 *
 * For every single-turn case (no `history`) it runs retrieval against the real ingested corpus in
 * two modes and compares them:
 *   (a) production config WITH rerank — but with `skipAboveScore` ignored, so the rerank actually
 *       runs on every query (we call the Scaleway rerank endpoint directly, bypassing the skip gate).
 *   (b) rerank DISABLED — pure pgvector cosine ordering.
 *
 * Per query it reports: is the top-5 identical? If not, the Kendall tau of the full-pool ordering
 * and which chunk-ids moved in/out of the top-5. It also counts how often `skipAboveScore: 0.85`
 * WOULD skip the rerank in the real production path (top vector score already >= 0.85).
 *
 * Output: scripts/eval/rerank-ablation-report.md (regenerated on each run).
 *
 * Usage: pnpm --filter @wunderstack/eval-scripts rerank-ablation [--fund <fund>]
 * Needs DATABASE_URL + SCALEWAY_API_KEY (read from repo-root .env automatically).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { rerankDocuments } from "@wunderstack/ai";
import { closeDb, retrieve, rewriteQuery, type RetrievedChunk } from "@wunderstack/rag";
import { EVAL_FIXTURE_FUND, requireRerankConfig } from "@wunderstack/shared";
import { z } from "zod";

/** Production request default from caoQuestionSchema (packages/agents/src/types.ts). */
const PRODUCTION_MIN_SCORE = 0.48;

const here = dirname(fileURLToPath(import.meta.url));
const basalCasesPath = join(
  here,
  "..",
  "..",
  "packages",
  "agents",
  "src",
  "evals",
  "fixtures",
  "golden-set.base.jsonl",
);
const reportPath = join(here, "rerank-ablation-report.md");

// Minimal shape — this script only needs the query and whether the case is multi-turn. The golden
// set is the single source of truth (packages/agents/src/evals/fixtures); read directly to avoid a
// module import of the heavy agents package (keeps the arrow-rule clean, like fixtures.ts does).
const caseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  history: z.array(z.unknown()).optional(),
  category: z.string().optional(),
});
type GoldenCase = z.infer<typeof caseSchema>;

function readSingleTurnCases(): GoldenCase[] {
  const raw = readFileSync(basalCasesPath, "utf8").trim();
  if (raw.length === 0) return [];
  return raw
    .split("\n")
    .map((line) => caseSchema.parse(JSON.parse(line)))
    .filter((testCase) => (testCase.history?.length ?? 0) === 0);
}

/**
 * Kendall tau (tau-a) between two orderings of the same items. `vectorOrder` is already in rank
 * order, so we only need the rank of each shared item under the rerank ordering. +1 = identical
 * ordering, -1 = fully reversed, 0 = no correlation.
 */
function kendallTau(vectorOrder: string[], rerankOrder: string[]): number {
  const rerankRank = new Map<string, number>();
  rerankOrder.forEach((id, index) => rerankRank.set(id, index));

  const ranks: number[] = [];
  for (const id of vectorOrder) {
    const rank = rerankRank.get(id);
    if (rank !== undefined) ranks.push(rank);
  }

  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < ranks.length; i += 1) {
    const ri = ranks[i];
    if (ri === undefined) continue;
    for (let j = i + 1; j < ranks.length; j += 1) {
      const rj = ranks[j];
      if (rj === undefined) continue;
      if (rj > ri) concordant += 1;
      else if (rj < ri) discordant += 1;
    }
  }
  const pairs = (ranks.length * (ranks.length - 1)) / 2;
  return pairs === 0 ? 1 : (concordant - discordant) / pairs;
}

/** Rerank the pool by calling Scaleway directly (topN = full pool), so the skip gate never applies. */
async function rerankFullPool(query: string, pool: RetrievedChunk[], model: string): Promise<string[]> {
  const result = await rerankDocuments({
    query,
    documents: pool.map((chunk) => chunk.content),
    topN: pool.length,
    model,
  });
  const ordered = [...result.results].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const ids: string[] = [];
  for (const entry of ordered) {
    const chunk = pool[entry.index];
    if (chunk) ids.push(chunk.chunkId);
  }
  return ids;
}

type CaseKind = "compared" | "no-hits" | "single-candidate";

interface CaseResult {
  id: string;
  question: string;
  kind: CaseKind;
  poolSize: number;
  topScore: number;
  wouldSkipInProd: boolean;
  topKIdentical: boolean;
  tau: number;
  movedIntoTopK: string[];
  movedOutOfTopK: string[];
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

async function runCase(testCase: GoldenCase, fund: string): Promise<CaseResult> {
  const config = requireRerankConfig();
  const { rewritten } = rewriteQuery(testCase.question);

  const pool = await retrieve({
    query: rewritten,
    fund,
    candidateK: config.candidateK,
    minScore: PRODUCTION_MIN_SCORE,
  });

  const base: Omit<CaseResult, "kind" | "topKIdentical" | "tau" | "movedIntoTopK" | "movedOutOfTopK"> = {
    id: testCase.id,
    question: testCase.question,
    poolSize: pool.length,
    topScore: pool[0]?.score ?? 0,
    wouldSkipInProd:
      config.skipAboveScore !== null && (pool[0]?.score ?? 0) >= config.skipAboveScore,
  };

  if (pool.length === 0) {
    return { ...base, kind: "no-hits", topKIdentical: true, tau: 1, movedIntoTopK: [], movedOutOfTopK: [] };
  }
  if (pool.length === 1) {
    // Nothing to reorder — production would skip with reason "single-candidate".
    return { ...base, kind: "single-candidate", topKIdentical: true, tau: 1, movedIntoTopK: [], movedOutOfTopK: [] };
  }

  const vectorOrder = pool.map((chunk) => chunk.chunkId);
  const rerankOrder = await rerankFullPool(rewritten, pool, config.model);

  const vectorTopK = vectorOrder.slice(0, config.topK);
  const rerankTopK = rerankOrder.slice(0, config.topK);
  const vectorTopSet = new Set(vectorTopK);
  const rerankTopSet = new Set(rerankTopK);

  const topKIdentical = vectorTopK.length === rerankTopK.length && vectorTopK.every((id, i) => id === rerankTopK[i]);
  const movedIntoTopK = rerankTopK.filter((id) => !vectorTopSet.has(id));
  const movedOutOfTopK = vectorTopK.filter((id) => !rerankTopSet.has(id));

  return {
    ...base,
    kind: "compared",
    topKIdentical,
    tau: kendallTau(vectorOrder, rerankOrder),
    movedIntoTopK,
    movedOutOfTopK,
  };
}

function buildReport(results: CaseResult[], fund: string): string {
  const config = requireRerankConfig();
  const compared = results.filter((r) => r.kind === "compared");
  const identical = compared.filter((r) => r.topKIdentical);
  const reordered = compared.filter((r) => !r.topKIdentical);
  const wouldSkip = results.filter((r) => r.wouldSkipInProd);
  const noHits = results.filter((r) => r.kind === "no-hits");
  const singleCandidate = results.filter((r) => r.kind === "single-candidate");
  const meanTau =
    compared.length === 0 ? 1 : compared.reduce((sum, r) => sum + r.tau, 0) / compared.length;

  // "Material" = the top-5 set/order the agent actually sees changes on a non-trivial share of
  // queries, or the full-pool ordering is meaningfully decorrelated.
  const reorderShare = compared.length === 0 ? 0 : reordered.length / compared.length;
  const material = reorderShare >= 0.2 || meanTau < 0.9;

  const lines: string[] = [];
  lines.push("# Rerank ablation report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Measures whether the rerank step changes retrieval ordering versus pure pgvector");
  lines.push("cosine ordering. MEASUREMENT ONLY — production config is unchanged.");
  lines.push("");
  lines.push("## Config");
  lines.push("");
  lines.push(`- Fund (corpus): \`${fund}\``);
  lines.push(`- Rerank model: \`${config.model}\` (same model as retrieval embeddings)`);
  lines.push(`- candidateK: ${String(config.candidateK)} · topK: ${String(config.topK)}`);
  lines.push(`- minScore: ${String(PRODUCTION_MIN_SCORE)} (production default)`);
  lines.push(
    `- skipAboveScore (production): ${config.skipAboveScore === null ? "null" : String(config.skipAboveScore)} — ignored here so rerank always runs`,
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Single-turn cases: **${String(results.length)}**`);
  lines.push(`  - compared (>=2 candidates): ${String(compared.length)}`);
  lines.push(`  - single-candidate (rerank trivially skipped): ${String(singleCandidate.length)}`);
  lines.push(`  - no hits at minScore ${String(PRODUCTION_MIN_SCORE)}: ${String(noHits.length)}`);
  lines.push(
    `- Top-${String(config.topK)} identical to pure vector: **${String(identical.length)}/${String(compared.length)}**` +
      `${compared.length > 0 ? ` (${((identical.length / compared.length) * 100).toFixed(0)}%)` : ""}`,
  );
  const setChangedCount = reordered.filter(
    (r) => r.movedIntoTopK.length > 0 || r.movedOutOfTopK.length > 0,
  ).length;
  const sameSetReorderCount = reordered.length - setChangedCount;
  lines.push(
    `- Top-${String(config.topK)} changed by rerank: **${String(reordered.length)}/${String(compared.length)}** ` +
      `(${String(setChangedCount)} with a different chunk set, ${String(sameSetReorderCount)} same set reordered)`,
  );
  lines.push(`- Mean Kendall tau (full-pool ordering): **${meanTau.toFixed(3)}**`);
  lines.push(
    `- Would be SKIPPED in production by skipAboveScore ${config.skipAboveScore === null ? "null" : String(config.skipAboveScore)}: ` +
      `**${String(wouldSkip.length)}/${String(results.length)}**`,
  );
  lines.push("");
  lines.push("## Per-query");
  lines.push("");
  lines.push("| id | kind | pool | topScore | prod-skip | top-K identical | tau | in→ / out← |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const setChanged = r.movedIntoTopK.length > 0 || r.movedOutOfTopK.length > 0;
    const moved = setChanged
      ? `+[${r.movedIntoTopK.map(shortId).join(", ")}] / -[${r.movedOutOfTopK.map(shortId).join(", ")}]`
      : r.topKIdentical
        ? "—"
        : "reordered (same set)";
    lines.push(
      `| ${r.id} | ${r.kind} | ${String(r.poolSize)} | ${r.topScore.toFixed(3)} | ` +
        `${r.wouldSkipInProd ? "yes" : "no"} | ${r.topKIdentical ? "yes" : "NO"} | ${r.tau.toFixed(3)} | ${moved} |`,
    );
  }
  lines.push("");
  lines.push("## Conclusion");
  lines.push("");
  lines.push(
    `**Does rerank change ordering materially? ${material ? "YES" : "NO"}.** ` +
      `The rerank moved the top-${String(config.topK)} on ${String(reordered.length)}/${String(compared.length)} ` +
      `compared queries (${(reorderShare * 100).toFixed(0)}%); mean full-pool Kendall tau = ${meanTau.toFixed(3)} ` +
      `(1.0 = rerank reproduces the vector order exactly).`,
  );
  lines.push("");
  lines.push("");
  lines.push(
    `**Cost.** Pure vector = 1 embedding round-trip + 1 pgvector query per query. Enabling rerank ` +
      `adds exactly 1 Scaleway \`/v1/rerank\` round-trip per query, EXCEPT the ${String(wouldSkip.length)}/${String(results.length)} ` +
      `queries where the top vector score already clears skipAboveScore (${config.skipAboveScore === null ? "null" : String(config.skipAboveScore)}) ` +
      `and production skips the call.`,
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { fund: { type: "string" } } });
  const fund = values.fund ?? EVAL_FIXTURE_FUND;

  const cases = readSingleTurnCases();
  console.log(`Running rerank ablation on ${String(cases.length)} single-turn case(s) against fund "${fund}".`);

  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const result = await runCase(testCase, fund);
    results.push(result);
    console.log(
      `  ${result.id.padEnd(24)} pool=${String(result.poolSize)} ` +
        `top5=${result.topKIdentical ? "same" : "CHANGED"} tau=${result.tau.toFixed(2)} ` +
        `prodSkip=${result.wouldSkipInProd ? "y" : "n"}`,
    );
  }

  writeFileSync(reportPath, buildReport(results, fund), "utf8");
  console.log(`\nWrote ${reportPath}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
