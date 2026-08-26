import {
  appendTurnAndMaybeEnd,
  claimTurn,
  createRoleplayAgent,
  loadSession,
  loadTranscript,
} from "@wunderstack/agents";
import { roleplayEventSchema, roleplayTurnRequestSchema, type RoleplayEvent } from "@wunderstack/shared";

import { createTurnWorkSignal } from "@/lib/ndjson-stream";
import { acquireSlot, releaseSlot } from "@/lib/rate-limit";
import {
  checkRoleplayDailyCap,
  gateRoleplayRequest,
  roleplayPreflight,
} from "@/lib/roleplay-request";
import { resolveRoleplayFund } from "@/lib/roleplay-scope";
import {
  DEFAULT_ROLEPLAY_HEARTBEAT_MS,
  DEFAULT_ROLEPLAY_TURN_BUDGET_MS,
  pipeRoleplayNdjsonStream,
} from "@/lib/roleplay-stream";
import { roleplayTurnEvents } from "@/lib/roleplay-turn";

/**
 * POST /api/roleplay/turn — one exchange, streamed as NDJSON.
 *
 * The order here is the whole design. The turn is claimed atomically BEFORE the stream opens, so a
 * refusal (session finished, budget spent) is an HTTP status rather than a 200 carrying an error
 * event, and two tabs posting at once cannot both spend the same turn. The orchestration that
 * follows lives in `lib/roleplay-turn.ts` so it can be tested without a database or a model.
 *
 * A claimed turn is spent even if generation then fails. That is the safe direction: refunding it
 * would reopen the race the atomic claim exists to close, and a free retry loop is a bigger problem
 * than a lost turn on a provider hiccup.
 */

export const runtime = "nodejs";

// No env override, unlike chat: roleplay has no deployment yet that needs a different number, and
// borrowing `RUNTIME_CHAT_*` would silently couple two unrelated budgets.
const TURN_BUDGET_MS = DEFAULT_ROLEPLAY_TURN_BUDGET_MS;
const HEARTBEAT_MS = DEFAULT_ROLEPLAY_HEARTBEAT_MS;

const encoder = new TextEncoder();

function line(event: RoleplayEvent): Uint8Array {
  // Validate every event we emit — an API output is a boundary too.
  return encoder.encode(`${JSON.stringify(roleplayEventSchema.parse(event))}\n`);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return roleplayPreflight(request);
}

export async function POST(request: Request): Promise<Response> {
  const gate = await gateRoleplayRequest(request, "turn");
  if (!gate.ok) {
    return gate.response;
  }
  const { cors } = gate;

  const parsed = roleplayTurnRequestSchema.safeParse(gate.json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  // No client-supplied fund on a turn: the session id already determines which fund's schema holds
  // it, and accepting a second claim would only create a way for the two to disagree.
  const scope = resolveRoleplayFund(gate.config, undefined);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }
  const { fund } = scope;
  const { sessionId, message } = parsed.data;

  const session = await loadSession(fund, sessionId);
  if (!session) {
    return Response.json({ error: "session_not_found" }, { status: 404, headers: cors });
  }
  if (session.status === "ended") {
    return Response.json(
      { error: "session_ended", endReason: session.endReason },
      { status: 409, headers: cors },
    );
  }

  const capped = checkRoleplayDailyCap(cors);
  if (capped) {
    return capped;
  }
  if (!acquireSlot()) {
    return Response.json(
      { error: "server_busy" },
      { status: 503, headers: { "retry-after": "5", ...cors } },
    );
  }

  let slotReleased = false;
  const releaseOnce = (): void => {
    if (!slotReleased) {
      slotReleased = true;
      releaseSlot();
    }
  };

  let claim;
  try {
    claim = await claimTurn(fund, sessionId);
  } catch (error) {
    releaseOnce();
    console.error("[api/roleplay/turn] failed to claim a turn:", error);
    return Response.json({ error: "turn_failed" }, { status: 502, headers: cors });
  }

  // Zero rows means no such session — a different failure from a refusal, and collapsing the two
  // would report a mistyped session id as "conversation over".
  if (!claim.found) {
    releaseOnce();
    return Response.json({ error: "session_not_found" }, { status: 404, headers: cors });
  }
  if (!claim.accepted) {
    releaseOnce();
    return Response.json(
      { error: "no_turns_left", turnsUsed: claim.turnsUsed, maxTurns: claim.maxTurns },
      { status: 409, headers: cors },
    );
  }

  const cancel = new AbortController();
  const { workSignal, turnDeadline } = createTurnWorkSignal({
    clientSignal: request.signal,
    cancelSignal: cancel.signal,
    turnBudgetMs: TURN_BUDGET_MS,
  });

  const agent = createRoleplayAgent();
  const granted = claim;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await pipeRoleplayNdjsonStream({
        events: roleplayTurnEvents({
          message,
          scenario: session.snapshot.prompt,
          turnsUsed: granted.turnsUsed,
          maxTurns: granted.maxTurns,
          loadTranscript: () => loadTranscript(fund, sessionId),
          nextTurn: ({ history, isClosingTurn }) =>
            agent.nextTurn(
              { scenario: session.snapshot.prompt, history, message, isClosingTurn },
              { sessionId, signal: workSignal },
            ),
          persist: async ({ userMessage, assistantMessage, endReason }) => {
            await appendTurnAndMaybeEnd(fund, sessionId, userMessage, assistantMessage, endReason);
          },
        }),
        enqueue: (chunk) => controller.enqueue(chunk),
        encodeEvent: line,
        isClientDisconnected: () => request.signal.aborted,
        isTurnTimedOut: () => turnDeadline.aborted,
        workSignal,
        heartbeatMs: HEARTBEAT_MS,
      });

      releaseOnce();
      try {
        controller.close();
      } catch {
        /* already closed (client cancelled the stream) */
      }
    },
    cancel() {
      cancel.abort();
      releaseOnce();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      ...cors,
    },
  });
}
