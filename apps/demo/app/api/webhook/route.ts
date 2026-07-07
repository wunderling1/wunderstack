import { readBodyBounded } from "@/lib/http";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { verifyWebhookSignature } from "@/lib/webhook-auth";
import { webhookAckSchema, webhookEventSchema } from "./contract";

/**
 * POST /api/webhook — inbound LMS / O&O-fund webhook. Thin controller: rate-limit, bound the body,
 * HMAC-verify the signature over the raw bytes, validate the envelope (Zod), and acknowledge. No
 * business logic or side effects in v1 (see contract.ts) — but the auth seam is built in now so it
 * can never ship unauthenticated (security-audit finding #5).
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

  // Verify the signature over the exact raw bytes before doing any parsing/work.
  const verified = verifyWebhookSignature(request, body.raw);
  if (!verified.ok) {
    return Response.json({ error: verified.error }, { status: verified.status });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.raw);
  } catch {
    return Response.json({ error: "invalid_webhook" }, { status: 400 });
  }

  const parsed = webhookEventSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_webhook", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // A cao.updated event must name the fund it concerns; a ping need not.
  if (parsed.data.type === "cao.updated" && !parsed.data.fund) {
    return Response.json(
      { error: "invalid_webhook", issues: "cao.updated requires a `fund`." },
      { status: 400 },
    );
  }

  const ack = webhookAckSchema.parse({ received: true, type: parsed.data.type });
  return Response.json(ack, { status: 202 });
}
