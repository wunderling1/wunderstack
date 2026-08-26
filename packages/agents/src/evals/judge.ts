import { generateText, type ChatMessage } from "@wunderstack/ai";
import { assemble, type RetrievalTimings } from "@wunderstack/rag";
import { env } from "@wunderstack/shared";
import { z } from "zod";

import { extractCitationMarkers } from "../runtime/build-citations.js";
import { findUngroundedFacts, type HardFactAgentKey } from "../hard-facts.js";
import { parseGenerationOutput } from "../runtime/parse-generation.js";
import { verifyCitations } from "../runtime/verify-citations.js";
import { passageToHit, type GoldenCase, type GoldenPassage } from "./golden-set.js";
import { retryWithBackoff } from "./retry.js";

/**
 * LLM-as-judge and deterministic scorers for Gate C (answer-level eval).
 * All model calls go through @wunderstack/ai (sovereign Mistral path).
 *
 * P4 (judge ≠ generator) RETIRED 2026-08-22: the eval generator must equal the production model
 * (`DEFAULT_LLM_MODEL` = mistral-large-2512). The only sovereign alternative judge is Small; a
 * weaker model grading Large is worse than self-preference. Soft metrics (faithfulness / relevance /
 * completeness) therefore have full self-preference. Blocking floors (hard-hallucination, citation /
 * dangling / under-refusal counts) stay deterministic and judge-independent. Re-introducing a model
 * split requires updating this comment, GATE-ARCHITECTURE.md, and eval-model-coupling.test.ts.
 *
 * Both LLM scores (soft faithfulness, completeness) are non-deterministic even at temperature 0.
 * EVAL_JUDGE_SAMPLES (default 1) draws N judge samples per case and takes the median — a majority
 * vote that keeps a single flaky grade from flipping a gate. Raise it on the merge queue / nightly.
 */

/** Pinned judge model — same pin as production/eval generator (P4 retired; see module comment). */
export const JUDGE_MODEL = "mistral-large-2512";

const judgeResponseSchema = z.object({
  faithfulness: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export type JudgeResponse = z.infer<typeof judgeResponseSchema>;

/**
 * Extract the JSON object from a judge response. Shared with the roleplay judge, which asks a
 * different question and therefore has a different schema, but must fail on a malformed answer in
 * exactly the same way — a second copy of this would be a second chance to start defaulting scores.
 * Throws on no object present or unparseable JSON.
 */
export function extractJsonPayload(text: string): unknown {
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) {
    throw new Error(`Judge returned no JSON object: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Judge returned malformed JSON: ${reason}`, { cause: error });
  }
}

/**
 * Pure parse of a judge model response (no network, so the contract is unit-testable):
 * extract the JSON object, `JSON.parse` it, then validate against {@link judgeResponseSchema}.
 * Throws — never defaults a score — on any of: no JSON object present, malformed JSON, or a
 * schema violation. Callers decide whether to retry (see {@link runJudgeWithParseRetry}).
 */
export function parseJudgeOutput(text: string): JudgeResponse {
  return judgeResponseSchema.parse(extractJsonPayload(text));
}

/** Runs one judge turn; `extraMessages` are appended after the base prompt (used by the retry). */
export type JudgeModelCall = (extraMessages: ChatMessage[]) => Promise<string>;

/**
 * How often {@link runJudgeWithParseRetry} had to fire its targeted retry (a first judge output
 * failed to parse). Surfaced in the E9 run artefact so judge-flakiness stays a visible trend rather
 * than a silently-swallowed warning. Module-level: the eval is a single-run process.
 */
let judgeParseRetryCount = 0;

export function getJudgeParseRetryCount(): number {
  return judgeParseRetryCount;
}

/** Reset the counter (used by unit tests; the eval process never reuses the module). */
export function resetJudgeParseRetryCount(): void {
  judgeParseRetryCount = 0;
}

/**
 * Call the judge with exactly one targeted retry on a parse/validation failure. One malformed
 * output no longer fails the whole run at the first attempt: the failure is fed back into the
 * conversation ("your previous answer was not valid JSON") so the model can correct itself.
 * A second failure throws (fail-loud, no silent default score). Each retry is logged as a warning
 * so its frequency stays visible (input for the E9 run artefact).
 *
 * `parse` is a parameter because the roleplay judge answers a different question with a different
 * schema. The retry POLICY — exactly one, fail loud, counted — stays in one place for both.
 */
export async function runJudgeWithParseRetry<T>(
  call: JudgeModelCall,
  parse: (text: string) => T,
): Promise<T> {
  const firstRaw = await call([]);
  try {
    return parse(firstRaw);
  } catch (error) {
    judgeParseRetryCount += 1;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[judge] parse-retry: previous output was not valid JSON (${reason})`);
    const retryRaw = await call([
      { role: "assistant", content: firstRaw },
      {
        role: "user",
        content: `Je vorige antwoord was geen geldig JSON: ${reason}. Antwoord uitsluitend met het JSON-object.`,
      },
    ]);
    // A second failure throws here — the run fails loud, no score is defaulted.
    return parse(retryRaw);
  }
}

export interface CaseScores {
  /** Deterministic: 1 unless the answer states a number/amount/term absent from the context. */
  hardHallucination: number;
  /** LLM-judged: paraphrase drift / nuance loss (soft faithfulness). */
  faithfulness: number;
  /** LLM-judged: answers the actual question rather than adjacent context. */
  relevance: number;
  citationCorrectness: number;
  completeness: number;
  refusalCalibration: number;
  /** Deterministic: 1 when every model-attested quote is verbatim in its chunk (Fase A). */
  citationVerification: number;
  /** Deterministic: fraction of verified citations without a matching `[n]` in the prose (0 = clean). */
  orphanRate: number;
  /** Deterministic: fraction of prose `[n]` markers without a verified citation behind them (0 = clean). */
  danglingMarkerRate: number;
  /** Whether the answer refused ("niet gevonden"); drives the two-sided refusal rates. */
  refused: boolean;
  category: GoldenCase["category"];
}

export interface AggregateScores {
  hardHallucination: number;
  /**
   * Soft faithfulness / relevance / completeness: mean over ANSWERABLE cases only.
   * Refusal cases copy `refusalCalibration` onto those fields per-case (nothing substantive
   * to judge), so including them in the mean lets one allowed under-refusal (count ≤ 1) zero
   * three regression metrics against a baseline recorded at underRefusal=0. Refusal quality
   * is already `refusalCalibration` + under-refusal count. Same exclusion as citationCorrectness
   * (Fase 4 actie 6).
   */
  faithfulness: number;
  relevance: number;
  citationCorrectness: number;
  completeness: number;
  refusalCalibration: number;
  /** % answers where every quote verbatim-verified (deterministic; the citation-contract gate). */
  citationVerification: number;
  /** Mean orphan-source rate across answers (should be 0 after Fase A). */
  orphanRate: number;
  /** Mean dangling-marker rate across answers (should be 0 after citation reconciliation). */
  danglingMarkerRate: number;
  /** Answerable cases (in_scope/table) that wrongly refused, as a rate of answerable cases. */
  overRefusalRate: number;
  /** Refusal cases that wrongly answered, as a rate of refusal cases. */
  underRefusalRate: number;
  caseCount: number;
  /**
   * Count of cases whose citationVerification scored 0. The absolute Gate C check is count-based
   * ("0 of N unverified") — at N=31 one failure is already 96.8% < 0.98, so the percentage form was
   * schijngranulariteit over an [X]-gate. Rate kept above for trend.
   */
  unverifiedCitationCount: number;
  /** Count of cases with danglingMarkerRate > 0. Same count-based absolute gate as above. */
  danglingCaseCount: number;
  /**
   * Count of refusal cases that wrongly answered. With only a handful of refusal fixtures the
   * underRefusalRate is a noisy tiny-denominator fraction (1 of 3 = 33%), so the gate is expressed as a
   * count (like citation-verification/dangling). Hallucinated under-refusals are still caught absolutely
   * by hard-hallucination; this count tolerates a grounded should-have-deferred slip. See REVIEW.md §21.
   */
  underRefusalCount: number;
}

/**
 * Deterministic citation verification for the eval: parse the generation output, verify each quote
 * verbatim against its passage, and measure orphan citations. Refusals are vacuously clean.
 */
export function scoreCitationVerification(
  rawAnswer: string,
  testCase: GoldenCase,
  passages: GoldenPassage[],
): { verification: number; orphanRate: number; danglingMarkerRate: number; prose: string } {
  if (testCase.category === "refusal") {
    // Score on the PARSED prose (what the pipeline actually delivers), not rawAnswer. The generator can
    // run away past a clean refusal and dump content after the `<<<CITATIONS>>>` sentinel (etd-026:
    // finishReason=length, a few-shot-example tail with numbers like "16 weken"); that tail is stripped
    // before the user ever sees it, so the load-bearing hard-hallucination gate must measure the delivered
    // prose, identical to the answerable path below (golden-set.REVIEW.md §22, REVIEW.md §21: safety =
    // post-pipeline output). A refusal that WRONGLY answers still keeps its ungrounded fact in the
    // pre-sentinel prose, so under-refusal-with-fabrication is still caught.
    return {
      verification: 1,
      orphanRate: 0,
      danglingMarkerRate: 0,
      prose: parseGenerationOutput(rawAnswer).answerMarkdown,
    };
  }

  const parsed = parseGenerationOutput(rawAnswer);
  if (parsed.citationParseFailed) {
    // An answerable case that did not emit a parseable citation block violates the contract.
    const proseMarkers = new Set(extractCitationMarkers(parsed.answerMarkdown));
    return {
      verification: 0,
      orphanRate: 0,
      danglingMarkerRate: proseMarkers.size === 0 ? 0 : 1,
      prose: parsed.answerMarkdown,
    };
  }

  const contentById = new Map(passages.map((passage) => [passage.id, passage.content]));
  const result = verifyCitations(parsed.modelCitations, contentById);

  const proseMarkers = new Set(extractCitationMarkers(parsed.answerMarkdown));
  const verifiedMarkers = result.verified.map((citation) => citation.marker);

  // Verification passes only when nothing was stripped AND no prose `[n]` is left without a verified
  // citation behind it. Without the second clause, an answer that keeps `[1]` in the prose but emits
  // an empty citations array scores a vacuous 1 (baseline v4 etd-021): there is nothing to strip, yet
  // the marker is unsupported — exactly the answer the citation contract is supposed to fail.
  const hasUnbackedMarker = proseMarkers.size > 0 && verifiedMarkers.length === 0;
  const verification = result.strippedMarkers.length === 0 && !hasUnbackedMarker ? 1 : 0;

  const orphans = verifiedMarkers.filter((marker) => !proseMarkers.has(marker)).length;
  const orphanRate = verifiedMarkers.length === 0 ? 0 : orphans / verifiedMarkers.length;
  const dangling = [...proseMarkers].filter((marker) => !verifiedMarkers.includes(marker)).length;
  const danglingMarkerRate = proseMarkers.size === 0 ? 0 : dangling / proseMarkers.size;

  return { verification, orphanRate, danglingMarkerRate, prose: parsed.answerMarkdown };
}

const NO_TIMINGS: RetrievalTimings = {
  rewriteMs: 0,
  embedMs: 0,
  searchMs: 0,
  rerankMs: 0,
  totalMs: 0,
};

/** Gate C context, built with the exact production assembler (single source of truth). */
export function assembleEvalContext(passages: GoldenPassage[]): string {
  return assemble(passages.map(passageToHit), NO_TIMINGS).context;
}

function extractCitationRefs(answer: string): number[] {
  const refs = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const ref = Number(match[1]);
    if (Number.isInteger(ref) && ref > 0) {
      refs.add(ref);
    }
  }
  return [...refs];
}

/**
 * Deterministic citation check: the answer cites the expected article (or lid) and the cited
 * passage content supports that reference.
 */
export function scoreCitationCorrectness(
  answer: string,
  testCase: GoldenCase,
  passages: GoldenPassage[],
): number {
  if (testCase.category === "refusal") {
    return 1;
  }

  if (!testCase.expectedArticle) {
    return 1;
  }

  const expectedArticle = testCase.expectedArticle;
  const articlePattern = new RegExp(
    `artikel\\s+${expectedArticle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  );
  const mentionsArticle = articlePattern.test(answer);

  const citedRefs = extractCitationRefs(answer);
  const citedPassages = citedRefs
    .map((ref) => passages[ref - 1])
    .filter((passage): passage is GoldenPassage => passage !== undefined);

  const citedArticleMatch = citedPassages.some(
    (passage) =>
      passage.article === expectedArticle ||
      passage.source.toLowerCase().includes(`artikel ${expectedArticle.toLowerCase()}`) ||
      passage.source.toLowerCase().includes(expectedArticle.toLowerCase()),
  );

  const contentMatch = passages.some((passage) => {
    const articleOk =
      passage.article === expectedArticle ||
      passage.source.toLowerCase().includes(expectedArticle.toLowerCase());
    return articleOk && answer.toLowerCase().includes(passage.content.slice(0, 40).toLowerCase().slice(0, 20));
  });

  if (mentionsArticle && (citedArticleMatch || citedRefs.length > 0)) {
    return 1;
  }
  if (citedArticleMatch) {
    return 1;
  }
  if (citedRefs.length > 0 && contentMatch) {
    return 0.8;
  }
  if (citedRefs.length > 0) {
    return 0.5;
  }
  return mentionsArticle ? 0.6 : 0;
}

/**
 * Meta-level "this CAO does not contain/determine X" — not an in-corpus documented no
 * ("heeft geen recht op woon-werkvergoeding"). Used to recognise a grounded scope-refusal
 * (etd-025) without treating a CAO-stated 'nee' as a refusal (etd-009).
 */
const SCOPE_NEGATION =
  /(?:deze\s+)?cao[\s\S]{0,160}(?:bepaalt|regelt|bevat|kent)\s+geen/i;
const SCOPE_ABSENCE =
  /(?:in\s+deze\s+cao|deze\s+cao)[\s\S]{0,80}staat\s+geen|(?:staat|bevat)\s+(?:er\s+)?geen\s+regeling|staat\s+niet\s+in\s+(?:deze\s+)?(?:cao|tekst|documenten)|niet\s+in\s+(?:deze\s+)?cao|valt\s+buiten\s+(?:deze\s+)?cao/i;

/**
 * A subsequent (or same-span) grant of an adjacent entitlement. The etd-032 form: after
 * "staat geen fietsplan" it still assigns travel reimbursement. That is under-refusal, not a
 * scope-refusal. Matching this on the negation span itself covers a one-sentence collapse.
 */
const GRANTS_ENTITLEMENT =
  /\bregelt alleen\b|\bheeft recht op\b|\b(?:krijgt|ontvangt)\s+(?:hij|zij|de werknemer|een)\b/i;

function hasScopeNegation(text: string): boolean {
  return SCOPE_NEGATION.test(text) || SCOPE_ABSENCE.test(text);
}

/**
 * Whether an answer is a refusal rather than a substantive answer.
 *
 * The template `NOT_FOUND_MESSAGE` and "niet terugvinden" remain the production contract. A
 * grounded scope-refusal (the CAO does not determine X, with no entitlement granted after that
 * negation) also counts — etd-025's own `referenceAnswer` is that form, and scoring only the
 * template made the golden set and the gate reward opposite behaviour.
 *
 * A scope-negation that then assigns an adjacent right (etd-032: no fietsplan, then travel
 * reimbursement from the same distractor) is NOT a refusal. Hard-hallucination stays absolute:
 * a fabricated fact in the pre-sentinel prose still fails that gate even when this returns true.
 */
export function answerRefuses(answer: string, notFoundMessage: string): boolean {
  if (answer.includes(notFoundMessage) || /niet terugvinden/i.test(answer)) {
    return true;
  }
  if (!hasScopeNegation(answer)) {
    return false;
  }
  return !GRANTS_ENTITLEMENT.test(answer);
}

export function scoreRefusalCalibration(answer: string, testCase: GoldenCase, notFoundMessage: string): number {
  const refused = answerRefuses(answer, notFoundMessage);

  if (testCase.category === "refusal") {
    return refused ? 1 : 0;
  }

  return refused ? 0 : 1;
}

/**
 * Hard-hallucination check (deterministic, near-zero tolerance) — the gate that actually backs the
 * "hij verzint niets"-promise. The hard-fact regexes live in `../hard-facts.js` (shared with the
 * production runtime guard per agentKey, so the gate and the guard cannot drift). Each load-bearing
 * fact must literally appear in the grounding.
 *
 * Returns 1 when every hard fact is grounded (or there are none), 0 when any is invented. Binary on
 * purpose: one fabricated salary or term is a hard fail, regardless of how fluent the answer reads.
 */
export function scoreHardHallucination(
  answer: string,
  passages: GoldenPassage[],
  userSupplied = "",
  agentKey: HardFactAgentKey = "cao",
): { score: number; invented: string[] } {
  // Grounding = retrieved context + what the user themselves put on the table. A `derived` case asks
  // "en bij 24 uur?"; the agent echoing "24 uur" is not a hallucination, so the user's question/history
  // count as grounding. What stays forbidden is an invented *result* (a pro-rata total not in the CAO).
  const grounding = `${passages.map((passage) => passage.content).join(" ")} ${userSupplied}`;
  const invented = findUngroundedFacts(answer, grounding, userSupplied, agentKey);
  return { score: invented.length === 0 ? 1 : 0, invented };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

async function judgeOnce(
  question: string,
  context: string,
  answer: string,
  referenceAnswer: string,
): Promise<{ faithfulness: number; relevance: number; completeness: number }> {
  const baseMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Je bent een strikte evaluator voor een CAO-assistent.",
        "Beoordeel het antwoord op basis van ALLEEN de gegeven context en de referentie.",
        "Antwoord uitsluitend met geldig JSON:",
        '{"faithfulness":0.0,"relevance":0.0,"completeness":0.0,"reasoning":"kort"}',
        "",
        "faithfulness (0-1): bevat het antwoord geen feiten die niet uit de context volgen?",
        "relevance (0-1): beantwoordt het antwoord de gestelde vraag echt, en niet alleen een verwant onderwerp?",
        "completeness (0-1): beantwoordt het antwoord de kern van de vraag zoals de referentie?",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Vraag: ${question}`,
        "",
        "Context:",
        context,
        "",
        `Referentie-antwoord: ${referenceAnswer}`,
        "",
        `Te beoordelen antwoord: ${answer}`,
      ].join("\n"),
    },
  ];

  const parsed = await runJudgeWithParseRetry(async (extraMessages) => {
    const result = await retryWithBackoff(
      () =>
        generateText({
          model: JUDGE_MODEL,
          temperature: 0,
          messages: [...baseMessages, ...extraMessages],
        }),
      { baseDelayMs: 5000, maxAttempts: 8 },
    );
    return result.text;
  }, parseJudgeOutput);

  return {
    faithfulness: parsed.faithfulness,
    relevance: parsed.relevance,
    completeness: parsed.completeness,
  };
}

/**
 * Judge the answer, taking the median over EVAL_JUDGE_SAMPLES draws (default 1) so a single flaky
 * grade cannot flip a gate. Samples are sequential to respect Mistral rate limits.
 */
export async function judgeFaithfulnessAndCompleteness(
  question: string,
  context: string,
  answer: string,
  referenceAnswer: string,
): Promise<{ faithfulness: number; relevance: number; completeness: number }> {
  const samples = env.EVAL_JUDGE_SAMPLES ?? 1;
  const faithfulnessSamples: number[] = [];
  const relevanceSamples: number[] = [];
  const completenessSamples: number[] = [];

  for (let i = 0; i < samples; i++) {
    const judged = await judgeOnce(question, context, answer, referenceAnswer);
    faithfulnessSamples.push(judged.faithfulness);
    relevanceSamples.push(judged.relevance);
    completenessSamples.push(judged.completeness);
  }

  return {
    faithfulness: median(faithfulnessSamples),
    relevance: median(relevanceSamples),
    completeness: median(completenessSamples),
  };
}

export async function scoreAnswerCase(
  testCase: GoldenCase,
  passages: GoldenPassage[],
  answer: string,
  notFoundMessage: string,
): Promise<CaseScores> {
  const context = assembleEvalContext(passages);

  // Split the citation block off the prose; all prose-level scorers see the answer as the user does.
  const { verification, orphanRate, danglingMarkerRate, prose } = scoreCitationVerification(answer, testCase, passages);

  const citationCorrectness = scoreCitationCorrectness(prose, testCase, passages);
  const refusalCalibration = scoreRefusalCalibration(prose, testCase, notFoundMessage);
  const refused = answerRefuses(prose, notFoundMessage);
  // User-supplied numbers (this turn's question + prior history) count as grounding: a `derived` case
  // like "en bij 24 uur?" must not flag the agent for echoing the 24 the user provided.
  const userSupplied = [testCase.question, ...(testCase.history ?? []).map((message) => message.content)].join(" ");
  const hardHallucination = scoreHardHallucination(prose, passages, userSupplied).score;

  if (testCase.category === "refusal") {
    // Refusal cases now receive a real generated answer (against near-miss distractor context), so
    // `refused` reflects whether the model actually refused — this is what makes under-refusal
    // measurable. Faithfulness/relevance/completeness ride on refusalCalibration (there is nothing
    // substantive to judge against a refusal reference). citationCorrectness runs through the real
    // scorer instead of a forced 1: a correct refusal has no article to cite (scorer returns 1),
    // while a wrong answer no longer gets a free pass.
    return {
      hardHallucination,
      faithfulness: refusalCalibration,
      relevance: refusalCalibration,
      citationCorrectness,
      completeness: refusalCalibration,
      refusalCalibration,
      citationVerification: verification,
      orphanRate,
      danglingMarkerRate,
      refused,
      category: testCase.category,
    };
  }

  const judged = await judgeFaithfulnessAndCompleteness(
    testCase.question,
    context,
    prose,
    testCase.referenceAnswer,
  );

  return {
    hardHallucination,
    faithfulness: judged.faithfulness,
    relevance: judged.relevance,
    citationCorrectness,
    completeness: judged.completeness,
    refusalCalibration,
    citationVerification: verification,
    orphanRate,
    danglingMarkerRate,
    refused,
    category: testCase.category,
  };
}

export function aggregateScores(scores: CaseScores[]): AggregateScores {
  if (scores.length === 0) {
    return {
      hardHallucination: 0,
      faithfulness: 0,
      relevance: 0,
      citationCorrectness: 0,
      completeness: 0,
      refusalCalibration: 0,
      citationVerification: 0,
      orphanRate: 0,
      danglingMarkerRate: 0,
      overRefusalRate: 0,
      underRefusalRate: 0,
      caseCount: 0,
      unverifiedCitationCount: 0,
      danglingCaseCount: 0,
      underRefusalCount: 0,
    };
  }

  const sum = scores.reduce(
    (acc, score) => ({
      hardHallucination: acc.hardHallucination + score.hardHallucination,
      refusalCalibration: acc.refusalCalibration + score.refusalCalibration,
      citationVerification: acc.citationVerification + score.citationVerification,
      orphanRate: acc.orphanRate + score.orphanRate,
      danglingMarkerRate: acc.danglingMarkerRate + score.danglingMarkerRate,
    }),
    {
      hardHallucination: 0,
      refusalCalibration: 0,
      citationVerification: 0,
      orphanRate: 0,
      danglingMarkerRate: 0,
    },
  );

  const answerable = scores.filter((score) => score.category !== "refusal");
  const refusals = scores.filter((score) => score.category === "refusal");
  const overRefusals = answerable.filter((score) => score.refused).length;
  const underRefusals = refusals.filter((score) => !score.refused).length;
  const unverifiedCitationCount = scores.filter((score) => score.citationVerification === 0).length;
  const danglingCaseCount = scores.filter((score) => score.danglingMarkerRate > 0).length;

  // Soft quality + citationCorrectness: answerable cases only. Refusal cases copy
  // refusalCalibration onto faith/rel/complete per-case (nothing to judge) and score a
  // vacuous 1.0 on citationCorrectness. Including them in the mean either flatters the
  // metric (correct refusal) or lets one allowed under-refusal (count ≤ 1) zero three
  // regression checks against a baseline recorded at underRefusal=0. Refusal quality is
  // already refusalCalibration + under-refusal count. (Fase 4 actie 6 for citations;
  // 2026-08-22 for the three soft metrics.)
  const meanAnswerable = (pick: (score: CaseScores) => number): number =>
    answerable.length === 0 ? 0 : answerable.reduce((acc, score) => acc + pick(score), 0) / answerable.length;

  const count = scores.length;
  return {
    hardHallucination: sum.hardHallucination / count,
    faithfulness: meanAnswerable((score) => score.faithfulness),
    relevance: meanAnswerable((score) => score.relevance),
    citationCorrectness: meanAnswerable((score) => score.citationCorrectness),
    completeness: meanAnswerable((score) => score.completeness),
    refusalCalibration: sum.refusalCalibration / count,
    citationVerification: sum.citationVerification / count,
    orphanRate: sum.orphanRate / count,
    danglingMarkerRate: sum.danglingMarkerRate / count,
    overRefusalRate: answerable.length === 0 ? 0 : overRefusals / answerable.length,
    underRefusalRate: refusals.length === 0 ? 0 : underRefusals / refusals.length,
    caseCount: count,
    unverifiedCitationCount,
    danglingCaseCount,
    underRefusalCount: underRefusals,
  };
}
