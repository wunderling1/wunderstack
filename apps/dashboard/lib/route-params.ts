import { FUND_KEY_RE } from "@wunderstack/db";
import { agentKeySchema, type AgentKey } from "@wunderstack/shared";

/** Parse a URL fundKey segment. Returns null when invalid (caller should notFound()). */
export function parseFundKey(raw: string): string | null {
  const fundKey = raw.toLowerCase();
  return FUND_KEY_RE.test(fundKey) ? fundKey : null;
}

/** Parse a URL agentKey segment. Returns null when not a known agent key. */
export function parseAgentKey(raw: string): AgentKey | null {
  const parsed = agentKeySchema.safeParse(raw.toLowerCase());
  return parsed.success ? parsed.data : null;
}
