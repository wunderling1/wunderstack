/**
 * Eval run artefact config — the fields that determine gate outcomes (B2).
 * Extracted so unit tests can assert config serialization without running the full eval.
 */

import { env } from "@wunderstack/shared";

import type { EvalReport } from "./report-writer.js";

export type EvalReportConfig = EvalReport["config"];

export function buildReportConfig(config: EvalReportConfig): EvalReportConfig {
  return config;
}

/** Build the config block written into every eval-report.json from env + resolved run options. */
export function reportConfigFromEnv(options: {
  requireAll: boolean;
  onlyGates: string[];
  tier: EvalReportConfig["tier"];
  contentGatesBlocking: boolean;
  pathScope: string[];
}): EvalReportConfig {
  return buildReportConfig({
    requireAll: options.requireAll,
    judgeSamples: env.EVAL_JUDGE_SAMPLES ?? 1,
    generationSamples: env.EVAL_GENERATION_SAMPLES ?? 2,
    writeBaseline: env.EVAL_WRITE_BASELINE === "1" || env.EVAL_WRITE_BASELINE === "true",
    onlyGates: options.onlyGates,
    tier: options.tier,
    contentGatesBlocking: options.contentGatesBlocking,
    pathScope: options.pathScope,
  });
}
