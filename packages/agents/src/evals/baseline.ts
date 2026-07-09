/**
 * Recorded eval baseline for regression-relative gates (Fase 9 DoD: "leg de baseline vast").
 *
 * Absolute thresholds alone are noise-sensitive on a ~40-item set: one hard new question can flip a
 * gate. Alongside the absolute minima we compare against a committed baseline and fail on a
 * *regression* larger than REL_TOLERANCE, even when the absolute floor is still met.
 *
 * The baseline is only comparable within one corpus snapshot (see GOLDEN_CORPUS_VERSION); a
 * mismatch disables the relative checks and prints how to re-record. Record with
 * EVAL_WRITE_BASELINE=1 on a known-good run.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const baselinePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "baseline.json");

const retrievalSectionSchema = z.object({
  hitAt1: z.number(),
  recallAt3: z.number(),
  recallAt5: z.number(),
  mrr: z.number(),
});

const answerSectionSchema = z.object({
  hardHallucination: z.number(),
  faithfulness: z.number(),
  relevance: z.number().optional(),
  citationCorrectness: z.number(),
  completeness: z.number(),
  refusalCalibration: z.number(),
  citationVerification: z.number().optional(),
  orphanRate: z.number().optional(),
  danglingMarkerRate: z.number().optional(),
  overRefusalRate: z.number(),
  underRefusalRate: z.number(),
});

export const baselineSchema = z.object({
  corpusVersion: z.string().optional(),
  // SHA-256 over both golden fixture files at record time (see golden-set.ts GOLDEN_FIXTURE_HASH).
  // Lets the gate detect a fixture edit that skipped a GOLDEN_CORPUS_VERSION bump.
  fixtureHash: z.string().optional(),
  retrieval: retrievalSectionSchema.optional(),
  answer: answerSectionSchema.optional(),
});

export type Baseline = z.infer<typeof baselineSchema>;
export type RetrievalBaseline = z.infer<typeof retrievalSectionSchema>;
export type AnswerBaseline = z.infer<typeof answerSectionSchema>;

/** How far below baseline a metric may drift before it counts as a regression (5 points). */
export const REL_TOLERANCE = 0.05;

export function readBaseline(): Baseline | null {
  if (!existsSync(baselinePath)) {
    return null;
  }
  const raw = readFileSync(baselinePath, "utf8").trim();
  if (raw.length === 0) {
    return null;
  }
  return baselineSchema.parse(JSON.parse(raw));
}

/** Merge one section into the baseline file (used by EVAL_WRITE_BASELINE runs). */
export function updateBaselineSection(section: Partial<Baseline>): void {
  const current = readBaseline() ?? {};
  const next: Baseline = baselineSchema.parse({ ...current, ...section });
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
