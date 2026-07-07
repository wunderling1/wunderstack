import { citationSchema, citationSourceSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The chat API contract, shared by the route handler (server) and the chat client. Both request and
 * response are Zod-validated at the boundary (see .cursor/rules/300-typescript.mdc).
 *
 * The response is a stream of newline-delimited JSON (NDJSON): one `ChatEvent` per line.
 */

export const chatRequestSchema = z.object({
  question: z.string().min(1, "Stel een vraag.").max(2000, "Vraag is te lang."),
  /** Optional O&O fund key to restrict the CAO to a single fund. */
  fund: z.string().min(1).max(200).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Cited source shape, shared across seams (see @wunderstack/shared). */
const sourceSchema = citationSourceSchema;

export type ChatSource = z.infer<typeof sourceSchema>;

/** Structure-aware citation (article/lid + snippet), shared across seams (see @wunderstack/shared). */
const citation = citationSchema;

export type ChatCitation = z.infer<typeof citation>;

/** One event in the NDJSON response stream. Mirrors the agent's stream events plus a terminal error. */
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sources"),
    found: z.boolean(),
    needsClarification: z.boolean(),
    sources: z.array(sourceSchema),
    citations: z.array(citation),
  }),
  z.object({ type: z.literal("text"), delta: z.string() }),
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
