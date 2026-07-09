/**
 * CAO-agent eval-suite (Fase 9) — the CI quality gate that blocks accuracy regressions.
 *
 * Three gates on the golden set (packages/agents/src/evals/fixtures/golden-set.jsonl):
 *
 *   Gate A — Prompt & clarify CONTRACT (offline, deterministic, always runs).
 *     A change-detector, NOT a behavioral gate: it asserts the system prompt still carries its
 *     non-negotiable grounding rules and that the deterministic clarify router fires on the right
 *     inputs. A prompt can contain a rule the model ignores; whether the model actually OBEYS the
 *     rules is tested behaviorally in Gate C. Clarify lives here because it is pure routing logic
 *     (see ../cao/clarify.ts), not an LLM call, so it is genuinely testable offline.
 *
 *   Gate B — Retrieval recall + rerank effect (needs SCALEWAY_API_KEY). FUND-SPECIFIC layer.
 *     Embeds golden passages + questions with the pinned production embedding model, scores cosine
 *     recall@k + MRR before and after the sovereign reranker. Relevance is matched on ARTICLE/LID
 *     (stable CAO structure), never on chunk id, so structure-aware re-chunking cannot break it for
 *     the wrong reason. The rerank step is a real gate (MRR may not regress), not just a report.
 *
 *   Gate C — Answer-level quality (needs SCALEWAY_API_KEY + MISTRAL_API_KEY).
 *     Generates answers on golden context and scores hard-hallucination (deterministic, near-zero
 *     tolerance), soft faithfulness + completeness (LLM-judge), citation-correctness, and two-sided
 *     refusal calibration (over- and under-refusal). Judge != generator (see judge.ts).
 *
 * Skipped != passed: when EVAL_REQUIRE_ALL is set (the merge-to-main job), a gate whose API keys
 * are missing FAILS instead of skipping. Locally it skips so dev runs stay cheap.
 *
 * Backlog (not gated yet): latency and per-run token cost. Worth adding a soft budget gate before
 * production, but out of scope here — see PLAN-eval-gates.md.
 *
 * Run: pnpm --filter @wunderstack/agents test   (loads repo-root .env automatically)
 */

import { embed, generateText } from "@wunderstack/ai";
import { listFunds, rerank, retrieveContext } from "@wunderstack/rag";
import { env, GENERATION_CONFIG, requireEmbeddingConfig, requireRerankConfig } from "@wunderstack/shared";

import { detectClarification } from "../cao/clarify.js";
import { condenseQuery, isElliptical } from "../cao/condense.js";
import { retrievalInputSchema } from "../cao/tools.js";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, buildAnswerPrompt } from "../cao/prompt.js";
import {
  type AnswerBaseline,
  type RetrievalBaseline,
  REL_TOLERANCE,
  readBaseline,
  updateBaselineSection,
} from "./baseline.js";
import {
  GOLDEN_CORPUS_VERSION,
  type GoldenCase,
  goldenCases,
  goldenPassages,
  passageById,
  passageToHit,
  passagesForCase,
} from "./golden-set.js";
import {
  aggregateScores,
  assembleEvalContext,
  scoreAnswerCase,
  type AggregateScores,
  type CaseScores,
} from "./judge.js";
import { retryWithBackoff, sleep } from "./retry.js";

/** Pinned generator model (Mistral Small 4). Judge runs on a different pinned model (see judge.ts). */
const EVAL_LLM_MODEL = "mistral-small-2603";
const K_VALUES = [1, 3, 5] as const;
/** Primary "what the model sees" metric — must match RERANK_CONFIG.topK (5) and production topK. */
const PRIMARY_K = 5;

/** True when a missing-key gate must fail rather than skip (set on the merge-to-main CI job). */
const REQUIRE_ALL = env.EVAL_REQUIRE_ALL === "1" || env.EVAL_REQUIRE_ALL === "true";

/**
 * Gate-K = production-K = RERANK_CONFIG.topK (5): retrieval fetches candidateK (15) from pgvector,
 * rerank trims to 5, and the model sees those 5 chunks. recall@5 is the primary comfort metric;
 * hit@1 and recall@3 remain as additional thresholds.
 */
const RETRIEVAL_THRESHOLDS = {
  hitAt1: 0.85,
  recallAt3: 0.9,
  recallAt5: 0.9,
  mrr: 0.88,
} as const;

/**
 * Answer-level gates. faithfulness is split: `hardHallucination` (deterministic — invented
 * amounts/terms/articles) carries near-zero tolerance and backs the "verzint niets"-promise;
 * `softFaithfulness` (LLM-judged paraphrase drift) keeps conservative headroom for judge variance.
 * Refusal is two-sided: over-refusal (answerable but refused) and under-refusal (should have
 * refused but answered) each have their own ceiling.
 */
const ANSWER_THRESHOLDS = {
  hardHallucination: 0.98,
  softFaithfulness: 0.8,
  relevance: 0.85,
  citationCorrectness: 0.75,
  completeness: 0.7,
  refusalCalibration: 0.9,
  // Deterministic verbatim-citation gate (Fase A/E): strict, since the check has no LLM flakiness.
  citationVerification: 0.98,
  // Orphan sources (a shown citation without an inline marker) must be eliminated by the contract.
  maxOrphanRate: 0,
  // Inline markers without a verified citation behind them are just as bad as orphan source cards.
  maxDanglingMarkerRate: 0,
  maxOverRefusalRate: 0.05,
  maxUnderRefusalRate: 0.1,
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
      name: "prompt: direct answer first, then explanation",
      ok: /kern beantwoordt/i.test(instructions) && /toelichting/i.test(instructions),
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

async function evalQuestion(testCase: GoldenCase): Promise<string> {
  if (!testCase.history || !isElliptical(testCase.question, testCase.history)) {
    return testCase.question;
  }
  return condenseQuery(testCase.history, testCase.question);
}

interface RecallMetrics {
  recallAtK: Record<number, number>;
  mrr: number;
}

function normalizeRef(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Relevance on stable CAO structure: a retrieved passage is relevant when its article matches the
 * case's expected article (and lid, when both sides specify one). Matching on article/lid rather
 * than chunk id keeps Gate B stable across structure-aware re-chunking (Fase 10).
 */
function passageMatchesCase(passageId: string, testCase: GoldenCase): boolean {
  const passage = passageById(passageId);
  if (!passage?.article || !testCase.expectedArticle) {
    return false;
  }
  if (normalizeRef(passage.article) !== normalizeRef(testCase.expectedArticle)) {
    return false;
  }
  if (testCase.expectedLid && passage.lid) {
    return normalizeRef(passage.lid) === normalizeRef(testCase.expectedLid);
  }
  return true;
}

function scoreRecall(rankedPassageIds: string[][], queries: GoldenCase[]): RecallMetrics {
  const recallHits: Record<number, number> = {};
  for (const k of K_VALUES) recallHits[k] = 0;
  let reciprocalRankSum = 0;

  queries.forEach((query, queryIndex) => {
    const ranked = rankedPassageIds[queryIndex] ?? [];
    const rank = ranked.findIndex((id) => passageMatchesCase(id, query)) + 1;
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
  const retrievalQueries = goldenCases.filter(
    (testCase) => testCase.category !== "refusal" && (!testCase.history || testCase.history.length === 0),
  );

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
  const rerankedBefore: string[][] = [];
  const rerankedAfter: string[][] = [];
  const rerankedQueries: GoldenCase[] = [];
  let rerankedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let queryIndex = 0; queryIndex < retrievalQueries.length; queryIndex++) {
    const queryVector = queryVectors[queryIndex] as number[];
    const query = retrievalQueries[queryIndex] as (typeof retrievalQueries)[number];

    const cosineRanked = goldenPassages
      .map((passage, passageIndex) => ({
        passage,
        score: dot(queryVector, passageVectors[passageIndex] as number[]),
      }))
      .sort((a, b) => b.score - a.score);

    const candidates = cosineRanked.slice(0, rerankConfig.candidateK);
    beforeRankings.push(candidates.map((entry) => entry.passage.id));

    if (candidates.length === 0) {
      afterRankings.push([]);
      continue;
    }

    const candidateHits = candidates.map((entry) => ({
      ...passageToHit(entry.passage),
      score: entry.score,
    }));
    const result = await rerank({
      query: query.question,
      chunks: candidateHits,
      topK: rerankConfig.topK,
    });
    afterRankings.push(result.chunks.map((chunk) => chunk.chunkId));

    if (result.status === "reranked") {
      rerankedCount += 1;
      rerankedBefore.push(candidates.map((entry) => entry.passage.id));
      rerankedAfter.push(result.chunks.map((chunk) => chunk.chunkId));
      rerankedQueries.push(query);
    } else if (result.status === "skipped") {
      skippedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  const beforeMetrics = scoreRecall(beforeRankings, retrievalQueries);
  const afterMetrics = scoreRecall(afterRankings, retrievalQueries);
  const rerankMrrDelta =
    rerankedQueries.length > 0
      ? scoreRecall(rerankedAfter, rerankedQueries).mrr - scoreRecall(rerankedBefore, rerankedQueries).mrr
      : 0;

  console.log(
    `\nRetrieval recall — corpus v${GOLDEN_CORPUS_VERSION}, model ${embeddingConfig.model} @ ` +
      `${String(passageResult.dim)} dim, rerank ${rerankConfig.model}, ` +
      `${String(goldenPassages.length)} passages, ${String(retrievalQueries.length)} queries:`,
  );
  logRecallMetrics("before rerank (cosine top-" + String(rerankConfig.candidateK) + ")", beforeMetrics, RETRIEVAL_THRESHOLDS);
  logRecallMetrics("after rerank (top-" + String(rerankConfig.topK) + ")", afterMetrics, RETRIEVAL_THRESHOLDS);
  console.log(
    `  rerank run — reranked: ${String(rerankedCount)}, skipped: ${String(skippedCount)}, failed: ${String(failedCount)} (of ${String(retrievalQueries.length)})`,
  );
  console.log(
    `  rerank delta (reranked queries only) — hit@1: ${pct((afterMetrics.recallAtK[1] ?? 0) - (beforeMetrics.recallAtK[1] ?? 0))}, ` +
      `MRR: ${rerankMrrDelta >= 0 ? "+" : ""}${rerankMrrDelta.toFixed(3)}` +
      (rerankedQueries.length === 0 ? " (no queries reranked)" : ""),
  );
  console.log("");

  const current: RetrievalBaseline = {
    hitAt1: beforeMetrics.recallAtK[1] ?? 0,
    recallAt3: beforeMetrics.recallAtK[3] ?? 0,
    recallAt5: beforeMetrics.recallAtK[PRIMARY_K] ?? 0,
    mrr: beforeMetrics.mrr,
  };
  if (env.EVAL_WRITE_BASELINE === "1" || env.EVAL_WRITE_BASELINE === "true") {
    updateBaselineSection({ corpusVersion: GOLDEN_CORPUS_VERSION, retrieval: current });
    console.log("  baseline: retrieval section recorded.\n");
  }

  return [
    {
      name: "retrieval: embedding dim matches pinned EMBEDDING_CONFIG.dim",
      ok: dimOk,
      detail: dimOk ? undefined : `got ${String(passageResult.dim)}, expected ${String(embeddingConfig.dim)}`,
    },
    ...recallChecks("retrieval (before rerank)", beforeMetrics, RETRIEVAL_THRESHOLDS),
    {
      name: "rerank: no silent failures",
      ok: failedCount === 0,
      detail: `${String(failedCount)} failed of ${String(retrievalQueries.length)}`,
    },
    {
      name: "rerank: MRR does not regress on reranked queries (delta >= 0)",
      ok: rerankMrrDelta >= 0,
      detail:
        rerankedQueries.length > 0
          ? `MRR delta ${rerankMrrDelta >= 0 ? "+" : ""}${rerankMrrDelta.toFixed(3)} over ${String(rerankedQueries.length)} reranked queries`
          : "no queries reranked",
    },
    ...retrievalRegressionChecks(current),
  ];
}

/** Regression-relative retrieval checks against the committed baseline (same corpus snapshot only). */
function retrievalRegressionChecks(current: RetrievalBaseline): Check[] {
  const baseline = readBaseline();
  if (!baseline?.retrieval) {
    return [];
  }
  if (baseline.corpusVersion !== GOLDEN_CORPUS_VERSION) {
    console.log(
      `  baseline: corpus v${baseline.corpusVersion ?? "?"} != v${GOLDEN_CORPUS_VERSION}, ` +
        "skipping relative retrieval checks (re-record with EVAL_WRITE_BASELINE=1).\n",
    );
    return [];
  }
  const ref = baseline.retrieval;
  const entries: [string, number, number][] = [
    ["hit@1", current.hitAt1, ref.hitAt1],
    ["recall@3", current.recallAt3, ref.recallAt3],
    ["recall@5", current.recallAt5, ref.recallAt5],
    ["MRR", current.mrr, ref.mrr],
  ];
  return entries.map(([label, now, was]) => ({
    name: `retrieval regression: ${label} within ${pct(REL_TOLERANCE)} of baseline`,
    ok: now >= was - REL_TOLERANCE,
    detail: `${now.toFixed(3)} vs baseline ${was.toFixed(3)}`,
  }));
}

async function condensationChecks(): Promise<Check[]> {
  const embeddingConfig = requireEmbeddingConfig();
  const rerankConfig = requireRerankConfig();
  const followUps = goldenCases.filter((testCase) => Array.isArray(testCase.history) && testCase.history.length > 0);
  if (followUps.length === 0) {
    return [{ name: "condensation: at least one multi-turn golden case exists", ok: false }];
  }

  const passageResult = await embed({
    texts: goldenPassages.map((passage) => passage.content),
    model: embeddingConfig.model,
    version: embeddingConfig.version,
  });
  const passageVectors = normalize(passageResult.embeddings);
  const checks: Check[] = [];

  for (const testCase of followUps) {
    const history = testCase.history ?? [];
    const elliptical = isElliptical(testCase.question, history);
    checks.push({
      name: `condensation: "${testCase.id}" is detected as elliptical`,
      ok: elliptical,
    });
    if (!elliptical) {
      continue;
    }

    const condensed = await condenseQuery(history, testCase.question);
    const queryResult = await embed({
      texts: [condensed],
      model: embeddingConfig.model,
      version: embeddingConfig.version,
    });
    const [queryVector] = normalize(queryResult.embeddings);
    const cosineRanked = goldenPassages
      .map((passage, passageIndex) => ({
        passage,
        score: dot(queryVector as number[], passageVectors[passageIndex] as number[]),
      }))
      .sort((a, b) => b.score - a.score);
    const candidates = cosineRanked.slice(0, rerankConfig.candidateK);
    const candidateHits = candidates.map((entry) => ({
      ...passageToHit(entry.passage),
      score: entry.score,
    }));
    const result = await rerank({
      query: condensed,
      chunks: candidateHits,
      topK: rerankConfig.topK,
    });
    const rankedIds = result.chunks.map((chunk) => chunk.chunkId);

    if (result.status === "failed") {
      checks.push({
        name: `condensation: "${testCase.id}" rerank did not fail`,
        ok: false,
        detail: result.reason,
      });
    }

    checks.push({
      name: `condensation: "${testCase.id}" retrieves the expected article after rewrite`,
      ok: rankedIds.some((id) => passageMatchesCase(id, testCase)),
      detail: `condensed="${condensed}" top=${rankedIds.join(", ")}`,
    });
  }

  return checks;
}

function answerLevelChecks(aggregate: AggregateScores): Check[] {
  console.log(`\nAnswer-level scores (${String(aggregate.caseCount)} cases):`);
  console.log(
    `  hard-hallucination    ${pct(aggregate.hardHallucination)}  (min ${pct(ANSWER_THRESHOLDS.hardHallucination)})`,
  );
  console.log(
    `  soft-faithfulness     ${pct(aggregate.faithfulness)}  (min ${pct(ANSWER_THRESHOLDS.softFaithfulness)})`,
  );
  console.log(`  answer-relevance      ${pct(aggregate.relevance)}  (min ${pct(ANSWER_THRESHOLDS.relevance)})`);
  console.log(
    `  citation-correctness  ${pct(aggregate.citationCorrectness)}  (min ${pct(ANSWER_THRESHOLDS.citationCorrectness)})`,
  );
  console.log(`  completeness          ${pct(aggregate.completeness)}  (min ${pct(ANSWER_THRESHOLDS.completeness)})`);
  console.log(
    `  refusal-calibration   ${pct(aggregate.refusalCalibration)}  (min ${pct(ANSWER_THRESHOLDS.refusalCalibration)})`,
  );
  console.log(
    `  citation-verification ${pct(aggregate.citationVerification)}  (min ${pct(ANSWER_THRESHOLDS.citationVerification)})`,
  );
  console.log(
    `  orphan-source-rate    ${pct(aggregate.orphanRate)}  (max ${pct(ANSWER_THRESHOLDS.maxOrphanRate)})`,
  );
  console.log(
    `  dangling-marker-rate  ${pct(aggregate.danglingMarkerRate)}  (max ${pct(ANSWER_THRESHOLDS.maxDanglingMarkerRate)})`,
  );
  console.log(
    `  over-refusal-rate     ${pct(aggregate.overRefusalRate)}  (max ${pct(ANSWER_THRESHOLDS.maxOverRefusalRate)})`,
  );
  console.log(
    `  under-refusal-rate    ${pct(aggregate.underRefusalRate)}  (max ${pct(ANSWER_THRESHOLDS.maxUnderRefusalRate)})\n`,
  );

  return [
    {
      name: `answer: hard-hallucination >= ${pct(ANSWER_THRESHOLDS.hardHallucination)} (invented amounts/terms/articles)`,
      ok: aggregate.hardHallucination >= ANSWER_THRESHOLDS.hardHallucination,
    },
    {
      name: `answer: soft-faithfulness >= ${pct(ANSWER_THRESHOLDS.softFaithfulness)}`,
      ok: aggregate.faithfulness >= ANSWER_THRESHOLDS.softFaithfulness,
    },
    {
      name: `answer: relevance >= ${pct(ANSWER_THRESHOLDS.relevance)} (addresses the actual question)`,
      ok: aggregate.relevance >= ANSWER_THRESHOLDS.relevance,
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
    {
      name: `answer: citation-verification >= ${pct(ANSWER_THRESHOLDS.citationVerification)} (verbatim quotes)`,
      ok: aggregate.citationVerification >= ANSWER_THRESHOLDS.citationVerification,
    },
    {
      name: `answer: orphan-source-rate <= ${pct(ANSWER_THRESHOLDS.maxOrphanRate)} (source without [n])`,
      ok: aggregate.orphanRate <= ANSWER_THRESHOLDS.maxOrphanRate,
    },
    {
      name: `answer: dangling-marker-rate <= ${pct(ANSWER_THRESHOLDS.maxDanglingMarkerRate)} ([n] without verified source)`,
      ok: aggregate.danglingMarkerRate <= ANSWER_THRESHOLDS.maxDanglingMarkerRate,
    },
    {
      name: `answer: over-refusal-rate <= ${pct(ANSWER_THRESHOLDS.maxOverRefusalRate)} (answerable but refused)`,
      ok: aggregate.overRefusalRate <= ANSWER_THRESHOLDS.maxOverRefusalRate,
    },
    {
      name: `answer: under-refusal-rate <= ${pct(ANSWER_THRESHOLDS.maxUnderRefusalRate)} (should have refused)`,
      ok: aggregate.underRefusalRate <= ANSWER_THRESHOLDS.maxUnderRefusalRate,
    },
    ...answerRegressionChecks(aggregate),
  ];
}

/** Regression-relative answer checks against the committed baseline (same corpus snapshot only). */
function answerRegressionChecks(aggregate: AggregateScores): Check[] {
  const baseline = readBaseline();
  if (!baseline?.answer) {
    return [];
  }
  if (baseline.corpusVersion !== GOLDEN_CORPUS_VERSION) {
    return [];
  }
  const ref = baseline.answer;
  const higherIsBetter: [string, number, number][] = [
    ["hard-hallucination", aggregate.hardHallucination, ref.hardHallucination],
    ["soft-faithfulness", aggregate.faithfulness, ref.faithfulness],
    ...(ref.relevance === undefined ? [] : ([["relevance", aggregate.relevance, ref.relevance]] as [string, number, number][])),
    ["citation-correctness", aggregate.citationCorrectness, ref.citationCorrectness],
    ["completeness", aggregate.completeness, ref.completeness],
    ["refusal-calibration", aggregate.refusalCalibration, ref.refusalCalibration],
    ...(ref.citationVerification === undefined
      ? []
      : ([["citation-verification", aggregate.citationVerification, ref.citationVerification]] as [
          string,
          number,
          number,
        ][])),
  ];
  const lowerIsBetter: [string, number, number][] = [
    ["over-refusal-rate", aggregate.overRefusalRate, ref.overRefusalRate],
    ["under-refusal-rate", aggregate.underRefusalRate, ref.underRefusalRate],
    ...(ref.orphanRate === undefined
      ? []
      : ([["orphan-source-rate", aggregate.orphanRate, ref.orphanRate]] as [string, number, number][])),
    ...(ref.danglingMarkerRate === undefined
      ? []
      : ([["dangling-marker-rate", aggregate.danglingMarkerRate, ref.danglingMarkerRate]] as [
          string,
          number,
          number,
        ][])),
  ];
  return [
    ...higherIsBetter.map(([label, now, was]) => ({
      name: `answer regression: ${label} within ${pct(REL_TOLERANCE)} of baseline`,
      ok: now >= was - REL_TOLERANCE,
      detail: `${now.toFixed(3)} vs baseline ${was.toFixed(3)}`,
    })),
    ...lowerIsBetter.map(([label, now, was]) => ({
      name: `answer regression: ${label} not more than ${pct(REL_TOLERANCE)} above baseline`,
      ok: now <= was + REL_TOLERANCE,
      detail: `${now.toFixed(3)} vs baseline ${was.toFixed(3)}`,
    })),
  ];
}

async function answerQualityChecks(): Promise<Check[]> {
  const caseScores: CaseScores[] = [];

  for (const testCase of goldenCases) {
    // Every case — including refusals — runs the real generation path. Refusal cases are given
    // near-miss distractor context (see golden-set.ts), so the model must actually refuse instead
    // of receiving a hardcoded refusal. This is what makes the under-refusal rate measurable.
    const passages = passagesForCase(testCase);
    const context = assembleEvalContext(passages);
    const question = await evalQuestion(testCase);
    const generated = await retryWithBackoff(
      () =>
        generateText({
          model: EVAL_LLM_MODEL,
          messages: [
            { role: "system", content: CAO_SYSTEM_INSTRUCTIONS },
            { role: "user", content: buildAnswerPrompt(context, question) },
          ],
          // Single source of truth: packages/shared/src/config/generation.ts (same as production agent).
          temperature: GENERATION_CONFIG.temperature,
          maxTokens: GENERATION_CONFIG.maxTokens,
        }),
      { baseDelayMs: 5000, maxAttempts: 8 },
    );
    const answer = generated.text;
    await sleep(2000);

    caseScores.push(await scoreAnswerCase(testCase, passages, answer, NOT_FOUND_MESSAGE));
  }

  const aggregate = aggregateScores(caseScores);
  if (env.EVAL_WRITE_BASELINE === "1" || env.EVAL_WRITE_BASELINE === "true") {
    const answerBaseline: AnswerBaseline = {
      hardHallucination: aggregate.hardHallucination,
      faithfulness: aggregate.faithfulness,
      relevance: aggregate.relevance,
      citationCorrectness: aggregate.citationCorrectness,
      completeness: aggregate.completeness,
      refusalCalibration: aggregate.refusalCalibration,
      citationVerification: aggregate.citationVerification,
      orphanRate: aggregate.orphanRate,
      danglingMarkerRate: aggregate.danglingMarkerRate,
      overRefusalRate: aggregate.overRefusalRate,
      underRefusalRate: aggregate.underRefusalRate,
    };
    updateBaselineSection({ corpusVersion: GOLDEN_CORPUS_VERSION, answer: answerBaseline });
    console.log("  baseline: answer section recorded.\n");
  }

  return answerLevelChecks(aggregate);
}

/**
 * Corpus-isolation gate (Fase B/E): one session = one corpus, enforced at the seam. Two layers:
 *   - contract (always runs): the retrieval seam REQUIRES a fund; an unscoped input must be rejected,
 *     so no code path can ever run an all-funds query;
 *   - integration (needs DATABASE_URL + SCALEWAY_API_KEY): for every fund in the corpus, a broad
 *     query returns ONLY chunks from that fund — cross-fund leakage fails the gate.
 */
function corpusIsolationContractChecks(): Check[] {
  const unscoped = retrievalInputSchema.safeParse({ query: "vakantiedagen" });
  const scoped = retrievalInputSchema.safeParse({ query: "vakantiedagen", fund: "demo" });
  return [
    {
      name: "corpus-isolation: retrieval seam rejects an unscoped (no-fund) query",
      ok: !unscoped.success,
    },
    {
      name: "corpus-isolation: retrieval seam accepts a fund-scoped query",
      ok: scoped.success,
    },
  ];
}

async function corpusIsolationLiveChecks(): Promise<Check[]> {
  const funds = await listFunds();
  if (funds.length === 0) {
    return [{ name: "corpus-isolation: corpus has at least one fund to test", ok: false, detail: "no funds ingested" }];
  }

  const probeQuery = "vakantie loon toeslag pensioen arbeidsduur";
  const checks: Check[] = [];
  for (const fund of funds) {
    const result = await retrieveContext({ query: probeQuery, fund, topK: 20, minScore: 0 });
    const leaked = result.chunks.filter((chunk) => chunk.source.fund !== fund);
    checks.push({
      name: `corpus-isolation: fund "${fund}" returns only its own chunks`,
      ok: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `${String(result.chunks.length)} chunks, 0 cross-fund`
          : `${String(leaked.length)} chunk(s) leaked from ${[...new Set(leaked.map((c) => c.source.fund))].join(", ")}`,
    });
  }

  console.log(
    `\nCorpus isolation — probed ${String(funds.length)} fund(s): ${funds.join(", ")} with a broad query.`,
  );
  return checks;
}

function report(title: string, checks: Check[]): boolean {
  console.log(title);
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`  [${status}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  return checks.every((check) => check.ok);
}

/**
 * Handle a gate that cannot run because its API keys are missing. Under EVAL_REQUIRE_ALL (the
 * merge-to-main job) this is a FAIL — skipped != passed; otherwise it is an explicit dev skip.
 */
function reportUnavailable(gate: string, requirement: string): boolean {
  if (REQUIRE_ALL) {
    console.log(`\n${gate}: REQUIRED-BUT-UNAVAILABLE — ${requirement} (EVAL_REQUIRE_ALL is set).`);
    return false;
  }
  console.log(`\n${gate}: SKIPPED (${requirement}). Set the key(s) to run this gate; required on merge to main.`);
  return true;
}

async function main(): Promise<void> {
  let allPassed = true;

  // Gate A — corpus-agnostic base layer (contract-test, always runs).
  allPassed =
    report("Gate A — prompt & clarify CONTRACT (change-detector, not a behavioral gate):", [
      ...promptContractChecks(),
      ...clarifyContractChecks(),
    ]) && allPassed;

  // Gate B — fund-specific layer (retrieval is corpus/fund-bound).
  if (env.SCALEWAY_API_KEY) {
    allPassed =
      report("Gate B — retrieval recall + rerank [fund-specific layer]:", await retrievalAndRerankChecks()) &&
      allPassed;
  } else {
    allPassed = reportUnavailable("Gate B — retrieval recall", "SCALEWAY_API_KEY not set") && allPassed;
  }

  if (env.SCALEWAY_API_KEY && env.MISTRAL_API_KEY) {
    allPassed =
      report("Gate B2 — multi-turn condensation retrieval:", await condensationChecks()) &&
      allPassed;
  } else {
    allPassed =
      reportUnavailable("Gate B2 — multi-turn condensation retrieval", "SCALEWAY_API_KEY and MISTRAL_API_KEY required") &&
      allPassed;
  }

  // Gate C — behavioral layer (answer quality; correctness checks are fund-specific).
  if (env.SCALEWAY_API_KEY && env.MISTRAL_API_KEY) {
    allPassed = report("Gate C — answer-level quality:", await answerQualityChecks()) && allPassed;
  } else {
    allPassed =
      reportUnavailable("Gate C — answer-level quality", "SCALEWAY_API_KEY and MISTRAL_API_KEY required") &&
      allPassed;
  }

  // Gate D — corpus isolation. The contract layer always runs; the live cross-fund test needs a DB.
  allPassed = report("Gate D — corpus isolation (contract):", corpusIsolationContractChecks()) && allPassed;
  if (env.DATABASE_URL && env.SCALEWAY_API_KEY) {
    allPassed = report("Gate D — corpus isolation (integration):", await corpusIsolationLiveChecks()) && allPassed;
  } else {
    allPassed =
      reportUnavailable("Gate D — corpus isolation (integration)", "DATABASE_URL and SCALEWAY_API_KEY required") &&
      allPassed;
  }

  if (!allPassed) {
    console.error("\nEval FAILED — an accuracy gate regressed or a required gate could not run. See above.");
    process.exitCode = 1;
    return;
  }
  console.log("\nEval PASSED.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
