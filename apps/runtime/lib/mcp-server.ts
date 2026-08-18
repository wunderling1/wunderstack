import { randomUUID } from "node:crypto";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { recordInteractionEvent, type InteractionOutcome } from "@wunderstack/analytics";
import { env } from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";
import { z } from "zod";

import { getCaoAgent } from "./agent.js";
import { resolveFundScope } from "./fund-scope.js";
import {
  ASK_CAO_TOOL_DESCRIPTION,
  ASK_CAO_TOOL_NAME,
  askCaoErrorResult,
  askCaoInputSchema,
  askCaoOutputSchema,
  askCaoSuccessResult,
  toAskCaoOutput,
} from "./mcp-ask-cao.js";

/**
 * Stateless MCP server factory for `/api/mcp` (PLAN-mcp-server). Fresh instance per request via
 * `createMcpHandler` — nothing held between calls.
 */

const AGENT_ID = "cao";

const sleepInputSchema = z.object({
  /** Seconds to sleep before returning (host-limit probe). Capped at 120. */
  seconds: z.number().min(0).max(120),
});

function sleepStubEnabled(): boolean {
  const raw = env.MCP_ENABLE_SLEEP_STUB;
  return raw === "1" || raw === "true";
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "wunderstack-cao", version: "1.0.0" });

  server.registerTool(
    ASK_CAO_TOOL_NAME,
    {
      title: "CAO-vraag",
      description: ASK_CAO_TOOL_DESCRIPTION,
      inputSchema: askCaoInputSchema,
      outputSchema: askCaoOutputSchema,
    },
    async (args) => {
      const input = askCaoInputSchema.parse(args);
      // Instance-scoped: never take fund from the host/LLM (PLAN-mcp-server single-tenant).
      const scope = resolveFundScope(undefined);
      if (!scope.ok) {
        return askCaoErrorResult(
          `Fonds-scope geweigerd (${scope.error}). Verzin geen CAO-antwoord; verwijs naar het fonds.`,
        );
      }

      const sessionId = randomUUID();
      const tenantId = getTenantId();
      const agent = getCaoAgent();

      try {
        const result = await agent.answer(
          { question: input.question, fund: scope.fund },
          { sessionId, channel: "mcp" },
        );
        const output = toAskCaoOutput(result);

        const outcome: InteractionOutcome = result.needsClarification
          ? "clarified"
          : result.found
            ? "answered"
            : "refused";
        try {
          await recordInteractionEvent({
            tenantId,
            agentId: AGENT_ID,
            fund: scope.fund,
            sessionId,
            channel: "mcp",
            ...(result.traceId === null ? {} : { traceId: result.traceId }),
            outcome,
            citationCount: result.citations.length,
            question: input.question,
          });
        } catch (error) {
          console.error("[api/mcp] failed to record interaction event:", error);
        }

        return askCaoSuccessResult(output);
      } catch (error) {
        console.error("[api/mcp] ask_cao failed:", error);
        try {
          await recordInteractionEvent({
            tenantId,
            agentId: AGENT_ID,
            fund: scope.fund,
            sessionId,
            channel: "mcp",
            outcome: "error",
            citationCount: 0,
            question: input.question,
          });
        } catch (recordError) {
          console.error("[api/mcp] failed to record error event:", recordError);
        }
        return askCaoErrorResult();
      }
    },
  );

  if (sleepStubEnabled()) {
    server.registerTool(
      "sleep",
      {
        title: "Sleep stub",
        description:
          "Waits N seconds then returns. Used only to measure Copilot Studio / host timeouts. " +
          "Not a production tool.",
        inputSchema: sleepInputSchema,
        outputSchema: z.object({ sleptSeconds: z.number() }),
      },
      async (args) => {
        const { seconds } = sleepInputSchema.parse(args);
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        const output = { sleptSeconds: seconds };
        return {
          content: [{ type: "text" as const, text: `Slept ${String(seconds)} seconds.` }],
          structuredContent: output,
        };
      },
    );
  }

  return server;
}

/** Shared handler instance (factory is per-request; the handler itself is process-scoped). */
export const mcpHandler = createMcpHandler(buildServer);
