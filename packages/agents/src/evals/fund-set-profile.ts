/**
 * Corpus profile sidecar schema — one JSON file per fund golden set (`fixtures/fund-sets/<key>.json`).
 * Replaces hand-written FUND_SET_META: a new corpus is fixture + profile, no code edit.
 */

import { z } from "zod";

import type { AgentKey } from "../runtime/registry.js";

import { AGENT_EVAL_PROFILES } from "./agent-profile.js";

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

/** Reject profiles whose agentKey is not in the eval registry. */
export function assertKnownAgentKey(agentKey: string): asserts agentKey is AgentKey {
  if (!(agentKey in AGENT_EVAL_PROFILES)) {
    throw new Error(
      `Fund set profile agentKey "${agentKey}" is not registered in AGENT_EVAL_PROFILES. ` +
        "Add the agent eval profile before adding this fund set.",
    );
  }
}
