import { isAgentKey, isGroundedAgentKey } from "@wunderstack/shared";
import { corpusVersionLabel } from "./overview";

/** Grounded agents show citation/refusal metrics; exercise agents do not (S15). */
export function agentShowsQualityColumns(agentKey: string): boolean {
  return isGroundedAgentKey(agentKey);
}

export function isExerciseAgentKey(value: string): boolean {
  return isAgentKey(value) && !isGroundedAgentKey(value);
}

export interface CorpusGateVerdict {
  result: string | null;
  evaluatedAt: Date | null;
  artefactUrl: string | null;
  corpusVersion: string | null;
}

export interface CorpusApproval {
  corpusVersion: string | null;
  pinnedReleaseTag: string | null;
  approved: boolean;
}

/** Gate verdict and fund approval share one corpusVersion — never two sources (S13/S14). */
export interface CorpusDecision {
  corpusVersion: string | null;
  gate: CorpusGateVerdict;
  approval: CorpusApproval;
}

export function buildCorpusDecision(input: {
  documentVersions: string[];
  pinnedReleaseTag: string | null;
  gateResult: string | null;
  gateEvaluatedAt: Date | null;
  artefactUrl: string | null;
}): CorpusDecision {
  const label = corpusVersionLabel(input.documentVersions);
  const corpusVersion = label === "n.n.b." ? null : label;
  return {
    corpusVersion,
    gate: {
      result: input.gateResult,
      evaluatedAt: input.gateEvaluatedAt,
      artefactUrl: input.artefactUrl,
      corpusVersion,
    },
    approval: {
      corpusVersion,
      pinnedReleaseTag: input.pinnedReleaseTag,
      approved: corpusVersion !== null && input.pinnedReleaseTag === corpusVersion,
    },
  };
}
