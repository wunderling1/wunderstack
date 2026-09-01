import { index, integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per user interaction with an agent (Fase 1 event-log). This is the analytics fact table
 * the dashboard reads (via @wunderstack/analytics + the Scalingo read-only login user), kept
 * separate from Langfuse: Langfuse is per-trace debugging, this is the durable product-metrics log
 * that lives in the fund schema (until the move: `public`; see ADR-multitenant-database).
 *
 * Identity model (D15, track B): `tenantId` is the instance/deployment key, `fund` the
 * customer-domain word (1-to-1 per runtime process). `sessionId` is shared with the Langfuse trace.
 * `userId` is nullable — embed end-users are pseudonymous (no identification in v1, AVG). `question`
 * is logged to drive the "unanswered questions" corpus-roadmap signal; retention is 90 days (see
 * docs/decisions/DECISION-analytics-retention.md). `feedback` is filled in later by the feedback
 * endpoint, matched on `traceId`.
 */
export const interactionEvents = pgTable(
  "interaction_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    // Data-plane key (the fund whose corpus answered). Kept alongside tenantId for per-fund KPIs.
    fund: text("fund").notNull(),
    sessionId: text("session_id").notNull(),
    // Nullable: embed end-users are pseudonymous in v1 (no identification, AVG).
    userId: text("user_id"),
    // Langfuse trace id for this answer; links the durable event to per-trace debugging and lets the
    // feedback endpoint attach a signal after the fact. Null when tracing is unconfigured.
    traceId: text("trace_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    // "answered" | "refused" | "clarified" | "error" | "unknown" — classified at the pipeline decision point.
    outcome: text("outcome").notNull(),
    /** Reason for the outcome; null only on pre-metric rows (`outcome = unknown`). */
    outcomeReason: text("outcome_reason"),
    citationCount: integer("citation_count").notNull().default(0),
    /** Raw retrieval hit count for this turn (strength label derived in analytics). */
    retrievedCount: integer("retrieved_count").notNull().default(0),
    /** Highest similarity among retrieved hits; null when retrievedCount is 0. */
    topScore: real("top_score"),
    // Potentially-sensitive free text; logged for the corpus-roadmap signal, 90-day retention.
    question: text("question"),
    // Coarse theme metadata (roadmap signal). Null until a classifier exists (deferred, regel van drie).
    theme: text("theme"),
    // Surface that produced the turn (playground | embed | mcp | api). Null for pre-channel events.
    channel: text("channel"),
    // "up" | "down"; filled in by the feedback endpoint, matched on traceId. Null = no feedback given.
    feedback: text("feedback"),
  },
  (table) => [
    index("interaction_events_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    index("interaction_events_fund_idx").on(table.fund),
    index("interaction_events_session_idx").on(table.sessionId),
    index("interaction_events_trace_idx").on(table.traceId),
    index("interaction_events_channel_idx").on(table.channel),
  ],
);

export type InteractionEvent = typeof interactionEvents.$inferSelect;
export type NewInteractionEvent = typeof interactionEvents.$inferInsert;
