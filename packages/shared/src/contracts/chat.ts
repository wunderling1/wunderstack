import { z } from "zod";

import { agentChannelSchema } from "./channel.js";
import { citationSchema } from "./citation.js";

/**
 * Chat API contract (request + NDJSON events). Runtime and playground import this; the embed keeps a
 * looser local mirror (`packages/embed/src/types.ts`) because it must not load `@wunderstack/shared`
 * (that barrel parses `process.env`). Discriminators must stay in sync:
 * `status | text | citations | followups | done | error`.
 */

export const chatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z
  .object({
    question: z.string().min(1, "Stel een vraag.").max(2000, "Vraag is te lang."),
    /** Optional O&O fund key to restrict retrieval to a single fund corpus. */
    fund: z.string().min(1).max(200).optional(),
    /** Recent turns to condense elliptical follow-up questions into a standalone retrieval query. */
    history: z.array(chatHistoryMessageSchema).max(6).default([]),
    /** Stable per-conversation id (client-generated); shared with the Langfuse trace + event-log. */
    sessionId: z.string().min(1).max(200).optional(),
    /** Pseudonymous end-user id; omitted for embed users (no identification in v1, AVG). */
    userId: z.string().min(1).max(200).optional(),
    /**
     * Surface that produced this turn. Clients self-report so playground and embed can be separated
     * in Langfuse + analytics. Unknown values are rejected. Agent id is NOT a client field.
     */
    channel: agentChannelSchema.optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatCitation = z.infer<typeof citationSchema>;

/** Named progress phases; the client maps each to a user-facing (Dutch) label. */
export const chatStatusPhases = ["searching", "retrieved", "generating"] as const;

export type ChatStatusPhase = (typeof chatStatusPhases)[number];

/** One event in the NDJSON response stream. Mirrors the agent's stream events plus a terminal error. */
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    phase: z.enum(chatStatusPhases),
    /** Number of retrieved passages, present on the `retrieved` phase. */
    count: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({
    type: z.literal("citations"),
    found: z.boolean(),
    needsClarification: z.boolean(),
    citations: z.array(citationSchema),
    citationVerificationFailed: z.boolean(),
    /** Final reconciled answer text (failed markers stripped); the client replaces streamed text. */
    answer: z.string(),
  }),
  z.object({
    type: z.literal("followups"),
    /** Grounded Dutch follow-up question chips (2–3); omitted from the stream when empty. */
    questions: z.array(z.string().min(1).max(200)).max(3),
  }),
  z.object({
    type: z.literal("done"),
    usage: z.object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
    /** Langfuse trace id (null when tracing is unconfigured); used to attach user feedback. */
    traceId: z.string().nullable(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
