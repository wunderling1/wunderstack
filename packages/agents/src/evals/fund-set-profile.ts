/**
 * Corpus profile sidecar schema — one JSON file per fund golden set (`fixtures/fund-sets/<key>.json`).
 * Replaces hand-written FUND_SET_META: a new corpus is fixture + profile, no code edit.
 */

import { isGroundedAgentKey, type GroundedAgentKey } from "@wunderstack/shared";
import { z } from "zod";

export const fundSetIngestSchema = z
  .object({
    source: z.string().min(1),
    version: z.string().min(1),
    prune: z.boolean(),
  })
  .strict();

export const fundSetProfileSchema = z
  .object({
    key: z.string().min(1),
    fund: z.string().min(1),
    agentKey: z.string().min(1).default("cao"),
    corpusVersion: z.string().min(1),
    contentStatus: z.enum(["scaffold", "starter", "fund-reviewed"]),
    expectedDocuments: z.array(z.string().min(1)).optional(),
    ingest: fundSetIngestSchema.optional(),
    minScore: z.number().min(0).max(1).optional(),
  })
  .strict();

export type FundSetProfile = z.infer<typeof fundSetProfileSchema>;
export type FundSetIngest = z.infer<typeof fundSetIngestSchema>;

export function parseFundSetProfile(raw: unknown): FundSetProfile {
  return fundSetProfileSchema.parse(raw);
}

/**
 * Reject profiles whose agentKey is not a grounded agent. AGENT_EVAL_PROFILES is
 * `Record<AgentKey, …>` over the same keys, so this is the eval-registry check without
 * importing agent-profile.ts (which would cycle through golden-set → judge → harness).
 */
export function assertKnownAgentKey(agentKey: string): asserts agentKey is GroundedAgentKey {
  if (!isGroundedAgentKey(agentKey)) {
    throw new Error(
      `Fund set profile agentKey "${agentKey}" is not registered in AGENT_EVAL_PROFILES. ` +
        "Add the agent eval profile before adding this fund set.",
    );
  }
}
