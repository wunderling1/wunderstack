import { recordFeedbackScore } from "@wunderstack/agents";
import { attachFeedbackByTrace } from "@wunderstack/analytics";
import { getTenantId } from "@wunderstack/tenant";
import { readBodyBounded } from "@/lib/http";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { feedbackRequestSchema } from "./contract";

/**
 * POST /api/feedback — attach a user's thumbs up/down to the answer's Langfuse trace as a score
 * (Fase 12 feedback loop). A thin controller (see 200-architecture.mdc): validate input (Zod) →
 * delegate to the agent's observability seam → return ok. No Langfuse logic lives here.
 *
 * Public and cheap, but still rate-limited so it cannot be used to spam the tracing backend.
 */

export const runtime = "nodejs";

const RATE_LIMIT = { windowMs: 60_000, max: 60 };

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientKey(request), RATE_LIMIT);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const body = await readBodyBounded(request);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.raw);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = feedbackRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { traceId, rating, reason } = parsed.data;

  try {
    const result = await recordFeedbackScore({
      traceId,
      value: rating === "up" ? 1 : 0,
      ...(reason ? { comment: reason } : {}),
    });
    // Mirror the signal onto the durable event-log (matched on traceId). Best-effort: a feedback
    // score on Langfuse must not fail because the event-log write did.
    try {
      await attachFeedbackByTrace(traceId, rating, getTenantId());
    } catch (error) {
      console.error("[api/feedback] failed to attach feedback to event-log:", error);
    }
    return Response.json({ ok: true, recorded: result.recorded });
  } catch (error) {
    console.error("[api/feedback] failed to record feedback:", error);
    return Response.json({ error: "feedback_failed" }, { status: 502 });
  }
}
