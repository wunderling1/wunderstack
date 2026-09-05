import type { ZodType } from "zod";

import type { RetrievalInput, RetrievalOutput } from "./retrieval";

/**
 * Data + function fields that specialise the shared grounded-agent pipeline.
 * A new agent is one of these objects — not a new `agent.ts` copy (see DECISION-shared-agent-runtime).
 *
 * `agentKey` is typed as string here to avoid an import cycle with the registry; registered profiles
 * use literal keys that match {@link AgentKey}.
 *
 * Do not put `if (agentKey === "…")` in the pipeline: put the difference in a profile field.
 */
export interface AgentRuntimeProfile {
  agentKey: string;
  label: string;
  description: string;
  systemInstructions: string;
  buildAnswerPrompt(context: string, question: string): string;
  /** Served on empty retrieval / hard-fact refuse. */
  notFoundMessage: string;
  /**
   * Exact model sentence for "this question is outside this catalog" (arbo (b)).
   * `null` = no out-of-scope template; claimless fall-through stays `no_coverage`.
   * Matched on parsed model output before serve-replace. Difference lives here, not in
   * `if (agentKey === "arbo")`.
   */
  outOfScopeMessage: string | null;
  /** Served when a substantive answer has no verified citations. */
  unverifiableMessage: string;
  /** Carries the per-agent minScore default (0.48 CAO / 0.35 arbo). */
  questionSchema: ZodType;
  runRetrieval(input: RetrievalInput): Promise<RetrievalOutput>;
  /**
   * Underspecified-question detector. `null` means the agent has no clarify branch (arbo today).
   * Never gate this with `if (agentKey === "cao")` in the pipeline.
   */
  clarify: ((question: string) => string | null) | null;
}

export type { RetrievalInput, RetrievalOutput };
