import { corpusFingerprintMatchesPinned } from "@wunderstack/analytics";
import { isAgentKey, isGroundedAgentKey } from "@wunderstack/shared";
import { corpusVersionLabel } from "./overview";
import type { GateStatus } from "./release-manifest";

/** Grounded agents show citation/refusal metrics; exercise agents do not (S15). */
export function agentShowsQualityColumns(agentKey: string): boolean {
  return isGroundedAgentKey(agentKey);
}

export function isExerciseAgentKey(value: string): boolean {
  return isAgentKey(value) && !isGroundedAgentKey(value);
}

export interface CorpusGateVerdict {
  result: GateStatus | null;
  evaluatedAt: Date | null;
  artefactUrl: string | null;
  fingerprint: string | null;
}

export interface CorpusApproval {
  fingerprint: string | null;
  pinnedReleaseTag: string | null;
  approved: boolean;
  /** Approved once, but against a corpus that has since changed (A5). */
  expired: boolean;
}

/**
 * Gate verdict and fund approval point at one corpus — never two sources (S13/S14). What they
 * point at is the fingerprint over the agent's whole document set, not one document's version
 * (DECISION-dashboard-indeling.md, A5).
 */
export interface CorpusDecision {
  fingerprint: string | null;
  /** Version of the most recently ingested document. Shown as context, never as the approval key. */
  latestVersion: string | null;
  documentCount: number;
  gate: CorpusGateVerdict;
  approval: CorpusApproval;
}

export function buildCorpusDecision(input: {
  fingerprint: string | null;
  documentVersions: string[];
  pinnedReleaseTag: string | null;
  gateResult: GateStatus | null;
  gateEvaluatedAt: Date | null;
  artefactUrl: string | null;
}): CorpusDecision {
  const label = corpusVersionLabel(input.documentVersions);
  const fingerprint = input.fingerprint;
  const approved = corpusFingerprintMatchesPinned(fingerprint, input.pinnedReleaseTag);
  return {
    fingerprint,
    latestVersion: label === "n.n.b." ? null : label,
    documentCount: input.documentVersions.length,
    gate: {
      result: input.gateResult,
      evaluatedAt: input.gateEvaluatedAt,
      artefactUrl: input.artefactUrl,
      fingerprint,
    },
    approval: {
      fingerprint,
      pinnedReleaseTag: input.pinnedReleaseTag,
      approved,
      expired: !approved && input.pinnedReleaseTag !== null,
    },
  };
}
