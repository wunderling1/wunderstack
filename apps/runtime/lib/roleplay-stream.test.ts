import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROLEPLAY_TIMEOUT_MS } from "@wunderstack/agents";
import type { RoleplayEvent } from "@wunderstack/shared";

import { createTurnWorkSignal } from "./ndjson-stream.js";
import {
  DEFAULT_ROLEPLAY_TURN_BUDGET_MS,
  isFinalRoleplayEvent,
  isTerminalRoleplayEvent,
  ROLEPLAY_TIMEOUT_MESSAGE,
  pipeRoleplayNdjsonStream,
} from "./roleplay-stream.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeEvent(event: RoleplayEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function parseLines(chunks: Uint8Array[]): RoleplayEvent[] {
  return chunks
    .map((chunk) => decoder.decode(chunk))
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RoleplayEvent);
}

async function* ofEvents(events: RoleplayEvent[]): AsyncGenerator<RoleplayEvent> {
  for (const event of events) {
    yield event;
  }
}

async function collect(events: AsyncIterable<RoleplayEvent>): Promise<{
  lines: RoleplayEvent[];
  sawError: boolean;
}> {
  const chunks: Uint8Array[] = [];
  const { sawError } = await pipeRoleplayNdjsonStream({
    events,
    enqueue: (chunk) => chunks.push(chunk),
    encodeEvent,
    isClientDisconnected: () => false,
    isTurnTimedOut: () => false,
    workSignal: new AbortController().signal,
    heartbeatMs: 60_000,
  });
  return { lines: parseLines(chunks), sawError };
}

describe("roleplay terminal rules", () => {
  it("treats turn as terminal — that is where the client learns what the turn was", () => {
    assert.equal(isTerminalRoleplayEvent("turn"), true);
    assert.equal(isTerminalRoleplayEvent("done"), true);
    assert.equal(isTerminalRoleplayEvent("error"), true);
    assert.equal(isTerminalRoleplayEvent("status"), false);
    assert.equal(isTerminalRoleplayEvent("text"), false);
  });

  it("keeps heartbeats alive past the turn event, until done or error", () => {
    assert.equal(isFinalRoleplayEvent("turn"), false);
    assert.equal(isFinalRoleplayEvent("done"), true);
    assert.equal(isFinalRoleplayEvent("error"), true);
  });
});

describe("DEFAULT_ROLEPLAY_TURN_BUDGET_MS", () => {
  it("outlives the agent's own model timeout so the specific error wins the race", () => {
    assert.ok(DEFAULT_ROLEPLAY_TURN_BUDGET_MS > ROLEPLAY_TIMEOUT_MS.turn);
  });
});

describe("pipeRoleplayNdjsonStream", () => {
  it("passes a complete turn through untouched", async () => {
    const { lines, sawError } = await collect(
      ofEvents([
        { type: "status", phase: "generating" },
        { type: "text", delta: "Hallo." },
        {
          type: "turn",
          reply: "Hallo.",
          conversationEnd: false,
          turnsUsed: 1,
          maxTurns: 12,
          endReason: null,
        },
        { type: "done", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, traceId: null },
      ]),
    );
    assert.equal(sawError, false);
    assert.deepEqual(lines.map((line) => line.type), ["status", "text", "turn", "done"]);
  });

  it("never closes a connected stream without a terminal event", async () => {
    // A generator that stops after `status` — the failure mode this whole module exists to prevent.
    const { lines, sawError } = await collect(ofEvents([{ type: "status", phase: "generating" }]));
    assert.equal(sawError, true);
    const last = lines.at(-1);
    assert.equal(last?.type, "error");
    assert.equal(last?.type === "error" && last.message, ROLEPLAY_TIMEOUT_MESSAGE);
  });

  it("reports a roleplay error, not a chat one, when generation throws", async () => {
    async function* boom(): AsyncGenerator<RoleplayEvent> {
      yield { type: "status", phase: "generating" };
      throw new Error("model unavailable");
    }
    const { lines } = await collect(boom());
    const last = lines.at(-1);
    assert.equal(last?.type, "error");
    assert.match(last?.type === "error" ? last.message : "", /gesprek/);
  });

  it("emits nothing once the client has disconnected", async () => {
    const chunks: Uint8Array[] = [];
    await pipeRoleplayNdjsonStream({
      events: ofEvents([{ type: "status", phase: "generating" }]),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => true,
      isTurnTimedOut: () => false,
      workSignal: new AbortController().signal,
      heartbeatMs: 60_000,
    });
    assert.equal(chunks.length, 0);
  });

  it("still reports a timeout to a connected client when the turn budget expires", async () => {
    const cancel = new AbortController();
    const { workSignal, turnDeadline } = createTurnWorkSignal({
      clientSignal: new AbortController().signal,
      cancelSignal: cancel.signal,
      turnBudgetMs: 5,
    });
    async function* hang(): AsyncGenerator<RoleplayEvent> {
      yield { type: "status", phase: "generating" };
      await new Promise<void>((_, reject) => {
        workSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }
    const chunks: Uint8Array[] = [];
    const { sawError } = await pipeRoleplayNdjsonStream({
      events: hang(),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => false,
      isTurnTimedOut: () => turnDeadline.aborted,
      workSignal,
      heartbeatMs: 60_000,
    });
    assert.equal(sawError, true);
    const last = parseLines(chunks).at(-1);
    assert.equal(last?.type === "error" && last.message, ROLEPLAY_TIMEOUT_MESSAGE);
  });
});
