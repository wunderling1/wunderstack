import { getTenantId } from "@wunderstack/tenant";

import { readBodyBounded } from "@/lib/http";
import { verifyMcpAuth, verifyMcpHost } from "@/lib/mcp-auth";
import { mcpHandler } from "@/lib/mcp-server";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * MCP Streamable HTTP endpoint (PLAN-mcp-server). Thin controller: Host allowlist, auth (HMAC or
 * bearer, see lib/mcp-auth.ts), rate limit, then delegate to the SDK v2 `createMcpHandler`
 * (stateless). Tools live in `lib/mcp-server.ts`.
 */

export const runtime = "nodejs";

const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const KEY_RATE_LIMIT = { windowMs: 60_000, max: 60 };
/** MCP JSON-RPC bodies can be larger than a chat question (initialize + tool schemas). */
const MAX_MCP_BODY_BYTES = 64 * 1024;

async function handle(request: Request): Promise<Response> {
  const hostCheck = verifyMcpHost(request);
  if (!hostCheck.ok) {
    return Response.json({ error: hostCheck.error }, { status: hostCheck.status });
  }

  const ipLimit = checkRateLimit(clientKey(request), RATE_LIMIT);
  if (!ipLimit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const keyLimit = checkRateLimit(`mcp:${getTenantId()}`, KEY_RATE_LIMIT);
  if (!keyLimit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(keyLimit.retryAfterSeconds) } },
    );
  }

  const method = request.method.toUpperCase();
  let rawBody = "";
  let forwardRequest = request;

  if (method === "POST") {
    const body = await readBodyBounded(request, MAX_MCP_BODY_BYTES);
    if (!body.ok) {
      return Response.json({ error: body.error }, { status: body.status });
    }
    rawBody = body.raw;
    forwardRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: rawBody,
    });
  }

  const verified = verifyMcpAuth(request, rawBody);
  if (!verified.ok) {
    console.warn(`[api/mcp] auth failed: ${verified.error}`);
    return Response.json({ error: verified.error }, { status: verified.status });
  }

  return mcpHandler.fetch(forwardRequest);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}
