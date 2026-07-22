import { randomUUID } from "node:crypto";
import { recordInteractionEvent, type InteractionOutcome } from "@wunderstack/analytics";
import { getTenantConfig } from "@wunderstack/db";
import { getTenantId } from "@wunderstack/tenant";
import { env } from "@wunderstack/shared";
import { getCaoAgent } from "@/lib/agent";
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
 */

// The agent uses the Node runtime (postgres driver, Mastra); not the edge runtime.
export const runtime = "nodejs";

const AGENT_ID = "cao";
const RATE_LIMIT = { windowMs: 60_000, max: 20 };
/** Per-tenant-key ceiling (a fund's whole embed audience shares this), on top of the per-IP limit. */
const KEY_RATE_LIMIT = { windowMs: 60_000, max: 120 };
/** Global daily chat ceiling for the whole process (tenant-zero denial-of-wallet backstop). 0 = off. */
const DAILY_CAP = env.RUNTIME_DAILY_CAP ?? 0;

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
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const allowlist = auth.config?.corsAllowlist ?? [];
  const cors = corsHeaders(request, allowlist);

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

  // Abort in-flight work (retrieval + Mistral generation) when the client disconnects, instead of
  // generating tokens no one will read.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

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
      let sawError = false;

      try {
        for await (const event of agent.answerStream(
          { question, fund, history },
          { signal: abort.signal, sessionId, ...(userId === undefined ? {} : { userId }) },
        )) {
          if (abort.signal.aborted) break;
          if (event.type === "citations") {
            found = event.found;
            needsClarification = event.needsClarification;
            citationCount = event.citations.length;
          } else if (event.type === "done") {
            traceId = event.traceId;
          }
          controller.enqueue(line(event));
        }
      } catch (error) {
        sawError = true;
        if (!abort.signal.aborted) {
          console.error("[api/chat] agent stream failed:", error);
          controller.enqueue(
            line({ type: "error", message: "Er ging iets mis bij het beantwoorden van je vraag." }),
          );
        }
      } finally {
        releaseOnce();
        // Fase 1 event-log. Skip on client abort (an incomplete turn is not a product signal).
        if (!abort.signal.aborted) {
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
      }
    },
    cancel() {
      abort.abort();
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
