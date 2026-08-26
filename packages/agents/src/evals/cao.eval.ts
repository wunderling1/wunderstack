/**
 * Multi-agent eval-suite — the CI quality gate that blocks accuracy regressions.
 *
 * Single process / single `eval-report.json` for every registered agent (see agent-profile.ts).
 * CAO owns the G2 base golden set; other agents contribute G1 prompt contracts and G3-fund sets
 * via `FUND_SET_META.agentKey`. Do not add a second `*.eval.ts` for agent 3 — add a profile.
 *
 * The golden set is split into two physical layers (see golden-set.ts):
 *   BASE — golden-set.base.jsonl + golden-passages.jsonl: corpus-agnostic behavioral cases that run
 *     on the committed FIXTURES, reproducible from the repo on every PR (G1, G2 below).
 *   FUND — golden-set.<fund>.jsonl: fund-specific correctness scored against the REAL ingested corpus
 *     via the production pipeline (G3-pipeline + G3-fund). Needs a DB, so nightly / path-filtered PRs.
 *
 * The gates (each with its own doc-comment at its definition):
 *
 *   G1 — Prompt & clarify CONTRACT (offline, deterministic, always runs).
 *     A change-detector, NOT a behavioral gate: it asserts the system prompt still carries its
 *     non-negotiable grounding rules and that the deterministic clarify router fires on the right
 *     inputs. A prompt can contain a rule the model ignores; whether the model actually OBEYS the
 *     rules is tested behaviorally in G2-answer. Clarify lives here because it is pure routing logic
 *     (see ../cao/clarify.ts), not an LLM call, so it is genuinely testable offline.
 *
 *   G2-retrieval — Retrieval recall + rerank effect (needs SCALEWAY_API_KEY). Base layer.
 *     Embeds golden passages + questions with the pinned production embedding model, scores cosine
 *     recall@k + MRR before and after the sovereign reranker. Relevance is matched on ARTICLE/LID
 *     (stable CAO structure), never on chunk id, so structure-aware re-chunking cannot break it for
 *     the wrong reason. The rerank step is a real gate (MRR may not regress), not just a report.
 *
 *   G2-answer — Answer-level quality (needs SCALEWAY_API_KEY + MISTRAL_API_KEY).
 *     Generates answers on golden context and scores hard-hallucination (deterministic, near-zero
 *     tolerance), soft faithfulness + completeness (LLM-judge), citation-correctness, and two-sided
 *     refusal calibration (over- and under-refusal). Judge = generator (P4 retired; see judge.ts).
 *
 * Skipped != passed: when EVAL_REQUIRE_ALL is set (the merge-to-main job), a gate whose API keys
 * are missing FAILS instead of skipping. Locally it skips so dev runs stay cheap.
 *
 * Backlog (not gated yet): latency and per-run token cost. Worth adding a soft budget gate before
 * production, but out of scope here — see PLAN-eval-gates.md.
 *
 * Run: pnpm --filter @wunderstack/agents test   (loads repo-root .env automatically)
 *
 * A flock-equivalent lock (see eval-lock.ts) prevents parallel runs — starting a second eval while
 * one is in flight exits immediately with a clear message instead of competing for the DB/API.
 */

import { DEFAULT_LLM_MODEL, embed, generateText, isRateLimited } from "@wunderstack/ai";
import {
  closeDb,
  listCorpusDocuments,
  listStructuralRefs,
  rerank,
  retrieveContext,
  assemble,
  type CorpusDocument,
  type RetrievedChunk,
  type StructuralRefs,
} from "@wunderstack/rag";
import {
  env,
  EVAL_FIXTURE_FUND,
  GENERATION_CONFIG,
  requireEmbeddingConfig,
  requireRerankConfig,
} from "@wunderstack/shared";

import { detectClarification } from "../cao/clarify.js";
import { condenseQuery, isElliptical, retrievalQueriesForFollowUp } from "../runtime/condense.js";
import { generateAnswerWithRepair } from "../runtime/generate-answer.js";
import { verifyAndBuild } from "../cao/agent.js";
import { type RetrievalOutput } from "../cao/tools.js";
import { agentQuestionSchema } from "../types.js";
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
  GOLDEN_FIXTURE_HASH,
  type GoldenCase,
  type GoldenFundCase,
  type GoldenFundSet,
  type GoldenPassage,
  goldenCases,
  goldenFundSets,
  goldenPassages,
  passageById,
  passageToHit,
  passagesForCase,
} from "./golden-set.js";
import { ANSWER_THRESHOLDS, MULTI_TURN_SERVE_THRESHOLDS, answerFloorFailures } from "./answer-floors.js";
import { acquireEvalLock, EvalAlreadyRunningError } from "./eval-lock.js";
import { appendFundRecords, fundRecordsFromReport, resolveCommitSha } from "./fund-ledger.js";
import { extraPromptContractChecks } from "./agent-profile.js";
import { corpusIsolationContractChecks, corpusIsolationLiveChecks } from "./corpus-isolation.js";
import { createEvalHarness, type EvalCheck as Check, type GateGroup, type GateRunResult } from "./harness.js";
import { GATE_SPECS, type GateId, type GateSpec } from "./gates.js";
import {
  aggregateScores,
  assembleEvalContext,
  getJudgeParseRetryCount,
  JUDGE_MODEL,
  scoreAnswerCase,
  type AggregateScores,
} from "./judge.js";
import {
  EVAL_REPORT_SCHEMA_VERSION,
  writeEvalReport,
  type EvalReport,
  type FundLayerReport,
  type RetrievalReport,
  type RetrievalIntegrationReport,
  type AnswerCaseReport,
  type AnswerReport,
  type FundCaseDiagnosis,
  type RoleplayPersonaReport,
  type RoleplayReviewReport,
} from "./report-writer.js";
import { roleplayContractChecks } from "./roleplay-contract.js";
import { runRoleplayPersonaGate, runRoleplayReviewGate } from "./roleplay-gates.js";
import { retryWithBackoff, sleep } from "./retry.js";

/**
 * Generator model — the SAME model the production agent ships (`DEFAULT_LLM_MODEL`), so Gate C scores
 * what users actually get instead of drifting to a cheaper model. EVAL_GENERATION_MODEL overrides it
 * to A/B another sovereign generator without a code change; @wunderstack/ai enforces EU-sovereignty on
 * whatever is passed. NOTE: the judge also runs on mistral-large-2512 (P4 retired 2026-08-22), so
 * soft metrics (faithfulness/relevance/completeness) have full self-preference. Blocking floors
 * (hard-hallucination, citation-verification, dangling, under-refusal counts) are deterministic and
 * judge-independent, so this bias does not touch the gates that carry the promise.
 */
const EVAL_LLM_MODEL = env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL;
const K_VALUES = [1, 3, 5] as const;
/** Primary "what the model sees" metric — must match RERANK_CONFIG.topK (5) and production topK. */
const PRIMARY_K = 5;

/** True when a missing-key gate must fail rather than skip (set on the merge-to-main CI job). */
const REQUIRE_ALL = env.EVAL_REQUIRE_ALL === "1" || env.EVAL_REQUIRE_ALL === "true";

/** Recall/MRR bar shape, shared by the in-memory Gate B and the nightly Gate B-integration. */
type RetrievalThresholds = {
  readonly hitAt1: number;
  readonly recallAt3: number;
  readonly recallAt5: number;
  readonly mrr: number;
};

/**
 * Like REQUIRE_ALL but for the DB-backed integration gates (Gate B-integration + Gate D integration).
 * Set only on the nightly job, which wires a staging DATABASE_URL; on PRs the DB is absent by design,
 * so those gates skip rather than fail. This keeps the DB requirement off the fast PR hot path (E11).
 */
const REQUIRE_DB = env.EVAL_REQUIRE_DB === "1" || env.EVAL_REQUIRE_DB === "true";

/**
 * Development filter: run only these gate ids. Exists because iterating on one gate should not cost
 * a full suite run, and a `.only` that lives in a diff is worse than one that lives in the shell.
 *
 * It is refused outright on the protected paths (see `assertGateFilterAllowed`). A filter and
 * "skipped != passed" are the same question asked twice — a run that silently dropped half the
 * registry is exactly the failure §4.2 exists to prevent — so instead of trying to make them
 * coexist, the filter is simply unavailable where the gates are required.
 */
const GATE_FILTER = (env.EVAL_ONLY ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

function assertGateFilterAllowed(): void {
  if (GATE_FILTER.length === 0) {
    return;
  }
  if (REQUIRE_ALL || REQUIRE_DB) {
    throw new Error(
      "EVAL_ONLY is not allowed together with EVAL_REQUIRE_ALL/EVAL_REQUIRE_DB: a protected run " +
        "must walk the whole gate registry. Unset EVAL_ONLY.",
    );
  }
  const known = new Set<string>(GATE_SPECS.map((spec) => spec.id));
  const unknown = GATE_FILTER.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `EVAL_ONLY names unknown gate id(s): ${unknown.join(", ")}. Known ids: ${[...known].join(", ")}.`,
    );
  }
}

const {
  gateResults,
  pushGate,
  pushUnavailable,
  credentialsAvailable,
  requirementLabel,
} = createEvalHarness({ requireAll: REQUIRE_ALL, requireDb: REQUIRE_DB });

/** Corpus agent key for eval retrieval — legacy CAO-only gates default here; fund sets carry their own. */
const EVAL_AGENT_KEY = "cao";

/**
 * The exact request defaults the production chat path uses, read straight from the agent contract
 * (agentQuestionSchema). Gate B-integration passes these to `retrieveContext` so it measures what
 * production actually does — topK (5) and minScore (0.48) — closing divergences #3/#6 for the nightly.
 */
const PRODUCTION_DEFAULTS = agentQuestionSchema.parse({ question: "_", fund: EVAL_FIXTURE_FUND });

/**
 * Gate B-integration thresholds. Deliberately LOWER than the in-memory Gate B thresholds: the real
 * pipeline adds query rewrite, pgvector flat search, the minScore (0.48) floor and production
 * skip-rerank — it behaves differently from clean in-memory cosine. PROVISIONAL: measure ~2 weeks of
 * nightly runs (recorded in eval-report.json), then tighten. See PLAN Fase E11.
 */
const RETRIEVAL_INTEGRATION_THRESHOLDS: RetrievalThresholds = {
  hitAt1: 0.7,
  recallAt3: 0.8,
  recallAt5: 0.8,
  mrr: 0.75,
};

/**
 * Out-of-corpus probes for the minScore refuse-without-LLM guard (divergence #6). None of these are
 * in any CAO, so at the production minScore (0.48) the real pipeline should return zero chunks —
 * exercising the "nothing clears the floor -> refuse without calling the LLM" path that no gate
 * covered. The golden refusal cases cannot serve here: by design (E3) they carry in-corpus near-miss
 * distractors, which DO clear the floor. We require MIN_SCORE_GUARD_REQUIRED of them empty (one slot
 * of slack for embedding noise).
 *
 * Used by BOTH the base layer and the fund layer, because these probes are corpus-independent by
 * construction: measured over `eval-fixtures`, `demo` and the 245-chunk ETD corpus they top out at
 * 0.378 against a 0.48 floor (`scripts/eval/refusal-guard-report.md`, 2026-07-31).
 */
const MIN_SCORE_PROBES = [
  "Hoeveel zonuren waren er gemiddeld in Valencia afgelopen zomer?",
  "Wat is het recept voor een klassieke tarte tatin met karamel?",
  "Welke schroefdraadmaat hoort bij een M8-bout in de ruimtevaart?",
] as const;
const MIN_SCORE_GUARD_REQUIRED = 2;

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
 * Run accumulators for the E9 artefact. Filled as gates execute; serialized once at the end of
 * main() (also on failure). Module-level because the eval is a single-run process — no reuse.
 */
let retrievalReport: RetrievalReport | null = null;
let retrievalIntegrationReport: RetrievalIntegrationReport | null = null;
let answerReport: AnswerReport | null = null;
let roleplayPersonaReport: RoleplayPersonaReport | null = null;
let roleplayReviewReport: RoleplayReviewReport | null = null;
const fundLayerReports: FundLayerReport[] = [];
let embeddingModelId: string | null = null;
let rerankModelId: string | null = null;

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
      // The documented-no exception used to quote the reiskosten passage verbatim, which is the
      // distractor for etd-032 (fietsplan). The model then treated that near-miss as a documented
      // no and answered it. The exception is only for the asked subject.
      name: "prompt: documented-no applies only to the asked subject",
      ok:
        /gevraagde onderwerp/i.test(instructions) &&
        !/woon-werkverkeer bestaat geen recht op vergoeding/i.test(instructions),
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
    {
      // Tier B: quotes must be one contiguous span; stitching with "…" / "..." is forbidden
      // (baseline v4 etd-010/018). Multiple citation objects may share a marker instead.
      name: "prompt: citation quotes must be contiguous (no ellipsis stitching)",
      ok: /aaneengesloten/i.test(instructions) && /(…|\.\.\.)/.test(instructions),
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

/**
 * Fixture-hygiene guard (Gate A, offline). The golden set is hand-curated (the generator was
 * removed in E10); nothing else forces a GOLDEN_CORPUS_VERSION bump when a fixture is edited. If the
 * content hash drifts from the recorded baseline while the version is unchanged, the baseline no
 * longer describes the fixtures it was measured on — so we fail loud with the fix instructions.
 *
 * Only checks when a baseline for the CURRENT version exists: a deliberate version bump makes the
 * old hash intentionally stale (resolved by re-recording), and a baseline without a hash predates
 * this mechanism (nothing to compare).
 */
function fixtureHashChecks(): Check[] {
  const baseline = readBaseline();
  if (!baseline?.fixtureHash || baseline.corpusVersion !== GOLDEN_CORPUS_VERSION) {
    return [];
  }
  const match = baseline.fixtureHash === GOLDEN_FIXTURE_HASH;
  return [
    {
      name: "fixtures: golden set matches the recorded baseline (or GOLDEN_CORPUS_VERSION was bumped)",
      ok: match,
      detail: match
        ? undefined
        : `fixture hash ${GOLDEN_FIXTURE_HASH.slice(0, 12)}… != baseline ${baseline.fixtureHash.slice(0, 12)}… at the same corpusVersion "${GOLDEN_CORPUS_VERSION}". ` +
          "Bump GOLDEN_CORPUS_VERSION and re-record the baseline (EVAL_WRITE_BASELINE=1).",
    },
  ];
}

/**
 * Condense with the same rate-limit backoff as generation and judging. condenseQuery hits the LLM, so
 * on the (stronger, busier) default model it can catch a transient 429 exactly like the other calls; an
 * unwrapped condense here would crash the whole run on a single provider hiccup (golden-set.REVIEW.md §18).
 */
function condenseWithRetry(...args: Parameters<typeof condenseQuery>): Promise<string> {
  return retryWithBackoff(() => condenseQuery(...args), { baseDelayMs: 5000, maxAttempts: 8 });
}

async function evalQuestion(testCase: GoldenCase): Promise<string> {
  if (!testCase.history || !isElliptical(testCase.question, testCase.history)) {
    return testCase.question;
  }
  return condenseWithRetry(testCase.history, testCase.question);
}

const EVAL_RETRIEVAL_TIMINGS = {
  rewriteMs: 0,
  embedMs: 0,
  searchMs: 0,
  rerankMs: 0,
  totalMs: 0,
};

function retrievalOutputFromPassages(passages: GoldenPassage[]): RetrievalOutput {
  const chunks = passages.map((passage) => passageToHit(passage));
  const assembled = assemble(chunks, EVAL_RETRIEVAL_TIMINGS);
  return {
    context: assembled.context,
    citations: assembled.citations,
    hits: chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      ordinal: chunk.ordinal,
      score: chunk.score,
      title: chunk.source.title,
    })),
    timings: EVAL_RETRIEVAL_TIMINGS,
    chunks,
    fullChunkContent: passages.map((passage) => [passage.id, passage.content]),
  };
}

async function rankPassageIdsForQueries(
  queries: string[],
  embeddingConfig: ReturnType<typeof requireEmbeddingConfig>,
  rerankConfig: ReturnType<typeof requireRerankConfig>,
): Promise<{ rankedIds: string[]; rerankFailed: boolean; rerankReason?: string }> {
  const passageResult = await embed({
    texts: goldenPassages.map((passage) => passage.content),
    model: embeddingConfig.model,
    version: embeddingConfig.version,
  });
  const passageVectors = normalize(passageResult.embeddings);
  const candidateById = new Map<string, { passage: GoldenPassage; score: number }>();
  const primaryQuery = queries[0] ?? "";

  for (const query of queries) {
    const queryResult = await embed({
      texts: [query],
      model: embeddingConfig.model,
      version: embeddingConfig.version,
    });
    const [queryVector] = normalize(queryResult.embeddings);
    const cosineRanked = goldenPassages
      .map((passage, passageIndex) => ({
        passage,
        score: dot(queryVector as number[], passageVectors[passageIndex] as number[]),
      }))
      .sort((left, right) => right.score - left.score);
    for (const entry of cosineRanked.slice(0, rerankConfig.candidateK)) {
      const existing = candidateById.get(entry.passage.id);
      if (existing === undefined || entry.score > existing.score) {
        candidateById.set(entry.passage.id, entry);
      }
    }
  }

  const mergedCandidates = [...candidateById.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, rerankConfig.candidateK);
  const candidateHits = mergedCandidates.map((entry) => ({
    ...passageToHit(entry.passage),
    score: entry.score,
  }));
  const result = await rerank({
    query: primaryQuery,
    chunks: candidateHits,
    topK: rerankConfig.topK,
  });
  return {
    rankedIds: result.chunks.map((chunk) => chunk.chunkId),
    rerankFailed: result.status === "failed",
    ...(result.status === "failed" ? { rerankReason: result.reason } : {}),
  };
}

interface RecallMetrics {
  recallAtK: Record<number, number>;
  mrr: number;
}

function normalizeRef(value: string): string {
  return value.trim().toLowerCase();
}

/** Leading section number of a normalised ref ("2.6. persoonlijke …" -> "2.6"), "" when absent. */
function leadingSectionNumber(normalizedRef: string): string {
  return /^[\d.]+/.exec(normalizedRef)?.[0]?.replace(/\.$/, "") ?? "";
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

function recallChecks(label: string, metrics: RecallMetrics, thresholds: RetrievalThresholds): Check[] {
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

function logRecallMetrics(label: string, metrics: RecallMetrics, thresholds: RetrievalThresholds): void {
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
    updateBaselineSection({ corpusVersion: GOLDEN_CORPUS_VERSION, fixtureHash: GOLDEN_FIXTURE_HASH, retrieval: current });
    console.log("  baseline: retrieval section recorded.\n");
  }

  embeddingModelId = embeddingConfig.model;
  rerankModelId = rerankConfig.model;
  retrievalReport = {
    embeddingDim: passageResult.dim,
    passages: goldenPassages.length,
    queries: retrievalQueries.length,
    before: {
      hitAt1: beforeMetrics.recallAtK[1] ?? 0,
      recallAt3: beforeMetrics.recallAtK[3] ?? 0,
      recallAt5: beforeMetrics.recallAtK[PRIMARY_K] ?? 0,
      mrr: beforeMetrics.mrr,
    },
    after: {
      hitAt1: afterMetrics.recallAtK[1] ?? 0,
      recallAt3: afterMetrics.recallAtK[3] ?? 0,
      recallAt5: afterMetrics.recallAtK[PRIMARY_K] ?? 0,
      mrr: afterMetrics.mrr,
    },
    rerank: {
      reranked: rerankedCount,
      skipped: skippedCount,
      failed: failedCount,
      total: retrievalQueries.length,
      mrrDeltaOnReranked: rerankMrrDelta,
    },
  };

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

/** The article/lid a case expects — the only fields integration relevance is matched on. */
interface ExpectedStructure {
  expectedArticle?: string;
  expectedLid?: string;
}

/**
 * Integration relevance: ingested chunk ids are DB uuids, not fixture ids, so a returned chunk is
 * relevant when its OWN article/lid structure matches the case's expected article/lid — the same
 * article/lid rule Gate B uses, just read off the pipeline's chunk instead of a fixture lookup.
 * Works for both base cases (Gate B-integration) and fund cases (Gate F), which share these fields.
 */
function chunkMatchesCase(chunk: RetrievedChunk, testCase: ExpectedStructure): boolean {
  const article = chunk.structure.article;
  if (!article || !testCase.expectedArticle) {
    return false;
  }
  if (normalizeRef(article) !== normalizeRef(testCase.expectedArticle)) {
    return false;
  }
  if (testCase.expectedLid && chunk.structure.lid) {
    return normalizeRef(chunk.structure.lid) === normalizeRef(testCase.expectedLid);
  }
  return true;
}

function chunkMatchesFundCase(chunk: RetrievedChunk, testCase: GoldenFundCase, agentKey: string): boolean {
  if (agentKey === "arbo" && testCase.expectedChapter) {
    const chapter =
      chunk.structure.chapter ??
      (typeof chunk.metadata.chapter === "string" ? chunk.metadata.chapter : null);
    if (!chapter) return false;
    return normalizeRef(chapter) === normalizeRef(testCase.expectedChapter);
  }
  return chunkMatchesCase(chunk, testCase);
}

function scoreFundIntegrationRecall(
  rankedChunks: RetrievedChunk[][],
  queries: GoldenFundCase[],
  agentKey: string,
): RecallMetrics {
  const recallHits: Record<number, number> = {};
  for (const k of K_VALUES) recallHits[k] = 0;
  let reciprocalRankSum = 0;

  queries.forEach((query, queryIndex) => {
    const ranked = rankedChunks[queryIndex] ?? [];
    const rank = ranked.findIndex((chunk) => chunkMatchesFundCase(chunk, query, agentKey)) + 1;
    if (rank > 0) {
      reciprocalRankSum += 1 / rank;
      for (const k of K_VALUES) if (rank <= k) recallHits[k] = (recallHits[k] ?? 0) + 1;
    }
  });

  const recallAtK: Record<number, number> = {};
  for (const k of K_VALUES) recallAtK[k] = (recallHits[k] ?? 0) / queries.length;
  return { recallAtK, mrr: reciprocalRankSum / queries.length };
}

function scoreIntegrationRecall(rankedChunks: RetrievedChunk[][], queries: ExpectedStructure[]): RecallMetrics {
  const recallHits: Record<number, number> = {};
  for (const k of K_VALUES) recallHits[k] = 0;
  let reciprocalRankSum = 0;

  queries.forEach((query, queryIndex) => {
    const ranked = rankedChunks[queryIndex] ?? [];
    const rank = ranked.findIndex((chunk) => chunkMatchesCase(chunk, query)) + 1;
    if (rank > 0) {
      reciprocalRankSum += 1 / rank;
      for (const k of K_VALUES) if (rank <= k) recallHits[k] = (recallHits[k] ?? 0) + 1;
    }
  });

  const recallAtK: Record<number, number> = {};
  for (const k of K_VALUES) recallAtK[k] = (recallHits[k] ?? 0) / queries.length;
  return { recallAtK, mrr: reciprocalRankSum / queries.length };
}

/**
 * Gate B-integration (Fase E11) — the nightly gate on the REAL retrieval pipeline. Where Gate B does
 * in-memory cosine on fixtures, this drives `retrieveContext` (rewrite -> pgvector -> rerank ->
 * assemble) against the golden passages ingested into a reserved fund, using the exact production
 * topK/minScore. That closes open question 5 and retrieval-side divergences #3/#6/#8 for the nightly.
 *
 * Two things are checked: (1) recall/MRR of the end-to-end pipeline against provisional (lower)
 * thresholds; (2) the minScore refuse-without-LLM guard — out-of-corpus probes must return 0 hits.
 * Needs the fixtures ingested first (scripts/ingest/fixtures.ts) and DATABASE_URL + SCALEWAY_API_KEY.
 */
async function retrievalIntegrationChecks(): Promise<Check[]> {
  const queries = goldenCases.filter(
    (testCase) => testCase.category !== "refusal" && (!testCase.history || testCase.history.length === 0),
  );

  const rankedChunks: RetrievedChunk[][] = [];
  for (const testCase of queries) {
    const result = await retrieveContext({
      query: testCase.question,
      fund: EVAL_FIXTURE_FUND,
      agentKey: EVAL_AGENT_KEY,
      topK: PRODUCTION_DEFAULTS.topK,
      minScore: PRODUCTION_DEFAULTS.minScore,
    });
    rankedChunks.push(result.chunks);
  }
  const metrics = scoreIntegrationRecall(rankedChunks, queries);

  let emptyProbes = 0;
  for (const probe of MIN_SCORE_PROBES) {
    const result = await retrieveContext({
      query: probe,
      fund: EVAL_FIXTURE_FUND,
      agentKey: EVAL_AGENT_KEY,
      topK: PRODUCTION_DEFAULTS.topK,
      minScore: PRODUCTION_DEFAULTS.minScore,
    });
    if (result.chunks.length === 0) emptyProbes += 1;
  }

  console.log(
    `\nGate B-integration — REAL pipeline (rewrite → pgvector → rerank → assemble), fund ` +
      `"${EVAL_FIXTURE_FUND}", topK=${String(PRODUCTION_DEFAULTS.topK)}, minScore=${String(PRODUCTION_DEFAULTS.minScore)}, ` +
      `${String(queries.length)} queries:`,
  );
  logRecallMetrics("integration (after full pipeline)", metrics, RETRIEVAL_INTEGRATION_THRESHOLDS);
  console.log(
    `  minScore guard — ${String(emptyProbes)}/${String(MIN_SCORE_PROBES.length)} out-of-corpus probes returned 0 hits ` +
      `(need >= ${String(MIN_SCORE_GUARD_REQUIRED)})\n`,
  );

  retrievalIntegrationReport = {
    fund: EVAL_FIXTURE_FUND,
    queries: queries.length,
    topK: PRODUCTION_DEFAULTS.topK,
    minScore: PRODUCTION_DEFAULTS.minScore,
    metrics: {
      hitAt1: metrics.recallAtK[1] ?? 0,
      recallAt3: metrics.recallAtK[3] ?? 0,
      recallAt5: metrics.recallAtK[PRIMARY_K] ?? 0,
      mrr: metrics.mrr,
    },
    thresholds: { ...RETRIEVAL_INTEGRATION_THRESHOLDS },
    minScoreGuard: { probes: MIN_SCORE_PROBES.length, empty: emptyProbes, required: MIN_SCORE_GUARD_REQUIRED },
  };

  return [
    ...recallChecks("integration retrieval", metrics, RETRIEVAL_INTEGRATION_THRESHOLDS),
    {
      name: `integration minScore-guard: >= ${String(MIN_SCORE_GUARD_REQUIRED)} out-of-corpus probes return 0 hits (refuse-without-LLM)`,
      ok: emptyProbes >= MIN_SCORE_GUARD_REQUIRED,
      detail: `${String(emptyProbes)}/${String(MIN_SCORE_PROBES.length)} probes empty at minScore ${String(PRODUCTION_DEFAULTS.minScore)}`,
    },
  ];
}

/**
 * Gate F (Fase E12) — FUND-SPECIFIC correctness layer. For each discovered fund set
 * (golden-set.<fund>.jsonl) this drives the REAL pipeline (rewrite → pgvector → rerank → assemble)
 * against that fund's ingested corpus, scored on article/lid — NOT against fixtures, which is the
 * whole point of the fund layer (the audit's "two-layer split is only a console label" is closed by
 * making it a physical, separately-reported layer). Answerable cases feed recall/MRR; the guard uses
 * the shared MIN_SCORE_PROBES, not this set's own refusal cases. Reported per fund (per corpus
 * snapshot) in eval-report.json — base-scores vs fund-scores stay apart.
 *
 * Why not the set's own refusal cases (changed 2026-07-31, was a red gate on every real corpus): they
 * are in-corpus near-misses, and on a rich corpus they clear the floor — on the ETD corpus the probe
 * scores 0.647 while two answerable cases sit at 0.569 and 0.642, so NO floor separates them. The
 * measurement and the decision are in `docs/eval/BESLUIT-refusal-guard-2026-07-31.md`. Those cases
 * stay in the golden set as intended-refusal behaviour; scoring them needs the answer layer, which
 * this layer does not run (tracked as an open decision).
 *
 * Nightly-only like Gate B-integration, but ALSO needs MISTRAL_API_KEY: multi-turn fund cases are
 * condensed via the LLM before retrieval (fundCaseQuery), mirroring production. Uses production
 * topK/minScore.
 */
/** The structural ref a fund case is scored on: chapter for arbo catalogs, article for CAO sets. */
function expectedRefFor(testCase: GoldenFundCase, agentKey: string): string | null {
  if (agentKey === "arbo" && testCase.expectedChapter) return testCase.expectedChapter;
  return testCase.expectedArticle ?? testCase.expectedChapter ?? null;
}

/** The structural refs a retrieved chunk carries, in the same shape `expectedRefFor` produces. */
function chunkRefs(chunk: RetrievedChunk): string[] {
  const chapter =
    chunk.structure.chapter ?? (typeof chunk.metadata.chapter === "string" ? chunk.metadata.chapter : null);
  return [chapter, chunk.structure.article].filter((ref): ref is string => Boolean(ref));
}

function catalogRefSet(catalog: StructuralRefs): Set<string> {
  const seen = new Set<string>();
  for (const ref of [...catalog.articles, ...catalog.chapters]) {
    seen.add(normalizeRef(ref));
  }
  return seen;
}

/**
 * Diagnose every answerable fund case, splitting "the corpus does not have it" from "this question
 * did not rank it". Presence is a DISTINCT article/chapter lookup — not an embedding of the expected
 * ref. Without this a red fund gate is a single aggregate and every explanation is a guess.
 */
function diagnoseFundCases(
  answerable: GoldenFundCase[],
  rankedChunks: RetrievedChunk[][],
  agentKey: string,
  catalog: StructuralRefs,
): FundCaseDiagnosis[] {
  const presentRefs = catalogRefSet(catalog);
  const diagnoses: FundCaseDiagnosis[] = [];

  for (const [index, testCase] of answerable.entries()) {
    const chunks = rankedChunks[index] ?? [];
    const expectedRef = expectedRefFor(testCase, agentKey);
    const retrievedRefs = chunks.flatMap((chunk) => chunkRefs(chunk));
    const rankIndex = chunks.findIndex((chunk) => chunkMatchesFundCase(chunk, testCase, agentKey));

    if (expectedRef === null) {
      diagnoses.push({ id: testCase.id, expectedRef, verdict: "unranked", rank: null, retrievedRefs });
      continue;
    }
    if (rankIndex >= 0) {
      diagnoses.push({ id: testCase.id, expectedRef, verdict: "hit", rank: rankIndex + 1, retrievedRefs });
      continue;
    }

    const present = presentRefs.has(normalizeRef(expectedRef));
    diagnoses.push({
      id: testCase.id,
      expectedRef,
      verdict: present ? "unranked" : "label-only",
      rank: null,
      retrievedRefs,
    });
  }

  return diagnoses;
}

/**
 * Corpus-composition guard (2026-08-24). Asserts the fund holds exactly the documents its fund set
 * declares (`FUND_SET_META.expectedDocuments`).
 *
 * This is the gate that was missing. Fund "elektronische-detailhandel" silently gained a second,
 * unrelated CAO — 668 foreign chunks against its own 245, because `ingest <dir>` takes every
 * supported file and one had been dropped into `scripts/ingest/input/`. Every OTHER gate misread it:
 * G3-fund reported a ranking collapse (hit@1 92.9% -> 64.3%), and G3-isolation stayed green because
 * both documents were ingested INTO the same fund — nothing crossed a fund boundary, the wrong
 * document simply arrived inside one. Isolation covers the data plane; this covers the ingest.
 *
 * An UNEXPECTED document fails on its own: recall measured against a contaminated corpus is not a
 * quality signal, and for a per-fund product it is the failure that matters most.
 */
function corpusCompositionCheck(set: GoldenFundSet, present: CorpusDocument[]): Check[] {
  if (set.expectedDocuments === undefined) {
    return [];
  }
  const expected = [...set.expectedDocuments].sort((a, b) => a.localeCompare(b));
  const actual = present.map((document) => document.title).sort((a, b) => a.localeCompare(b));
  const unexpected = actual.filter((title) => !expected.includes(title));
  const missing = expected.filter((title) => !actual.includes(title));

  const problems = [
    ...(unexpected.length === 0 ? [] : [`unexpected: ${unexpected.map((t) => `"${t}"`).join(", ")}`]),
    ...(missing.length === 0 ? [] : [`missing: ${missing.map((t) => `"${t}"`).join(", ")}`]),
  ];
  return [
    {
      name: `fund "${set.key}" corpus: holds exactly the ${String(expected.length)} declared document(s)`,
      ok: problems.length === 0,
      detail:
        problems.length === 0
          ? actual.map((title) => `"${title}"`).join(", ")
          : `${problems.join("; ")} — corpus is ${actual.map((title) => `"${title}"`).join(", ")}`,
    },
  ];
}

/**
 * Fixture-reachability guard. Fails on `label-only` cases only: those cannot be scored at all.
 * `unranked` cases stay with the recall thresholds.
 */
function fixtureReachabilityCheck(set: GoldenFundSet, diagnoses: FundCaseDiagnosis[], catalog: StructuralRefs): Check {
  const seen = catalogRefSet(catalog);

  const labelOnly = diagnoses.filter((diagnosis) => diagnosis.verdict === "label-only");
  const detail = labelOnly
    .map((diagnosis) => {
      const ref = diagnosis.expectedRef ?? "";
      const prefix = leadingSectionNumber(normalizeRef(ref));
      const nearby = prefix === "" ? [] : [...seen].filter((candidate) => leadingSectionNumber(candidate) === prefix);
      const hint =
        nearby.length === 0
          ? "absent from the fund (no article or chapter with that number)"
          : `corpus labels around ${prefix}: ${nearby.map((candidate) => `"${candidate}"`).join(" | ")}`;
      return `${diagnosis.id} expects "${ref}" — ${hint}`;
    })
    .join("; ");

  const unranked = diagnoses.filter((diagnosis) => diagnosis.verdict === "unranked").length;
  return {
    name: `fund "${set.key}" fixtures: every expected article/chapter exists in the corpus`,
    ok: labelOnly.length === 0,
    detail:
      labelOnly.length === 0
        ? `${String(diagnoses.length)} case(s) resolvable in the corpus (${String(unranked)} not ranked by their own question — see recall)`
        : `${String(labelOnly.length)} of ${String(diagnoses.length)} exist nowhere in the fund — ${detail}`,
  };
}

async function fundLayerChecks(set: GoldenFundSet): Promise<Check[]> {
  const agentKey = set.agentKey;
  const answerable = set.cases.filter((testCase) => testCase.category !== "refusal");
  const nearMiss = set.cases.filter((testCase) => testCase.category === "refusal");

  const rankedChunks: RetrievedChunk[][] = [];
  for (const testCase of answerable) {
    const query = await fundCaseQuery(testCase);
    const result = await retrieveContext({
      query,
      fund: set.fund,
      agentKey,
      topK: PRODUCTION_DEFAULTS.topK,
      minScore: PRODUCTION_DEFAULTS.minScore,
    });
    rankedChunks.push(result.chunks);
  }
  const metrics = scoreFundIntegrationRecall(rankedChunks, answerable, agentKey);
  const catalog = await listStructuralRefs({ fund: set.fund, agentKey });
  const diagnoses = diagnoseFundCases(answerable, rankedChunks, agentKey, catalog);

  let emptyProbes = 0;
  for (const query of MIN_SCORE_PROBES) {
    const result = await retrieveContext({
      query,
      fund: set.fund,
      agentKey,
      topK: PRODUCTION_DEFAULTS.topK,
      minScore: PRODUCTION_DEFAULTS.minScore,
    });
    if (result.chunks.length === 0) emptyProbes += 1;
  }
  // Same probes and same slack as the base layer, so a fund is held to one standard, not its own.
  const requiredEmpty = MIN_SCORE_GUARD_REQUIRED;
  const corpusDocuments = await listCorpusDocuments({ fund: set.fund, agentKey });

  console.log(
    `\nGate F — fund "${set.key}" correctness on the REAL pipeline, fund "${set.fund}", agent "${agentKey}", ` +
      `corpus v${set.corpusVersion}, topK=${String(PRODUCTION_DEFAULTS.topK)}, ` +
      `minScore=${String(PRODUCTION_DEFAULTS.minScore)}, ${String(answerable.length)} queries:`,
  );
  console.log(
    `  corpus — ${String(corpusDocuments.length)} document(s): ${corpusDocuments.map((document) => `"${document.title}" (v${document.version})`).join(", ")}`,
  );
  logRecallMetrics(`fund "${set.key}" (after full pipeline)`, metrics, RETRIEVAL_INTEGRATION_THRESHOLDS);
  console.log(
    `  refusal guard — ${String(emptyProbes)}/${String(MIN_SCORE_PROBES.length)} out-of-corpus probes returned 0 hits ` +
      `(need >= ${String(requiredEmpty)})`,
  );
  // Say out loud what this layer does NOT score, so an unscored case can never look covered.
  console.log(
    `  near-miss cases — ${String(nearMiss.length)} present, NOT scored here (needs the answer layer; ` +
      `see docs/eval/BESLUIT-refusal-guard-2026-07-31.md)\n`,
  );
  for (const diagnosis of diagnoses) {
    const where = diagnosis.rank === null ? "-" : `rank ${String(diagnosis.rank)}`;
    console.log(
      `    ${diagnosis.id}: ${diagnosis.verdict} (${where}) expected=${JSON.stringify(diagnosis.expectedRef)} ` +
        `retrieved=${diagnosis.retrievedRefs.slice(0, PRODUCTION_DEFAULTS.topK).map((ref) => JSON.stringify(ref)).join(", ")}`,
    );
  }
  console.log("");

  fundLayerReports.push({
    key: set.key,
    fund: set.fund,
    agentKey,
    corpusVersion: set.corpusVersion,
    fixtureHash: set.fixtureHash,
    answerableQueries: answerable.length,
    metrics: {
      hitAt1: metrics.recallAtK[1] ?? 0,
      recallAt3: metrics.recallAtK[3] ?? 0,
      recallAt5: metrics.recallAtK[PRIMARY_K] ?? 0,
      mrr: metrics.mrr,
    },
    thresholds: { ...RETRIEVAL_INTEGRATION_THRESHOLDS },
    refusalGuard: { probes: MIN_SCORE_PROBES.length, empty: emptyProbes, required: requiredEmpty },
    documents: corpusDocuments.map((document) => ({ title: document.title, version: document.version })),
    unscoredNearMissCases: nearMiss.length,
    cases: diagnoses,
  });

  return [
    // Composition first: when the corpus is not what it claims to be, every number below — including
    // reachability — is measured against the wrong documents.
    ...corpusCompositionCheck(set, corpusDocuments),
    fixtureReachabilityCheck(set, diagnoses, catalog),
    ...recallChecks(`fund "${set.key}" retrieval`, metrics, RETRIEVAL_INTEGRATION_THRESHOLDS),
    {
      name: `fund "${set.key}" refusal-guard: >= ${String(requiredEmpty)} out-of-corpus probes return 0 hits (refuse-without-LLM)`,
      ok: emptyProbes >= requiredEmpty,
      detail: `${String(emptyProbes)}/${String(MIN_SCORE_PROBES.length)} probes empty at minScore ${String(PRODUCTION_DEFAULTS.minScore)}`,
    },
  ];
}

/** Condense an elliptical fund follow-up before retrieval, mirroring the production multi-turn path. */
async function fundCaseQuery(testCase: GoldenFundCase): Promise<string> {
  if (!testCase.history || !isElliptical(testCase.question, testCase.history)) {
    return testCase.question;
  }
  return condenseWithRetry(testCase.history, testCase.question);
}

async function condensationChecks(): Promise<Check[]> {
  const embeddingConfig = requireEmbeddingConfig();
  const rerankConfig = requireRerankConfig();
  const followUps = goldenCases.filter((testCase) => Array.isArray(testCase.history) && testCase.history.length > 0);
  if (followUps.length === 0) {
    return [{ name: "condensation: at least one multi-turn golden case exists", ok: false }];
  }

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

    const condensed = await condenseWithRetry(history, testCase.question);
    const retrievalQueries = retrievalQueriesForFollowUp(history, testCase.question, condensed);
    const ranked = await rankPassageIdsForQueries(retrievalQueries, embeddingConfig, rerankConfig);

    if (ranked.rerankFailed) {
      checks.push({
        name: `condensation: "${testCase.id}" rerank did not fail`,
        ok: false,
        detail: ranked.rerankReason,
      });
    }

    checks.push({
      name: `condensation: "${testCase.id}" retrieves the expected article after rewrite`,
      ok: ranked.rankedIds.some((id) => passageMatchesCase(id, testCase)),
      detail: `condensed="${condensed}" queries=${retrievalQueries.join(" | ")} top=${ranked.rankedIds.join(", ")}`,
    });
  }

  return checks;
}

async function multiTurnServeChecks(): Promise<Check[]> {
  const embeddingConfig = requireEmbeddingConfig();
  const rerankConfig = requireRerankConfig();
  const followUps = goldenCases.filter(
    (testCase) =>
      Array.isArray(testCase.history) &&
      testCase.history.length > 0 &&
      testCase.category !== "refusal" &&
      isElliptical(testCase.question, testCase.history),
  );
  if (followUps.length === 0) {
    return [{ name: "multi-turn serve: at least one answerable elliptical case exists", ok: false }];
  }

  const checks: Check[] = [];
  let unverifiableCount = 0;
  let servedWithCitationCount = 0;

  console.log(`\nMulti-turn serve-path (${String(followUps.length)} answerable elliptical cases):`);

  for (const testCase of followUps) {
    const history = testCase.history ?? [];
    const condensed = await condenseWithRetry(history, testCase.question);
    const retrievalQueries = retrievalQueriesForFollowUp(history, testCase.question, condensed);
    const ranked = await rankPassageIdsForQueries(retrievalQueries, embeddingConfig, rerankConfig);
    const passages = ranked.rankedIds
      .map((id) => passageById(id))
      .filter((passage): passage is GoldenPassage => passage !== undefined);
    const retrieval = retrievalOutputFromPassages(passages);
    const userSupplied = [testCase.question, ...history.map((message) => message.content)].join(" ");

    const generated = await generateAnswerWithRepair({
      chunkContentById: new Map(passages.map((passage) => [passage.id, passage.content])),
      userSupplied,
      maxAttempts: env.EVAL_GENERATION_SAMPLES ?? 2,
      generate: (extraMessages) =>
        retryWithBackoff(
          () =>
            generateText({
              model: EVAL_LLM_MODEL,
              messages: [
                { role: "system", content: CAO_SYSTEM_INSTRUCTIONS },
                { role: "user", content: buildAnswerPrompt(retrieval.context, condensed) },
                ...extraMessages,
              ],
              temperature: GENERATION_CONFIG.temperature,
              maxTokens: GENERATION_CONFIG.maxTokens,
              stop: GENERATION_CONFIG.stop,
            }),
          { baseDelayMs: 5000, maxAttempts: 8 },
        ).then((result) => ({
          text: result.text,
          usage: result.usage,
          finishReason: result.finishReason,
        })),
    });

    const served = verifyAndBuild(generated.text, retrieval, userSupplied);
    if (served.unverifiable) {
      unverifiableCount += 1;
    }
    if (served.found && served.citations.length > 0) {
      servedWithCitationCount += 1;
    }

    console.log(
      `  ${testCase.id}: found=${String(served.found)} citations=${String(served.citations.length)} ` +
        `unverifiable=${String(served.unverifiable)} hardFact=${String(served.hardFactGuardTriggered)}`,
    );

    // Derived calculation-bait cases (etd-d02, etd-d03) correctly refuse to invent a number the
    // CAO does not state — their referenceAnswer says so. Demanding a verified citation there
    // conflates a coverage miss with a safety miss. Still log every case and still count
    // unverifiable across all of them; only the per-case "must cite" floor skips derived.
    if (testCase.category !== "derived") {
      checks.push({
        name: `multi-turn serve: "${testCase.id}" survives verifyAndBuild with a verified citation`,
        ok: served.found && served.citations.length > 0,
        detail:
          `queries=${retrievalQueries.join(" | ")} citations=${String(served.citations.length)} ` +
          `unverifiable=${String(served.unverifiable)}`,
      });
    }

    await sleep(2000);
  }

  console.log(
    `  served-with-citation ${String(servedWithCitationCount)}/${String(followUps.length)}  ` +
      `unverifiable ${String(unverifiableCount)}/${String(followUps.length)}  ` +
      `(gate <= ${String(MULTI_TURN_SERVE_THRESHOLDS.maxUnverifiableCount)} unverifiable; ` +
      `derived cases excluded from per-case citation: a correct answer claims no article here)\n`,
  );

  checks.push({
    name:
      `multi-turn serve: unverifiable count <= ${String(MULTI_TURN_SERVE_THRESHOLDS.maxUnverifiableCount)}` +
      ` (derived cases uitgesloten van de per-case citatie-eis: een correct antwoord claimt hier geen artikel)`,
    ok: unverifiableCount <= MULTI_TURN_SERVE_THRESHOLDS.maxUnverifiableCount,
    detail: `${String(unverifiableCount)} of ${String(followUps.length)} unverifiable after verifyAndBuild`,
  });

  return checks;
}

async function multiTurnChecks(): Promise<Check[]> {
  const condensation = await condensationChecks();
  const serve = await multiTurnServeChecks();
  return [...condensation, ...serve];
}

function answerLevelChecks(aggregate: AggregateScores): Check[] {
  console.log(`\nAnswer-level scores (${String(aggregate.caseCount)} cases):`);
  console.log(
    `  hard-hallucination    ${pct(aggregate.hardHallucination)}  (min ${pct(ANSWER_THRESHOLDS.hardHallucination)})`,
  );
  console.log(
    `  soft-faithfulness     ${pct(aggregate.faithfulness)}  (min ${pct(ANSWER_THRESHOLDS.softFaithfulness)}; answerable cases only)`,
  );
  console.log(
    `  answer-relevance      ${pct(aggregate.relevance)}  (min ${pct(ANSWER_THRESHOLDS.relevance)}; answerable cases only)`,
  );
  console.log(
    `  citation-correctness  ${pct(aggregate.citationCorrectness)}  (min ${pct(ANSWER_THRESHOLDS.citationCorrectness)}; answerable cases only)`,
  );
  console.log(
    `  completeness          ${pct(aggregate.completeness)}  (min ${pct(ANSWER_THRESHOLDS.completeness)}; answerable cases only)`,
  );
  console.log(
    `  refusal-calibration   ${pct(aggregate.refusalCalibration)}  (min ${pct(ANSWER_THRESHOLDS.refusalCalibration)})`,
  );
  console.log(
    `  citation-verification ${pct(aggregate.citationVerification)}  (${String(aggregate.unverifiedCitationCount)} of ${String(aggregate.caseCount)} unverified; gate <= ${String(ANSWER_THRESHOLDS.maxUnverifiedCount)})`,
  );
  console.log(
    `  orphan-source-rate    ${pct(aggregate.orphanRate)}  (max ${pct(ANSWER_THRESHOLDS.maxOrphanRate)})`,
  );
  console.log(
    `  dangling-marker-rate  ${pct(aggregate.danglingMarkerRate)}  (${String(aggregate.danglingCaseCount)} of ${String(aggregate.caseCount)} dangling; gate <= ${String(ANSWER_THRESHOLDS.maxDanglingCount)})`,
  );
  console.log(
    `  over-refusal-rate     ${pct(aggregate.overRefusalRate)}  (max ${pct(ANSWER_THRESHOLDS.maxOverRefusalRate)})`,
  );
  console.log(
    `  under-refusal         ${pct(aggregate.underRefusalRate)}  (${String(aggregate.underRefusalCount)} refusal case(s) answered; gate <= ${String(ANSWER_THRESHOLDS.maxUnderRefusalCount)})\n`,
  );

  return [
    {
      name: `answer: hard-hallucination >= ${pct(ANSWER_THRESHOLDS.hardHallucination)} (invented amounts/terms/articles)`,
      ok: aggregate.hardHallucination >= ANSWER_THRESHOLDS.hardHallucination,
    },
    {
      name: `answer: soft-faithfulness >= ${pct(ANSWER_THRESHOLDS.softFaithfulness)} (answerable cases only; refusals excluded)`,
      ok: aggregate.faithfulness >= ANSWER_THRESHOLDS.softFaithfulness,
    },
    {
      name: `answer: relevance >= ${pct(ANSWER_THRESHOLDS.relevance)} (addresses the actual question; answerable cases only)`,
      ok: aggregate.relevance >= ANSWER_THRESHOLDS.relevance,
    },
    {
      name: `answer: citation-correctness >= ${pct(ANSWER_THRESHOLDS.citationCorrectness)} (answerable cases only; refusals excluded)`,
      ok: aggregate.citationCorrectness >= ANSWER_THRESHOLDS.citationCorrectness,
    },
    {
      name: `answer: completeness >= ${pct(ANSWER_THRESHOLDS.completeness)} (answerable cases only; refusals excluded)`,
      ok: aggregate.completeness >= ANSWER_THRESHOLDS.completeness,
    },
    {
      name: `answer: refusal-calibration >= ${pct(ANSWER_THRESHOLDS.refusalCalibration)}`,
      ok: aggregate.refusalCalibration >= ANSWER_THRESHOLDS.refusalCalibration,
    },
    {
      name: `answer: citation-verification — <= ${String(ANSWER_THRESHOLDS.maxUnverifiedCount)} of ${String(aggregate.caseCount)} cases with an unverified citation (raw generation slip; strip pipeline guarantees 0 reach the user)`,
      ok: aggregate.unverifiedCitationCount <= ANSWER_THRESHOLDS.maxUnverifiedCount,
      detail: `${String(aggregate.unverifiedCitationCount)} unverified; rate ${pct(aggregate.citationVerification)}`,
    },
    {
      name: `answer: orphan-source-rate <= ${pct(ANSWER_THRESHOLDS.maxOrphanRate)} (source without [n])`,
      ok: aggregate.orphanRate <= ANSWER_THRESHOLDS.maxOrphanRate,
    },
    {
      name: `answer: dangling-marker — <= ${String(ANSWER_THRESHOLDS.maxDanglingCount)} of ${String(aggregate.caseCount)} cases with a dangling [n] (raw generation slip; reconciled before the user)`,
      ok: aggregate.danglingCaseCount <= ANSWER_THRESHOLDS.maxDanglingCount,
      detail: `${String(aggregate.danglingCaseCount)} dangling; rate ${pct(aggregate.danglingMarkerRate)}`,
    },
    {
      name: `answer: over-refusal-rate <= ${pct(ANSWER_THRESHOLDS.maxOverRefusalRate)} (answerable but refused)`,
      ok: aggregate.overRefusalRate <= ANSWER_THRESHOLDS.maxOverRefusalRate,
    },
    {
      name: `answer: under-refusal — <= ${String(ANSWER_THRESHOLDS.maxUnderRefusalCount)} refusal case(s) answered (grounded slip; hard-hallucination still absolute)`,
      ok: aggregate.underRefusalCount <= ANSWER_THRESHOLDS.maxUnderRefusalCount,
      detail: `${String(aggregate.underRefusalCount)} of refusal cases answered; rate ${pct(aggregate.underRefusalRate)}`,
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
    // refusal-calibration regression is intentionally NOT checked (B2 follow-up, 2026-08-22): the
    // absolute under-refusal COUNT gate (≤ 1) and the floor ≥ 0.90 remain the protection. Growing
    // refusal fixtures to N=10 (corpus v5) reduces rate noise but does not restore a ±tolerance
    // regression check — same rationale as skipping under-refusal-RATE regression.
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
    // under-refusal-RATE regression is intentionally NOT checked (B2, 2026-07-21; still true at N=10
    // in corpus v5): the absolute under-refusal COUNT gate (<= 1, in answerLevelChecks) is the real
    // protection; the rate stays a trend-only number in the report. At N=10 one slip is ~10% instead
    // of 33% at N=3 — count tolerance stays 1 (recalibrated percentage-wise by growing the set).
    // Soft faith/rel/complete averages exclude refusal cases for the same reason (2026-08-22): an
    // allowed count-1 slip used to zero those means and fail regression against a 0-under-refusal
    // baseline even when every answerable case was fine. refusalCalibration left the higherIsBetter
    // list on the same date: two slips (count=2, already red on the count gate) also failed the
    // 5-point regression band (0.935 vs 1.000) without adding information the count gate missed.
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
  const caseScores: AnswerCaseReport[] = [];
  let repairCount = 0;

  for (const testCase of goldenCases) {
    // Every case — including refusals — runs the real generation path. Refusal cases are given
    // near-miss distractor context (see golden-set.ts), so the model must actually refuse instead
    // of receiving a hardcoded refusal. This is what makes the under-refusal rate measurable.
    const passages = passagesForCase(testCase);
    const context = assembleEvalContext(passages);
    const question = await evalQuestion(testCase);
    // One citation-contract repair retry (generate-answer.ts): a genuinely grounded answer that
    // mis-formatted its citations, or an ungrounded assertion, gets a single targeted second attempt.
    // This is what collapses the run-to-run generator variance that dominates Gate C. The chosen raw
    // text is scored unchanged, so the metric still holds the model to the contract.
    const chunkContentById = new Map(passages.map((passage) => [passage.id, passage.content]));
    // User-supplied numbers (this turn's question + history) are grounding for the hard-fact trigger,
    // exactly as scoreHardHallucination treats them — so a `derived` case echoing the user's own hours
    // is not re-asked as an ungrounded fact.
    const userSupplied = [testCase.question, ...(testCase.history ?? []).map((message) => message.content)].join(" ");
    const generated = await generateAnswerWithRepair({
      chunkContentById,
      userSupplied,
      // Best-of-N over the citation contract; raise on the merge queue/nightly to tame single-sample
      // generation variance on the zero-tolerance count gates. Defaults to 2 (= production behaviour).
      maxAttempts: env.EVAL_GENERATION_SAMPLES ?? 2,
      generate: (extraMessages) =>
        retryWithBackoff(
          () =>
            generateText({
              model: EVAL_LLM_MODEL,
              messages: [
                { role: "system", content: CAO_SYSTEM_INSTRUCTIONS },
                { role: "user", content: buildAnswerPrompt(context, question) },
                ...extraMessages,
              ],
              // Single source of truth: packages/shared/src/config/generation.ts (same as production agent).
              temperature: GENERATION_CONFIG.temperature,
              maxTokens: GENERATION_CONFIG.maxTokens,
              stop: GENERATION_CONFIG.stop,
            }),
          { baseDelayMs: 5000, maxAttempts: 8 },
        ).then((result) => ({
          text: result.text,
          usage: result.usage,
          finishReason: result.finishReason,
        })),
    });
    if (generated.attempts > 1) {
      repairCount += 1;
    }
    const answer = generated.text;
    await sleep(2000);

    const scores = await scoreAnswerCase(testCase, passages, answer, NOT_FOUND_MESSAGE);
    // Persist id/question/answerRaw + finishReason/answerChars so a failed under-refusal, citation,
    // or truncation case is inspectable from the run artefact without regenerating (Tier B / Gate C
    // close-out etd-012 diagnostic).
    caseScores.push({
      ...scores,
      id: testCase.id,
      question,
      answerRaw: answer,
      finishReason: generated.finishReason,
      answerChars: answer.length,
    });
  }

  // Keep the repair-retry frequency visible as a trend (mirrors the judge parse-retry log): a rising
  // rate means the generator's first-pass citation discipline is degrading, even when the gate stays green.
  console.log(`[generation] citation-repair retries fired: ${String(repairCount)}/${String(goldenCases.length)}`);

  const aggregate = aggregateScores(caseScores);
  answerReport = { aggregate, cases: caseScores };
  if (env.EVAL_WRITE_BASELINE === "1" || env.EVAL_WRITE_BASELINE === "true") {
    // Fase G2 guard: refuse to record a baseline from a run that does not itself clear the absolute
    // floors. Recording a red run would silently lower the regression reference — the exact
    // bar-erosion the plan forbids. Fix the reds first, then re-record.
    const floorFailures = answerFloorFailures(aggregate);
    if (floorFailures.length > 0) {
      console.warn(
        `  baseline: NOT recorded — the answer run misses ${String(floorFailures.length)} absolute floor(s) ` +
          `(Fase G2 guard): ${floorFailures.join(", ")}. A baseline may only capture a run that itself passes.\n`,
      );
    } else {
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
      updateBaselineSection({ corpusVersion: GOLDEN_CORPUS_VERSION, fixtureHash: GOLDEN_FIXTURE_HASH, answer: answerBaseline });
      console.log("  baseline: answer section recorded.\n");
    }
  }

  return answerLevelChecks(aggregate);
}

/**
 * The two roleplay behavioural gates. The runners live in roleplay-gates.ts; these thin wrappers
 * exist only to stash the artefact section, the same shape the retrieval and answer gates use.
 */
async function roleplayPersonaChecks(): Promise<Check[]> {
  const { checks, report } = await runRoleplayPersonaGate();
  roleplayPersonaReport = report;
  return checks;
}

async function roleplayReviewChecks(): Promise<Check[]> {
  const { checks, report } = await runRoleplayReviewGate();
  roleplayReviewReport = report;
  return checks;
}

/**
 * Run functions keyed by gate id. The Record<GateId, …> type makes this exhaustive: every registered
 * gate MUST have a run, and no run may exist without a spec — the code-side registry↔spec binding
 * (the doc-side binding is gate-registry.test.ts). A run yields a flat Check[], except the perFundSet
 * gate (G3-fund) which yields one GateGroup per discovered fund set.
 */
const GATE_RUNS: Record<GateId, () => GateRunResult | Promise<GateRunResult>> = {
  "G1-contract": () => [
    ...promptContractChecks(),
    ...extraPromptContractChecks(),
    ...clarifyContractChecks(),
    ...fixtureHashChecks(),
    ...corpusIsolationContractChecks(),
  ],
  "G1-roleplay-contract": roleplayContractChecks,
  "G2-retrieval": retrievalAndRerankChecks,
  "G2-multi-turn": multiTurnChecks,
  "G2-answer": answerQualityChecks,
  "G2-roleplay-persona": roleplayPersonaChecks,
  "G2-roleplay-review": roleplayReviewChecks,
  "G3-pipeline": retrievalIntegrationChecks,
  "G3-fund": fundLayerGroups,
  "G3-isolation": corpusIsolationLiveChecks,
};

/** G3-fund expands to one report per discovered fund set (each scored against its own corpus). */
async function fundLayerGroups(): Promise<GateGroup[]> {
  const groups: GateGroup[] = [];
  for (const set of goldenFundSets) {
    groups.push({ suffix: `${set.key} (corpus v${set.corpusVersion})`, checks: await fundLayerChecks(set) });
  }
  return groups;
}

/** Resolve prerequisites, run (or skip/fail) one gate, and return whether the run stays green. */
async function runGate(spec: GateSpec): Promise<boolean> {
  // A perFundSet gate with zero discovered sets has nothing to run and emits no report.
  if (spec.perFundSet === true && goldenFundSets.length === 0) {
    return true;
  }
  if (!credentialsAvailable(spec.requires)) {
    return pushUnavailable(spec, requirementLabel(spec.requires));
  }
  const result = await GATE_RUNS[spec.id as GateId]();
  if (spec.perFundSet === true) {
    let passed = true;
    for (const group of result as GateGroup[]) {
      passed = pushGate(spec, group.checks, group.suffix) && passed;
    }
    return passed;
  }
  return pushGate(spec, result as Check[]);
}

/** Assemble the E9 run artefact from the accumulators and write it (also on failure). */
function writeRunArtefact(passed: boolean): void {
  const report: EvalReport = {
    schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    // Falls back to local HEAD: a result that must be able to block a promotion has to be able to
    // say which commit it is green about (Fase 4).
    commitSha: resolveCommitSha(env.GITHUB_SHA),
    corpusVersion: GOLDEN_CORPUS_VERSION,
    passed,
    config: {
      requireAll: REQUIRE_ALL,
      judgeSamples: env.EVAL_JUDGE_SAMPLES ?? 1,
      writeBaseline: env.EVAL_WRITE_BASELINE === "1" || env.EVAL_WRITE_BASELINE === "true",
      // Empty = the full registry ran. Non-empty makes the artefact self-identifying as partial, so
      // a green report cannot be read as a verdict about gates that never executed.
      onlyGates: GATE_FILTER,
    },
    models: {
      generator: EVAL_LLM_MODEL,
      judge: JUDGE_MODEL,
      embedding: embeddingModelId,
      rerank: rerankModelId,
    },
    gates: gateResults,
    retrieval: retrievalReport,
    retrievalIntegration: retrievalIntegrationReport,
    answer: answerReport,
    funds: fundLayerReports,
    roleplay: { persona: roleplayPersonaReport, review: roleplayReviewReport },
    judge: { parseRetryCount: getJudgeParseRetryCount() },
  };
  const path = writeEvalReport(report);
  console.log(`\nRun artefact written: ${path}`);

  // The artefact is gitignored and overwritten by the next run, so each per-fund outcome also lands
  // as a durable line that `pnpm promote-check` can read back (Fase 4).
  const records = fundRecordsFromReport(report);
  if (records.length > 0) {
    const ledger = appendFundRecords(records);
    console.log(`Promotion ledger: ${String(ledger.appended)} of ${String(records.length)} fund record(s) added to ${ledger.path}`);
  }
}

/**
 * Exit code for a run that could not finish because the provider throttled us (sysexits EX_TEMPFAIL).
 * Still a failure — an unfinished gate run must never read as green — but a distinct one, so "retry
 * this" is separable from "a gate regressed" without reading the whole log.
 */
const EXIT_THROTTLED = 75;

async function main(): Promise<void> {
  // Data-driven: the four-layer registry (GATE_SPECS) is walked in order; each gate resolves its own
  // prerequisites and reports passed/failed/skipped. Contract layer (G1) always runs; G2 needs keys;
  // G3 is nightly (DB); G4 (runtime hard-fact guard) is enforced in production, not here.
  let allPassed = true;
  let completed = false;

  assertGateFilterAllowed();
  if (GATE_FILTER.length > 0) {
    console.warn(
      `\nPARTIAL RUN — EVAL_ONLY=${GATE_FILTER.join(",")}. The other gates did not run and this ` +
        "report says nothing about them.\n",
    );
  }

  try {
    for (const spec of GATE_SPECS) {
      if (GATE_FILTER.length > 0 && !GATE_FILTER.includes(spec.id)) {
        continue;
      }
      allPassed = (await runGate(spec)) && allPassed;
    }
    completed = true;
  } finally {
    // Always leave a downloadable artefact — a crashed or failed run is exactly when it matters.
    // If a gate threw, the run did not complete, so it is recorded as not passed.
    writeRunArtefact(completed && allPassed);
  }

  if (!allPassed) {
    console.error("\nEval FAILED — an accuracy gate regressed or a required gate could not run. See above.");
    process.exitCode = 1;
    return;
  }
  console.log("\nEval PASSED.");
}

try {
  acquireEvalLock();
} catch (error: unknown) {
  if (error instanceof EvalAlreadyRunningError) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
  throw error;
}

main()
  .catch((error: unknown) => {
    if (isRateLimited(error)) {
      // A throttled run has no verdict: every gate after the 429 never ran, so the run says nothing
      // about the commit. Before this, it was indistinguishable from a regression — same exit 1, same
      // single line at the end of a 40-minute log (measured on `main` 2026-07-31, run 30639862139).
      console.error(
        "\nGATE RUN INCOMPLETE — the provider throttled us and the retry budget ran out.\n" +
          "No verdict: the gates after this point did not run. This is NOT a regression signal.\n" +
          error.message,
      );
      if (env.GITHUB_ACTIONS === "true") {
        console.error(
          "::error title=Gate run incomplete (provider throttled)::" +
            "No gate verdict — the run stopped on an HTTP 429, it did not measure a regression.",
        );
      }
      process.exitCode = EXIT_THROTTLED;
      return;
    }
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // Close the DB pool (used by the nightly integration gates) so the process exits instead of
  // hanging on postgres.js's open sockets. No-op when no gate touched the DB.
  .finally(closeDb);
