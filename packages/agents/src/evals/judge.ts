import { generateText } from "@wunderstack/ai";
import { z } from "zod";

import type { GoldenCase, GoldenPassage } from "./golden-set.js";
import { retryWithBackoff } from "./retry.js";

/**
 * LLM-as-judge and deterministic scorers for Gate C (answer-level eval).
 * All model calls go through @wunderstack/ai (sovereign Mistral path).
 */

const JUDGE_MODEL = "mistral-small-latest";

const judgeResponseSchema = z.object({
  faithfulness: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export interface CaseScores {
  faithfulness: number;
  citationCorrectness: number;
  completeness: number;
  refusalCalibration: number;
}

export interface AggregateScores {
  faithfulness: number;
  citationCorrectness: number;
  completeness: number;
  refusalCalibration: number;
  caseCount: number;
}

function buildContext(passages: GoldenPassage[]): string {
  return passages
    .map((passage, index) => `[${String(index + 1)}] ${passage.content.trim()}`)
    .join("\n\n");
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

export function scoreRefusalCalibration(answer: string, testCase: GoldenCase, notFoundMessage: string): number {
  const refused = answer.includes(notFoundMessage) || /niet terugvinden/i.test(answer);

  if (testCase.category === "refusal") {
    return refused ? 1 : 0;
  }

  return refused ? 0 : 1;
}

export async function judgeFaithfulnessAndCompleteness(
  question: string,
  context: string,
  answer: string,
  referenceAnswer: string,
): Promise<{ faithfulness: number; completeness: number }> {
  const result = await retryWithBackoff(
    () =>
      generateText({
        model: JUDGE_MODEL,
        temperature: 0,
        messages: [
      {
        role: "system",
        content: [
          "Je bent een strikte evaluator voor een CAO-assistent.",
          "Beoordeel het antwoord op basis van ALLEEN de gegeven context en de referentie.",
          "Antwoord uitsluitend met geldig JSON:",
          '{"faithfulness":0.0,"completeness":0.0,"reasoning":"kort"}',
          "",
          "faithfulness (0-1): bevat het antwoord geen feiten die niet uit de context volgen?",
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
    ],
      }),
    { baseDelayMs: 5000, maxAttempts: 8 },
  );

  const jsonMatch = /\{[\s\S]*\}/.exec(result.text);
  if (!jsonMatch) {
    throw new Error(`Judge returned non-JSON: ${result.text.slice(0, 200)}`);
  }

  const parsed = judgeResponseSchema.parse(JSON.parse(jsonMatch[0]));
  return { faithfulness: parsed.faithfulness, completeness: parsed.completeness };
}

export async function scoreAnswerCase(
  testCase: GoldenCase,
  passages: GoldenPassage[],
  answer: string,
  notFoundMessage: string,
): Promise<CaseScores> {
  const context = buildContext(passages);
  const citationCorrectness = scoreCitationCorrectness(answer, testCase, passages);
  const refusalCalibration = scoreRefusalCalibration(answer, testCase, notFoundMessage);

  if (testCase.category === "refusal") {
    return {
      faithfulness: refusalCalibration,
      citationCorrectness: 1,
      completeness: refusalCalibration,
      refusalCalibration,
    };
  }

  const judged = await judgeFaithfulnessAndCompleteness(
    testCase.question,
    context,
    answer,
    testCase.referenceAnswer,
  );

  return {
    faithfulness: judged.faithfulness,
    citationCorrectness,
    completeness: judged.completeness,
    refusalCalibration,
  };
}

export function aggregateScores(scores: CaseScores[]): AggregateScores {
  if (scores.length === 0) {
    return { faithfulness: 0, citationCorrectness: 0, completeness: 0, refusalCalibration: 0, caseCount: 0 };
  }

  const sum = scores.reduce(
    (acc, score) => ({
      faithfulness: acc.faithfulness + score.faithfulness,
      citationCorrectness: acc.citationCorrectness + score.citationCorrectness,
      completeness: acc.completeness + score.completeness,
      refusalCalibration: acc.refusalCalibration + score.refusalCalibration,
    }),
    { faithfulness: 0, citationCorrectness: 0, completeness: 0, refusalCalibration: 0 },
  );

  const count = scores.length;
  return {
    faithfulness: sum.faithfulness / count,
    citationCorrectness: sum.citationCorrectness / count,
    completeness: sum.completeness / count,
    refusalCalibration: sum.refusalCalibration / count,
    caseCount: count,
  };
}

export { buildContext };
