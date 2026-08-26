import { endSession, loadReview, loadSession } from "@wunderstack/agents";
import {
  roleplayReviewRequestSchema,
  roleplayReviewResponseSchema,
  type RoleplayEndReason,
} from "@wunderstack/shared";
import { after } from "next/server";

import { gateRoleplayAuth, gateRoleplayRequest, roleplayPreflight } from "@/lib/roleplay-request";
import { runReview, toReviewPayload } from "@/lib/roleplay-review";
import { resolveRoleplayFund } from "@/lib/roleplay-scope";

/**
 * The rubric review for one session.
 *
 * POST starts it; GET polls for the result. Two verbs rather than one long request because the
 * judgement takes up to two minutes and must survive the learner closing the tab (R4): the work runs
 * detached via `after()`, and the stored row — not the HTTP response — is the source of truth. Fase 7
 * then enqueues that row onto the outbox; polling remains for the embed UI, which has no target.
 *
 * There is no separate "end session" route. A review request for a session that is still running
 * ends it first, because reviewing an unfinished conversation is exactly the abandoned case the
 * reviewer prompt already handles.
 */

export const runtime = "nodejs";

/** A review reasons over the whole transcript; the default 15s serverless ceiling is not enough. */
export const maxDuration = 300;

export async function OPTIONS(request: Request): Promise<Response> {
  return roleplayPreflight(request);
}

export async function POST(request: Request): Promise<Response> {
  const gate = await gateRoleplayRequest(request, "turn");
  if (!gate.ok) {
    return gate.response;
  }
  const { cors } = gate;

  const parsed = roleplayReviewRequestSchema.safeParse(gate.json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const scope = resolveRoleplayFund(gate.config, undefined);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }
  const { fund } = scope;
  const { sessionId } = parsed.data;

  const session = await loadSession(fund, sessionId);
  if (!session) {
    return Response.json({ error: "session_not_found" }, { status: 404, headers: cors });
  }

  // Already judged: answer with the stored review rather than paying for a second opinion.
  const existing = await loadReview(fund, sessionId);
  if (existing) {
    return reviewResponse(existing, session.snapshot.prompt.rubric.passThreshold, cors);
  }

  // The client's reason is only honoured while the session is still open. A conversation the persona
  // already closed keeps the reason it closed with, so a client cannot relabel a completed session
  // as abandoned to soften how the reviewer judges it.
  const endReason: RoleplayEndReason =
    session.status === "ended"
      ? (session.endReason ?? "completed")
      : ((await endSession(fund, sessionId, parsed.data.endReason ?? "abandoned")) ?? "abandoned");

  const started = { ...session, status: "ended" as const, endReason };
  after(async () => {
    await runReview(fund, started, endReason);
  });

  return Response.json(
    roleplayReviewResponseSchema.parse({ status: "pending" }),
    { status: 202, headers: { "cache-control": "no-store", ...cors } },
  );
}

export async function GET(request: Request): Promise<Response> {
  // GET has no body, but it must still resolve the same fund the POST that started the session
  // used. Skipping embed-auth here made a keyed start followed by an unkeyed poll look in the
  // wrong schema and report `session_not_found` for a review that was running.
  const gate = await gateRoleplayAuth(request, "poll");
  if (!gate.ok) {
    return gate.response;
  }
  const { cors } = gate;

  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  const parsed = roleplayReviewRequestSchema.safeParse({ sessionId });
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const scope = resolveRoleplayFund(gate.config, undefined);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }
  const { fund } = scope;

  const session = await loadSession(fund, parsed.data.sessionId);
  if (!session) {
    return Response.json({ error: "session_not_found" }, { status: 404, headers: cors });
  }

  const review = await loadReview(fund, parsed.data.sessionId);
  if (!review) {
    return Response.json(
      roleplayReviewResponseSchema.parse({ status: "pending" }),
      { headers: { "cache-control": "no-store", ...cors } },
    );
  }
  return reviewResponse(review, session.snapshot.prompt.rubric.passThreshold, cors);
}

function reviewResponse(
  review: Parameters<typeof toReviewPayload>[0],
  passThreshold: number,
  cors: Record<string, string>,
): Response {
  return Response.json(
    roleplayReviewResponseSchema.parse({
      status: "ready",
      review: toReviewPayload(review, passThreshold),
    }),
    { headers: { "cache-control": "no-store", ...cors } },
  );
}
