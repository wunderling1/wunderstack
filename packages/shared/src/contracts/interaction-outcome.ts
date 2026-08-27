import { z } from "zod";

/**
 * Outcome of one grounded-agent turn. Shared by the event-log, Langfuse root metadata, and the
 * chat stream so a timeout or an unverifiable answer cannot be counted as a corpus refusal.
 *
 * `timeout` is not an answer and not a refusal: generation was aborted or the turn budget fired.
 * `unverifiable` is not a corpus-miss: retrieval found context, but the citation/hard-fact guard
 * refused to serve the claim (G4 coupling / ungrounded figure).
 */
export const interactionOutcomes = [
  "answered",
  "refused",
  "clarified",
  "unverifiable",
  "timeout",
  "error",
] as const;

export type InteractionOutcome = (typeof interactionOutcomes)[number];

export const interactionOutcomeSchema = z.enum(interactionOutcomes);

/** Settled path only — never timeout/error (those are thrown, not served). */
export const settledRunOutcomes = ["answered", "refused", "clarified", "unverifiable"] as const;

export type SettledRunOutcome = (typeof settledRunOutcomes)[number];

export const settledRunOutcomeSchema = z.enum(settledRunOutcomes);

/** Fail-path outcomes written on the chat `error` event. */
export const streamErrorOutcomes = ["timeout", "error"] as const;

export type StreamErrorOutcome = (typeof streamErrorOutcomes)[number];

export const streamErrorOutcomeSchema = z.enum(streamErrorOutcomes);

/**
 * Classify a served turn. Empty retrieval is `refused`. A substantive answer that failed
 * verification or the hard-fact guard is `unverifiable` — retrieval DID find context.
 */
export function classifySettledRunOutcome(args: {
  found: boolean;
  needsClarification?: boolean;
  unverifiable?: boolean;
  hardFactGuardTriggered?: boolean;
}): SettledRunOutcome {
  if (args.needsClarification === true) {
    return "clarified";
  }
  if (args.found) {
    return "answered";
  }
  if (args.unverifiable === true || args.hardFactGuardTriggered === true) {
    return "unverifiable";
  }
  return "refused";
}

/** Turn-budget / work-signal abort is a timeout; any other throw is an error. */
export function classifyThrownRunOutcome(signalAborted: boolean): StreamErrorOutcome {
  return signalAborted ? "timeout" : "error";
}

/** Timeouts and faults are not a quality verdict — exclude them from the v1 answered rate. */
export function isQualityOutcome(outcome: string): boolean {
  return outcome !== "timeout" && outcome !== "error";
}
