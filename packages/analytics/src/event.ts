import { agentChannelSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The interaction-event contract (Fase 1). One event per agent turn, written to the fund database and
 * read by the dashboard. Zod-validated at the boundary (300-typescript): the schema is the single
 * source of truth and the DB row shape is derived from it.
 */

/** The outcome of a turn. Drives the dashboard's answered/refused/clarified KPIs. */
export const interactionOutcomes = ["answered", "refused", "clarified", "error"] as const;

export type InteractionOutcome = (typeof interactionOutcomes)[number];

export const interactionEventInputSchema = z.object({
  /** Instance/deployment identity (D15 technical key). */
  tenantId: z.string().min(1),
  /** Which agent answered (e.g. "cao"). */
  agentId: z.string().min(1),
  /** The fund (customer-domain word) whose corpus answered. */
  fund: z.string().min(1),
  /** Stable per-conversation id, shared with the Langfuse trace (one identity model). */
  sessionId: z.string().min(1),
  /** Pseudonymous end-user id; null for embed users (no identification in v1, AVG). */
  userId: z.string().min(1).nullish(),
  /** Langfuse trace id, links the durable event to per-trace debugging + later feedback. */
  traceId: z.string().min(1).nullish(),
  outcome: z.enum(interactionOutcomes),
  citationCount: z.number().int().nonnegative().default(0),
  /** Potentially-sensitive query text; logged for the corpus-roadmap signal (90-day retention). */
  question: z.string().min(1).max(4000).nullish(),
  /** Coarse theme metadata; null until a classifier exists (deferred). */
  theme: z.string().min(1).max(200).nullish(),
  /**
   * Surface that produced this turn (playground | embed | mcp | api). Null for events recorded
   * before the channel dimension existed (PLAN-mcp-server Fase 1a).
   */
  channel: agentChannelSchema.nullish(),
});

export type InteractionEventInput = z.input<typeof interactionEventInputSchema>;
export type ParsedInteractionEvent = z.output<typeof interactionEventInputSchema>;
