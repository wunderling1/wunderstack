import {
  agentChannelSchema,
  groundedAgentKeySchema,
  writableTurnOutcomeSchema,
} from "@wunderstack/shared";
import { z } from "zod";

/**
 * The interaction-event contract (Fase 1). One event per agent turn, written to the fund database and
 * read by the dashboard. Zod-validated at the boundary (300-typescript): the schema is the single
 * source of truth and the DB row shape is derived from it.
 */

export const interactionEventInputSchema = z.object({
  /** Instance/deployment identity (D15 technical key). */
  tenantId: z.string().min(1),
  /**
   * Which grounded agent answered. Grounded keys only: an interaction event is a question, an answer
   * and an outcome. An exercise agent has no outcome in that sense — it has a session course, and it
   * is recorded in `roleplay_sessions`. Two concepts, two tables, so no reader has to subtract one
   * from the other.
   */
  agentKey: groundedAgentKeySchema,
  /** The fund (customer-domain word) whose corpus answered. */
  fund: z.string().min(1),
  /** Stable per-conversation id, shared with the Langfuse trace (one identity model). */
  sessionId: z.string().min(1),
  /** Pseudonymous end-user id; null for embed users (no identification in v1, AVG). */
  userId: z.string().min(1).nullish(),
  /** Langfuse trace id, links the durable event to per-trace debugging + later feedback. */
  traceId: z.string().min(1).nullish(),
  /** Classified at the pipeline decision point — required on every write path. */
  turnOutcome: writableTurnOutcomeSchema,
  citationCount: z.number().int().nonnegative().default(0),
  /** Raw retrieval signals — strength label is derived in analytics, not persisted. */
  retrievedCount: z.number().int().nonnegative(),
  topScore: z.number().min(0).max(1).nullable(),
  /** Potentially-sensitive query text; logged for the corpus-roadmap signal (retention not automated). */
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
