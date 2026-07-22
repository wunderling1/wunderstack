import { createCaoAgent, type CaoAgent } from "@wunderstack/agents";

/**
 * Lazily build the CAO-agent once per server process and reuse it across requests. Building it wires
 * up Mastra + Langfuse, so we do not want that per request.
 *
 * Server-only by construction: only the route handlers import this, and the agent touches the DB +
 * provider keys — never import it from a client component.
 */
let cached: CaoAgent | undefined;

export function getCaoAgent(): CaoAgent {
  cached ??= createCaoAgent();
  return cached;
}
