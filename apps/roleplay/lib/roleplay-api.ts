import {
  roleplayEventSchema,
  roleplayReviewResponseSchema,
  roleplayStartResponseSchema,
  type RoleplayDifficulty,
  type RoleplayEndReason,
  type RoleplayEvent,
  type RoleplayReviewResponse,
  type RoleplayStartResponse,
} from "@wunderstack/shared/browser";

import { readErrorCode, roleplayErrorMessage } from "./errors";
import { parseNdjsonLine, splitNdjson } from "./ndjson";
import { runtimeApiHeaders } from "./runtime-api";

export class RoleplayApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(roleplayErrorMessage(code));
    this.name = "RoleplayApiError";
    this.code = code;
    this.status = status;
  }
}

async function reject(response: Response): Promise<never> {
  throw new RoleplayApiError(await readErrorCode(response), response.status);
}

export async function startRoleplaySession(args: {
  scenarioSlug: string;
  difficulty?: RoleplayDifficulty;
  signal?: AbortSignal;
}): Promise<RoleplayStartResponse> {
  const response = await fetch("/api/roleplay/start", {
    method: "POST",
    headers: runtimeApiHeaders(),
    body: JSON.stringify({
      scenarioSlug: args.scenarioSlug,
      ...(args.difficulty === undefined ? {} : { difficulty: args.difficulty }),
    }),
    signal: args.signal,
  });
  if (!response.ok) {
    return reject(response);
  }
  return roleplayStartResponseSchema.parse(await response.json());
}

export async function requestRoleplayReview(args: {
  sessionId: string;
  endReason?: RoleplayEndReason;
  signal?: AbortSignal;
}): Promise<RoleplayReviewResponse> {
  const response = await fetch("/api/roleplay/review", {
    method: "POST",
    headers: runtimeApiHeaders(),
    body: JSON.stringify({
      sessionId: args.sessionId,
      ...(args.endReason === undefined ? {} : { endReason: args.endReason }),
    }),
    signal: args.signal,
  });
  if (!response.ok && response.status !== 202) {
    return reject(response);
  }
  return roleplayReviewResponseSchema.parse(await response.json());
}

export async function pollRoleplayReview(args: {
  sessionId: string;
  signal?: AbortSignal;
}): Promise<RoleplayReviewResponse> {
  const url = `/api/roleplay/review?sessionId=${encodeURIComponent(args.sessionId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: runtimeApiHeaders(),
    signal: args.signal,
  });
  if (!response.ok) {
    return reject(response);
  }
  return roleplayReviewResponseSchema.parse(await response.json());
}

/**
 * POST a turn and yield validated NDJSON events. Heartbeats (empty lines) are skipped. The fetch
 * itself stays here so the hook does not reimplement the stream split.
 */
export async function* streamRoleplayTurn(args: {
  sessionId: string;
  message: string;
  signal?: AbortSignal;
  onByte?: () => void;
}): AsyncGenerator<RoleplayEvent> {
  const response = await fetch("/api/roleplay/turn", {
    method: "POST",
    headers: runtimeApiHeaders(),
    body: JSON.stringify({ sessionId: args.sessionId, message: args.message }),
    signal: args.signal,
  });
  if (!response.ok) {
    return reject(response);
  }
  if (!response.body) {
    throw new RoleplayApiError("turn_failed", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    args.onByte?.();
    buffer += decoder.decode(value, { stream: true });
    const { lines, rest } = splitNdjson(buffer);
    buffer = rest;
    for (const line of lines) {
      const event = parseTurnEvent(line);
      if (event) {
        yield event;
      }
    }
  }
  if (buffer.length > 0) {
    const event = parseTurnEvent(buffer);
    if (event) {
      yield event;
    }
  }
}

function parseTurnEvent(line: string): RoleplayEvent | null {
  let raw: unknown;
  try {
    raw = parseNdjsonLine(line);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  const parsed = roleplayEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
