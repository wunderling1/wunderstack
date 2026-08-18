import { randomUUID } from "node:crypto";
import { recordInteractionEvent, type InteractionOutcome } from "@wunderstack/analytics";
import { getTenantConfig } from "@wunderstack/db";
import { getTenantId } from "@wunderstack/tenant";
import { env } from "@wunderstack/shared";
import { getCaoAgent } from "@/lib/agent";
import {
  createChatWorkSignal,
  DEFAULT_CHAT_HEARTBEAT_MS,
  DEFAULT_CHAT_TURN_BUDGET_MS,
  pipeChatNdjsonStream,
} from "@/lib/chat-stream";
import { corsHeaders, preflight } from "@/lib/cors";
import { resolveEmbedAuth } from "@/lib/embed-auth";
import { resolveFundScope } from "@/lib/fund-scope";
import { readBodyBounded } from "@/lib/http";
import { acquireSlot, checkDailyCap, checkRateLimit, clientKey, releaseSlot } from "@/lib/rate-limit";
import { chatEventSchema, chatRequestSchema, type ChatEvent } from "./contract";

/**
 * POST /api/chat — the runtime's chat entrypoint. A thin controller (see 200-architecture.mdc):
 * validate input (Zod) → delegate to the CAO-agent seam → stream events back as NDJSON. No
 * retrieval/agent/model logic lives here.
 *
 * Because it is public and each call costs an embedding + an LLM generation, the controller also
 * enforces the perimeter controls the security audit requires: per-client rate limiting and a
 * global concurrency cap (#1), a bounded request body (#7), and server-side authorization of the
 * requested fund (#2). None of these is agent/model logic — they are the API gate.
 *
 * Fase 1: after the turn, one interaction event is written to the fund database (via
 * @wunderstack/analytics) with the tenant/fund/session/outcome dimensions. Best-effort — a failed
 * or unconfigured event-log must never break an answer that was already streamed.
 *
 * Stream robustness: a turn budget + NDJSON heartbeats + a terminal-event guarantee so a slow
 * buffer-to-verify generation never leaves the client spinning forever (see lib/chat-stream.ts).
 */

// The agent uses the Node runtime (postgres driver, Mastra); not the edge runtime.
export const runtime = "nodejs";

const AGENT_ID = "cao";
const RATE_LIMIT = { windowMs: 60_000, max: 20 };
/** Per-tenant-key ceiling (a fund's whole embed audience shares this), on top of the per-IP limit. */
const KEY_RATE_LIMIT = { windowMs: 60_000, max: 120 };
/** Global daily chat ceiling for the whole process (tenant-zero denial-of-wallet backstop). 0 = off. */
const DAILY_CAP = env.RUNTIME_DAILY_CAP ?? 0;
const TURN_BUDGET_MS = env.RUNTIME_CHAT_TURN_BUDGET_MS ?? DEFAULT_CHAT_TURN_BUDGET_MS;
const HEARTBEAT_MS = env.RUNTIME_CHAT_HEARTBEAT_MS ?? DEFAULT_CHAT_HEARTBEAT_MS;

const encoder = new TextEncoder();

function line(event: ChatEvent): Uint8Array {
  // Validate every event we emit (API outputs are a boundary too).
  return encoder.encode(`${JSON.stringify(chatEventSchema.parse(event))}\n`);
}

export async function OPTIONS(request: Request): Promise<Response> {
  const config = await getTenantConfig(getTenantId()).catch(() => null);
  return preflight(request, config?.corsAllowlist ?? []);
}

export async function POST(request: Request): Promise<Response> {
  // Embed surface: validate the tenant-key (browser cross-origin) and derive the CORS allowlist.
  const auth = await resolveEmbedAuth(request);
  const allowlist = auth.ok
    ? (auth.config?.corsAllowlist ?? [])
    : ((await getTenantConfig(getTenantId()).catch(() => null))?.corsAllowlist ?? []);
  const cors = corsHeaders(request, allowlist);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: cors });
  }

  const limit = checkRateLimit(clientKey(request), RATE_LIMIT);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds), ...cors } },
    );
  }
  // Per-key limit: bound a single fund's total embed traffic independent of any one IP.
  if (auth.config) {
    const keyLimit = checkRateLimit(`tenant:${auth.config.tenantId}`, KEY_RATE_LIMIT);
    if (!keyLimit.ok) {
      return Response.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": String(keyLimit.retryAfterSeconds), ...cors } },
      );
    }
  }

  const body = await readBodyBounded(request);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status, headers: cors });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.raw);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const scope = resolveFundScope(parsed.data.fund);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }

  const agent = getCaoAgent();
  const { question, history, userId } = parsed.data;
  const { fund } = scope;
  // A client-supplied session id keeps one identity model across turns; fall back to a per-request
  // id so an event is never sessionless.
  const sessionId = parsed.data.sessionId ?? randomUUID();
  // Clients self-report the surface (playground | embed); default to "api" for untagged callers.
  const channel = parsed.data.channel ?? "api";
  const tenantId = getTenantId();

  // Global daily ceiling: a coarse backstop on the demo's total inference bill, counted only for
  // requests that reach the expensive path (after validation), independent of per-IP/per-key limits.
  const daily = checkDailyCap(DAILY_CAP);
  if (!daily.ok) {
    return Response.json(
      { error: "daily_cap_reached" },
      { status: 429, headers: { "retry-after": String(daily.retryAfterSeconds), ...cors } },
    );
  }

  // Bound total concurrent expensive requests, independent of per-client rate limiting.
  if (!acquireSlot()) {
    return Response.json(
      { error: "server_busy" },
      { status: 503, headers: { "retry-after": "5", ...cors } },
    );
  }

  // Cancel in-flight work on: client disconnect, stream cancel, OR turn-budget expiry. Terminal
  // handling keys off `request.signal` (client still connected?) so a turn-budget abort still yields
  // an error event instead of a silent hang.
  const cancel = new AbortController();
  const { workSignal, turnDeadline } = createChatWorkSignal({
    clientSignal: request.signal,
    cancelSignal: cancel.signal,
    turnBudgetMs: TURN_BUDGET_MS,
  });

  let slotReleased = false;
  const releaseOnce = (): void => {
    if (!slotReleased) {
      slotReleased = true;
      releaseSlot();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Outcome dimensions observed off the event stream, written to the event-log after the turn.
      let found: boolean | undefined;
      let needsClarification = false;
      let citationCount = 0;
      let traceId: string | null = null;

      const { sawError } = await pipeChatNdjsonStream({
        events: agent.answerStream(
          { question, fund, history },
          {
            signal: workSignal,
            sessionId,
            channel,
            ...(userId === undefined ? {} : { userId }),
          },
        ),
        enqueue: (chunk) => controller.enqueue(chunk),
        encodeEvent: line,
        isClientDisconnected: () => request.signal.aborted,
        isTurnTimedOut: () => turnDeadline.aborted,
        workSignal,
        heartbeatMs: HEARTBEAT_MS,
        onEvent: (event) => {
          if (event.type === "citations") {
            found = event.found;
            needsClarification = event.needsClarification;
            citationCount = event.citations.length;
          } else if (event.type === "done") {
            traceId = event.traceId;
          }
        },
      });

      releaseOnce();
      // Fase 1 event-log. Skip on client disconnect (an incomplete turn is not a product signal).
      // A turn-budget timeout still logs as error — the client was connected and got a terminal event.
      if (!request.signal.aborted) {
        const outcome: InteractionOutcome = sawError
          ? "error"
          : needsClarification
            ? "clarified"
            : found
              ? "answered"
              : "refused";
        try {
          await recordInteractionEvent({
            tenantId,
            agentId: AGENT_ID,
            fund,
            sessionId,
            channel,
            ...(userId === undefined ? {} : { userId }),
            ...(traceId === null ? {} : { traceId }),
            outcome,
            citationCount,
            question,
          });
        } catch (error) {
          console.error("[api/chat] failed to record interaction event:", error);
        }
      }
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
