/**
 * Split an NDJSON buffer into complete lines, leaving the unfinished tail for the next chunk.
 * Empty lines are heartbeats (the runtime writes a bare `\n` to keep proxies from idling out) and
 * must not be parsed as events.
 */
export function splitNdjson(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

export function parseNdjsonLine(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return JSON.parse(trimmed) as unknown;
}
