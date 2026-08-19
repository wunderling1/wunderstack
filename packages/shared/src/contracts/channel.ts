import { z } from "zod";

/**
 * Surface that produced an agent turn. Used as a Langfuse tag and analytics dimension so portal,
 * embed, playground and MCP traffic can be separated (PLAN-mcp-server Fase 1a).
 */
export const agentChannels = ["playground", "embed", "mcp", "api"] as const;

export type AgentChannel = (typeof agentChannels)[number];

export const agentChannelSchema = z.enum(agentChannels);
