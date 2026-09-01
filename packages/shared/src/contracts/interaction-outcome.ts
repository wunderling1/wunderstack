import { z } from "zod";

/**
 * Outcome of one grounded-agent turn. Produced at the decision point in the agent pipeline and
 * written to `interaction_events` — never reconstructed from answer text or the `found` flag.
 */

export const turnOutcomes = ["answered", "refused", "clarified", "error", "unknown"] as const;

export type TurnOutcomeValue = (typeof turnOutcomes)[number];

export const answeredReasons = ["grounded"] as const;

export const refusedReasons = [
  "no_coverage",
  "guard_hard_fact",
  "guard_citation_coupling",
  "out_of_scope",
] as const;

export const clarifiedReasons = ["ambiguous_query"] as const;

export const errorReasons = ["timeout", "provider_error", "aborted"] as const;

export type RefusedReason = (typeof refusedReasons)[number];

export type ErrorReason = (typeof errorReasons)[number];

export const turnOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("answered"), outcomeReason: z.literal("grounded") }),
  z.object({
    outcome: z.literal("refused"),
    outcomeReason: z.enum(refusedReasons),
  }),
  z.object({ outcome: z.literal("clarified"), outcomeReason: z.literal("ambiguous_query") }),
  z.object({
    outcome: z.literal("error"),
    outcomeReason: z.enum(errorReasons),
  }),
  z.object({ outcome: z.literal("unknown"), outcomeReason: z.null() }),
]);

export type TurnOutcome = z.infer<typeof turnOutcomeSchema>;

/** Writable on the event-log insert path — `unknown` is migration-only (D3). */
export const writableTurnOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("answered"), outcomeReason: z.literal("grounded") }),
  z.object({
    outcome: z.literal("refused"),
    outcomeReason: z.enum(refusedReasons),
  }),
  z.object({ outcome: z.literal("clarified"), outcomeReason: z.literal("ambiguous_query") }),
  z.object({
    outcome: z.literal("error"),
    outcomeReason: z.enum(errorReasons),
  }),
]);

export type WritableTurnOutcome = z.infer<typeof writableTurnOutcomeSchema>;

export function answeredGrounded(): WritableTurnOutcome {
  return { outcome: "answered", outcomeReason: "grounded" };
}

export function refused(reason: RefusedReason): WritableTurnOutcome {
  return { outcome: "refused", outcomeReason: reason };
}

export function clarifiedOutcome(): WritableTurnOutcome {
  return { outcome: "clarified", outcomeReason: "ambiguous_query" };
}

export function errored(reason: ErrorReason): WritableTurnOutcome {
  return { outcome: "error", outcomeReason: reason };
}

/** Timeouts, faults, and pre-metric rows are not a quality verdict — exclude from answered rate. */
export function isQualityOutcome(outcome: string): boolean {
  return outcome !== "error" && outcome !== "unknown";
}
