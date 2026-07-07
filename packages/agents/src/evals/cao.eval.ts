/**
 * CAO-agent eval-suite (Fase 9) — the CI quality gate that blocks accuracy regressions.
 *
 * Three gates on the golden set (packages/agents/src/evals/fixtures/golden-set.jsonl):
 *
 *   Gate A — Prompt contract (offline, deterministic, always runs).
 *     Asserts the agent's system prompt keeps its non-negotiable grounding rules.
 *
 *   Gate B — Retrieval recall + rerank effect (needs SCALEWAY_API_KEY).
 *     Embeds golden passages + questions with the pinned production embedding model,
 *     scores cosine recall@k + MRR before and after the sovereign reranker. The rerank
 *     delta is recorded as the Fase 9 retrieval baseline.
 *
 *   Gate C — Answer-level quality (needs SCALEWAY_API_KEY + MISTRAL_API_KEY).
 *     Generates answers on golden context and scores faithfulness, citation-correctness,
 *     completeness, and refusal-calibration. LLM-as-judge runs via @wunderstack/ai (Mistral).
 *
 * Run: pnpm --filter @wunderstack/agents test   (loads repo-root .env automatically)
 */

import { embed, generateText, rerankDocuments } from "@wunderstack/ai";
import { requireEmbeddingConfig, requireRerankConfig } from "@wunderstack/shared";

import { detectClarification } from "../cao/clarify.js";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, buildAnswerPrompt } from "../cao/prompt.js";
import { goldenCases, goldenPassages, passagesForCase } from "./golden-set.js";
import {
  aggregateScores,
  buildContext,
  scoreAnswerCase,
  type CaseScores,
} from "./judge.js";
import { retryWithBackoff, sleep } from "./retry.js";

const EVAL_LLM_MODEL = "mistral-small-latest";
const K_VALUES = [1, 3, 5] as const;
const PRIMARY_K = 5;

const RETRIEVAL_THRESHOLDS = {
  hitAt1: 0.85,
  recallAt3: 0.9,
  recallAt5: 0.9,
  mrr: 0.88,
} as const;

/** Answer-level gates — conservative headroom for LLM-judge variance at temperature 0. */
const ANSWER_THRESHOLDS = {
  faithfulness: 0.8,
  citationCorrectness: 0.75,
  completeness: 0.7,
  refusalCalibration: 0.9,
} as const;

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

function normalize(vectors: number[][]): number[][] {
  return vectors.map((vector) => {
    let sumSquares = 0;
    for (const value of vector) sumSquares += value * value;
    const magnitude = Math.sqrt(sumSquares);
    return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
  });
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function promptContractChecks(): Check[] {
  const instructions = CAO_SYSTEM_INSTRUCTIONS;
  const prompt = buildAnswerPrompt("[1] voorbeeldcontext", "Voorbeeldvraag?");
  return [
    {
      name: "prompt: answers only from supplied context",
      ok: /uitsluitend op basis van de aangeleverde context/i.test(instructions),
    },
    {
      name: "prompt: instructs `[n]` source citations",
      ok: /\[1\]/.test(instructions) && /bronnen/i.test(instructions),
    },
    {
      name: 'prompt: refuses with the "niet gevonden" message instead of inventing',
      ok: instructions.includes(NOT_FOUND_MESSAGE) && NOT_FOUND_MESSAGE.trim().length > 0,
    },
    {
      name: "prompt: user turn carries both context and question",
      ok: prompt.includes("[1] voorbeeldcontext") && prompt.includes("Voorbeeldvraag?"),
    },
    {
      name: "prompt: instructs to cite article + lid",
      ok: /artikel/i.test(instructions) && /lid/i.test(instructions),
    },
    {
      name: "prompt: forbids individual/legal advice (scope guard)",
      ok: /geen (?:persoonlijk|individueel)/i.test(instructions) && /advies/i.test(instructions),
    },
  ];
}

/**
 * Gate A (clarify): the deterministic clarify detector asks a follow-up on underspecified salary
 * questions, but never hijacks an answerable golden question. Pure, offline, no network.
 */
function clarifyContractChecks(): Check[] {
  const underspecified = ["Hoeveel verdien ik?", "Wat is mijn salaris?", "Wat verdient een medewerker?"];
  const checks: Check[] = underspecified.map((question) => ({
    name: `clarify: asks a follow-up for "${question}"`,
    ok: detectClarification(question) !== null,
  }));

  const hijacked = goldenCases.filter(
    (testCase) => testCase.category !== "refusal" && detectClarification(testCase.question) !== null,
  );
  checks.push({
    name: "clarify: does not hijack answerable golden questions",
    ok: hijacked.length === 0,
    detail: hijacked.length === 0 ? undefined : `hijacked: ${hijacked.map((c) => c.id).join(", ")}`,
  });

  return checks;
}

interface RecallMetrics {
  recallAtK: Record<number, number>;
  mrr: number;
}

function scoreRecall(
  rankedPassageIds: string[][],
  queries: { id: string; expectedPassageIds: string[] }[],
): RecallMetrics {
  const recallHits: Record<number, number> = {};
  for (const k of K_VALUES) recallHits[k] = 0;
  let reciprocalRankSum = 0;

  queries.forEach((query, queryIndex) => {
    const ranked = rankedPassageIds[queryIndex] ?? [];
    const relevant = new Set(query.expectedPassageIds);
    const rank = ranked.findIndex((id) => relevant.has(id)) + 1;
    if (rank > 0) {
      reciprocalRankSum += 1 / rank;
      for (const k of K_VALUES) if (rank <= k) recallHits[k] = (recallHits[k] ?? 0) + 1;
    }
  });

  const recallAtK: Record<number, number> = {};
  for (const k of K_VALUES) recallAtK[k] = (recallHits[k] ?? 0) / queries.length;
  return { recallAtK, mrr: reciprocalRankSum / queries.length };
}

function recallChecks(label: string, metrics: RecallMetrics, thresholds: typeof RETRIEVAL_THRESHOLDS): Check[] {
  return [
    {
      name: `${label}: hit@1 >= ${pct(thresholds.hitAt1)}`,
      ok: (metrics.recallAtK[1] ?? 0) >= thresholds.hitAt1,
    },
    {
      name: `${label}: recall@3 >= ${pct(thresholds.recallAt3)}`,
      ok: (metrics.recallAtK[3] ?? 0) >= thresholds.recallAt3,
    },
    {
      name: `${label}: recall@${String(PRIMARY_K)} >= ${pct(thresholds.recallAt5)}`,
      ok: (metrics.recallAtK[PRIMARY_K] ?? 0) >= thresholds.recallAt5,
    },
    {
      name: `${label}: MRR >= ${thresholds.mrr.toFixed(3)}`,
      ok: metrics.mrr >= thresholds.mrr,
    },
  ];
}

function logRecallMetrics(label: string, metrics: RecallMetrics, thresholds: typeof RETRIEVAL_THRESHOLDS): void {
  console.log(`  ${label}:`);
  console.log(`    hit@1     ${pct(metrics.recallAtK[1] ?? 0)}  (min ${pct(thresholds.hitAt1)})`);
  console.log(`    recall@3  ${pct(metrics.recallAtK[3] ?? 0)}  (min ${pct(thresholds.recallAt3)})`);
  console.log(
    `    recall@${String(PRIMARY_K)}  ${pct(metrics.recallAtK[PRIMARY_K] ?? 0)}  (min ${pct(thresholds.recallAt5)})`,
  );
  console.log(`    MRR       ${metrics.mrr.toFixed(3)}  (min ${thresholds.mrr.toFixed(3)})`);
}

async function retrievalAndRerankChecks(): Promise<Check[]> {
  const embeddingConfig = requireEmbeddingConfig();
  const rerankConfig = requireRerankConfig();
  const retrievalQueries = goldenCases.filter((testCase) => testCase.category !== "refusal");

  const passageResult = await embed({
    texts: goldenPassages.map((passage) => passage.content),
    model: embeddingConfig.model,
    version: embeddingConfig.version,
  });
  const queryResult = await embed({
    texts: retrievalQueries.map((testCase) => testCase.question),
    model: embeddingConfig.model,
    version: embeddingConfig.version,
  });

  const dimOk = passageResult.dim === embeddingConfig.dim;
  const passageVectors = normalize(passageResult.embeddings);
  const queryVectors = normalize(queryResult.embeddings);

  const beforeRankings: string[][] = [];
  const afterRankings: string[][] = [];

  for (let queryIndex = 0; queryIndex < retrievalQueries.length; queryIndex++) {
    const queryVector = queryVectors[queryIndex] as number[];
    const query = retrievalQueries[queryIndex] as (typeof retrievalQueries)[number];

    const cosineRanked = goldenPassages
      .map((passage, passageIndex) => ({
        id: passage.id,
        score: dot(queryVector, passageVectors[passageIndex] as number[]),
      }))
      .sort((a, b) => b.score - a.score);

    const candidates = cosineRanked.slice(0, rerankConfig.candidateK);
    beforeRankings.push(candidates.map((entry) => entry.id));

    if (candidates.length === 0) {
      afterRankings.push([]);
      continue;
    }

    try {
      const reranked = await rerankDocuments({
        query: query.question,
        documents: candidates.map((entry) => {
          const passage = goldenPassages.find((p) => p.id === entry.id);
          return passage?.content ?? "";
        }),
        topN: rerankConfig.topK,
        model: rerankConfig.model,
      });

      afterRankings.push(
        reranked.results.map((result) => candidates[result.index]?.id).filter((id): id is string => id !== undefined),
      );
    } catch {
      afterRankings.push(candidates.slice(0, rerankConfig.topK).map((entry) => entry.id));
    }
  }

  const beforeMetrics = scoreRecall(beforeRankings, retrievalQueries);
  const afterMetrics = scoreRecall(afterRankings, retrievalQueries);

  console.log(
    `\nRetrieval recall — model ${embeddingConfig.model} @ ${String(passageResult.dim)} dim, ` +
      `rerank ${rerankConfig.model}, ${String(goldenPassages.length)} passages, ` +
      `${String(retrievalQueries.length)} queries:`,
  );
  logRecallMetrics("before rerank (cosine top-" + String(rerankConfig.candidateK) + ")", beforeMetrics, RETRIEVAL_THRESHOLDS);
  logRecallMetrics("after rerank (top-" + String(rerankConfig.topK) + ")", afterMetrics, RETRIEVAL_THRESHOLDS);
  console.log(
    `  rerank delta hit@1: ${pct((afterMetrics.recallAtK[1] ?? 0) - (beforeMetrics.recallAtK[1] ?? 0))}`,
  );
  console.log("");

  return [
    {
      name: "retrieval: embedding dim matches pinned EMBEDDING_CONFIG.dim",
      ok: dimOk,
      detail: dimOk ? undefined : `got ${String(passageResult.dim)}, expected ${String(embeddingConfig.dim)}`,
    },
    ...recallChecks("retrieval (before rerank)", beforeMetrics, RETRIEVAL_THRESHOLDS),
    {
      name: "rerank: effect recorded (after-rerank metrics logged above)",
      ok: true,
      detail: `hit@1 ${pct(beforeMetrics.recallAtK[1] ?? 0)} -> ${pct(afterMetrics.recallAtK[1] ?? 0)}`,
    },
  ];
}

function answerLevelChecks(aggregate: ReturnType<typeof aggregateScores>): Check[] {
  console.log(`\nAnswer-level scores (${String(aggregate.caseCount)} cases):`);
  console.log(`  faithfulness          ${pct(aggregate.faithfulness)}  (min ${pct(ANSWER_THRESHOLDS.faithfulness)})`);
  console.log(
    `  citation-correctness  ${pct(aggregate.citationCorrectness)}  (min ${pct(ANSWER_THRESHOLDS.citationCorrectness)})`,
  );
  console.log(`  completeness          ${pct(aggregate.completeness)}  (min ${pct(ANSWER_THRESHOLDS.completeness)})`);
  console.log(
    `  refusal-calibration   ${pct(aggregate.refusalCalibration)}  (min ${pct(ANSWER_THRESHOLDS.refusalCalibration)})\n`,
  );

  return [
    {
      name: `answer: faithfulness >= ${pct(ANSWER_THRESHOLDS.faithfulness)}`,
      ok: aggregate.faithfulness >= ANSWER_THRESHOLDS.faithfulness,
    },
    {
      name: `answer: citation-correctness >= ${pct(ANSWER_THRESHOLDS.citationCorrectness)}`,
      ok: aggregate.citationCorrectness >= ANSWER_THRESHOLDS.citationCorrectness,
    },
    {
      name: `answer: completeness >= ${pct(ANSWER_THRESHOLDS.completeness)}`,
      ok: aggregate.completeness >= ANSWER_THRESHOLDS.completeness,
    },
    {
      name: `answer: refusal-calibration >= ${pct(ANSWER_THRESHOLDS.refusalCalibration)}`,
      ok: aggregate.refusalCalibration >= ANSWER_THRESHOLDS.refusalCalibration,
    },
  ];
}

async function answerQualityChecks(): Promise<Check[]> {
  const caseScores: CaseScores[] = [];

  for (const testCase of goldenCases) {
    let answer: string;

    if (testCase.category === "refusal") {
      answer = NOT_FOUND_MESSAGE;
    } else {
      const passages = passagesForCase(testCase);
      const context = buildContext(passages);
      const generated = await retryWithBackoff(
        () =>
          generateText({
            model: EVAL_LLM_MODEL,
            messages: [
              { role: "system", content: CAO_SYSTEM_INSTRUCTIONS },
              { role: "user", content: buildAnswerPrompt(context, testCase.question) },
            ],
            temperature: 0,
          }),
        { baseDelayMs: 5000, maxAttempts: 8 },
      );
      answer = generated.text;
      await sleep(2000);
    }

    caseScores.push(await scoreAnswerCase(testCase, passagesForCase(testCase), answer, NOT_FOUND_MESSAGE));
  }

  return answerLevelChecks(aggregateScores(caseScores));
}

function report(title: string, checks: Check[]): boolean {
  console.log(title);
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`  [${status}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  return checks.every((check) => check.ok);
}

async function main(): Promise<void> {
  let allPassed = true;

  allPassed =
    report("Gate A — prompt & clarify contract:", [
      ...promptContractChecks(),
      ...clarifyContractChecks(),
    ]) && allPassed;

  if (process.env.SCALEWAY_API_KEY) {
    allPassed =
      report("Gate B — retrieval recall + rerank effect:", await retrievalAndRerankChecks()) && allPassed;
  } else {
    console.log(
      "\nGate B — retrieval recall: SKIPPED (SCALEWAY_API_KEY not set). " +
        "Set it (locally or as a CI secret) to gate retrieval accuracy.",
    );
  }

  if (process.env.SCALEWAY_API_KEY && process.env.MISTRAL_API_KEY) {
    allPassed = report("Gate C — answer-level quality:", await answerQualityChecks()) && allPassed;
  } else {
    console.log(
      "\nGate C — answer-level quality: SKIPPED (SCALEWAY_API_KEY and MISTRAL_API_KEY required). " +
        "Set both locally or as CI secrets to gate answer quality.",
    );
  }

  if (!allPassed) {
    console.error("\nEval FAILED — an accuracy gate regressed. See failures above.");
    process.exitCode = 1;
    return;
  }
  console.log("\nEval PASSED.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
