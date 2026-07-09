import { getCaoAgent } from "@/lib/agent";
import { resolveFundScope } from "@/lib/fund-scope";
import { readBodyBounded } from "@/lib/http";
import { acquireSlot, checkRateLimit, clientKey, releaseSlot } from "@/lib/rate-limit";
import { chatEventSchema, chatRequestSchema, type ChatEvent } from "./contract";

/**
 * POST /api/chat — the demo's chat entrypoint. A thin controller (see 200-architecture.mdc):
 * validate input (Zod) → delegate to the CAO-agent seam → stream events back as NDJSON. No
 * retrieval/agent/model logic lives here.
 *
 * Because it is public and each call costs an embedding + an LLM generation, the controller also
 * enforces the perimeter controls the security audit requires: per-client rate limiting and a
 * global concurrency cap (#1), a bounded request body (#7), and server-side authorization of the
 * requested fund (#2). None of these is agent/model logic — they are the API gate.
 */

// The agent uses the Node runtime (postgres driver, Mastra); not the edge runtime.
export const runtime = "nodejs";

const RATE_LIMIT = { windowMs: 60_000, max: 20 };

const encoder = new TextEncoder();

function line(event: ChatEvent): Uint8Array {
  // Validate every event we emit (API outputs are a boundary too).
  return encoder.encode(`${JSON.stringify(chatEventSchema.parse(event))}\n`);
}

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

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const scope = resolveFundScope(parsed.data.fund);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status });
  }

  const agent = getCaoAgent();
  const { question, history } = parsed.data;
  const { fund } = scope;

  // Bound total concurrent expensive requests, independent of per-client rate limiting.
  if (!acquireSlot()) {
    return Response.json({ error: "server_busy" }, { status: 503, headers: { "retry-after": "5" } });
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
      try {
        for await (const event of agent.answerStream({ question, fund, history }, { signal: abort.signal })) {
          if (abort.signal.aborted) break;
          controller.enqueue(line(event));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("[api/chat] agent stream failed:", error);
          controller.enqueue(
            line({ type: "error", message: "Er ging iets mis bij het beantwoorden van je vraag." }),
          );
        }
      } finally {
        releaseOnce();
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
    },
  });
}
