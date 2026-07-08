import { env } from "@wunderstack/shared";
import { z } from "zod";

/**
 * Write a user-feedback score onto an existing Langfuse trace (Fase 12 feedback loop).
 *
 * The Mastra Langfuse exporter only *emits* traces; it has no API to score one after the fact. So we
 * call Langfuse's public REST endpoint directly (POST /api/public/scores, HTTP Basic auth with the
 * project's public/secret keys). This stays behind the agent seam — apps call `recordFeedbackScore`,
 * never Langfuse itself (see .cursor/rules/500-agents.mdc). The provider is the same EU-sovereign
 * Langfuse Cloud already pinned for tracing (100-stack.mdc), so no new provider is introduced.
 *
 * Best-effort by contract: when Langfuse is not configured it returns `{ recorded: false }` instead
 * of throwing, mirroring how the rest of the codebase treats optional credentials.
 */

const DEFAULT_LANGFUSE_BASE_URL = "https://cloud.langfuse.com";
const DEFAULT_SCORE_NAME = "user-feedback";

export const feedbackScoreSchema = z.object({
  /** The Langfuse trace to attach the score to (surfaced by the agent stream's `done` event). */
  traceId: z.string().min(1),
  /** Thumbs up = 1, thumbs down = 0 (a BOOLEAN Langfuse score). */
  value: z.union([z.literal(0), z.literal(1)]),
  /** Optional free-text reason the user gave. */
  comment: z.string().max(2000).optional(),
  /** Score name; defaults to "user-feedback". */
  name: z.string().min(1).max(200).default(DEFAULT_SCORE_NAME),
});

export type FeedbackScore = z.input<typeof feedbackScoreSchema>;

export interface RecordFeedbackResult {
  recorded: boolean;
}

export interface RecordFeedbackOptions {
  signal?: AbortSignal;
}

export async function recordFeedbackScore(
  input: FeedbackScore,
  options: RecordFeedbackOptions = {},
): Promise<RecordFeedbackResult> {
  const { traceId, value, comment, name } = feedbackScoreSchema.parse(input);
  return recordLangfuseScore(
    {
      traceId,
      name,
      value,
      dataType: "BOOLEAN",
      ...(comment === undefined ? {} : { comment }),
    },
    options,
  );
}

export interface NumericTraceScore {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
}

/** Record a numeric Langfuse score on an existing trace (e.g. citation verification). */
export async function recordNumericTraceScore(
  input: NumericTraceScore,
  options: RecordFeedbackOptions = {},
): Promise<RecordFeedbackResult> {
  return recordLangfuseScore(
    {
      traceId: input.traceId,
      name: input.name,
      value: input.value,
      dataType: "NUMERIC",
      ...(input.comment === undefined ? {} : { comment: input.comment }),
    },
    options,
  );
}

interface LangfuseScorePayload {
  traceId: string;
  name: string;
  value: number;
  dataType: "BOOLEAN" | "NUMERIC";
  comment?: string;
}

async function recordLangfuseScore(
  input: LangfuseScorePayload,
  options: RecordFeedbackOptions = {},
): Promise<RecordFeedbackResult> {
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    return { recorded: false };
  }

  const baseUrl = (env.LANGFUSE_BASE_URL ?? DEFAULT_LANGFUSE_BASE_URL).replace(/\/+$/, "");
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  const response = await fetch(`${baseUrl}/api/public/scores`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      traceId: input.traceId,
      name: input.name,
      value: input.value,
      dataType: input.dataType,
      ...(input.comment === undefined ? {} : { comment: input.comment }),
    }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Langfuse score failed: ${String(response.status)} ${detail}`.trim());
  }

  return { recorded: true };
}
