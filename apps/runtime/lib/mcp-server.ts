import { randomUUID } from "node:crypto";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { recordInteractionEvent, type InteractionOutcome } from "@wunderstack/analytics";
import { env } from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";
import { z } from "zod";

import { getAgentById, resolveAgentIdFromConfig } from "./agent.js";
import { resolveFundScope } from "./fund-scope.js";
import {
  ASK_ARBO_ERROR_MESSAGE,
  ASK_ARBO_TOOL_DESCRIPTION,
  ASK_ARBO_TOOL_NAME,
  askArboErrorResult,
  askArboInputSchema,
  askArboOutputSchema,
  askArboSuccessResult,
  toAskArboOutput,
} from "./mcp-ask-arbo.js";
import {
  ASK_CAO_TOOL_DESCRIPTION,
  ASK_CAO_TOOL_NAME,
  askCaoErrorResult,
  askCaoInputSchema,
  askCaoOutputSchema,
  askCaoSuccessResult,
  toAskCaoOutput,
} from "./mcp-ask-cao.js";
import { acquireSlot, checkDailyCap, releaseSlot } from "./rate-limit.js";

/**
 * Stateless MCP server factory for `/api/mcp` (PLAN-mcp-server). Fresh instance per request via
 * `createMcpHandler` — nothing held between calls.
 */

const MCP_AGENT_ID = "cao";
const DAILY_CAP = env.RUNTIME_DAILY_CAP ?? 0;
const WALLET_BUSY_MESSAGE =
  "Het fonds is even druk. Probeer het zo opnieuw; verzin geen antwoord uit eigen kennis.";
const WALLET_CAP_MESSAGE =
  "Het dagelijkse vragenplafond is bereikt. Probeer het morgen opnieuw; verzin geen antwoord uit eigen kennis.";

const sleepInputSchema = z.object({
  /** Seconds to sleep before returning (host-limit probe). Capped at 120. */
  seconds: z.number().min(0).max(120),
});

function beginPaidWork(): { ok: true } | { ok: false; message: string } {
  const daily = checkDailyCap(DAILY_CAP);
  if (!daily.ok) {
    return { ok: false, message: WALLET_CAP_MESSAGE };
  }
  if (!acquireSlot()) {
    return { ok: false, message: WALLET_BUSY_MESSAGE };
  }
  return { ok: true };
}

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
      const paid = beginPaidWork();
      if (!paid.ok) {
        return askCaoErrorResult(paid.message);
      }
      try {
        // Instance-scoped: never take fund from the host/LLM (PLAN-mcp-server single-tenant).
        const scope = resolveFundScope(undefined);
        if (!scope.ok) {
          return askCaoErrorResult(
            `Fonds-scope geweigerd (${scope.error}). Verzin geen CAO-antwoord; verwijs naar het fonds.`,
          );
        }

        const sessionId = randomUUID();
        const tenantId = getTenantId();
        const agentId = resolveAgentIdFromConfig(null);
        const agent = getAgentById(agentId);

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
              agentId: MCP_AGENT_ID,
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
              agentId: MCP_AGENT_ID,
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
      } finally {
        releaseSlot();
      }
    },
  );

  server.registerTool(
    ASK_ARBO_TOOL_NAME,
    {
      title: "Arbocatalogus-vraag",
      description: ASK_ARBO_TOOL_DESCRIPTION,
      inputSchema: askArboInputSchema,
      outputSchema: askArboOutputSchema,
    },
    async (args) => {
      const input = askArboInputSchema.parse(args);
      const paid = beginPaidWork();
      if (!paid.ok) {
        return askArboErrorResult(paid.message);
      }
      try {
        const scope = resolveFundScope(undefined);
        if (!scope.ok) {
          return askArboErrorResult(
            `Fonds-scope geweigerd (${scope.error}). Verzin geen antwoord; verwijs naar het fonds.`,
          );
        }
        const sessionId = randomUUID();
        const tenantId = getTenantId();
        const agentId = "arbo";
        const agent = getAgentById(agentId);
        try {
          const result = await agent.answer(
            { question: input.question, fund: scope.fund },
            { sessionId, channel: "mcp" },
          );
          const output = toAskArboOutput(result);
          const outcome: InteractionOutcome = result.needsClarification
            ? "clarified"
            : result.found
              ? "answered"
              : "refused";
          try {
            await recordInteractionEvent({
              tenantId,
              agentId,
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
          return askArboSuccessResult(output);
        } catch (error) {
          console.error("[api/mcp] ask_arbo failed:", error);
          try {
            await recordInteractionEvent({
              tenantId,
              agentId,
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
          return askArboErrorResult(ASK_ARBO_ERROR_MESSAGE);
        }
      } finally {
        releaseSlot();
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
