import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatEvent } from "../app/api/chat/contract";
import {
  CHAT_GENERIC_ERROR_MESSAGE,
  CHAT_TIMEOUT_MESSAGE,
  createChatWorkSignal,
  isFinalChatEvent,
  isTerminalChatEvent,
  pipeChatNdjsonStream,
} from "./chat-stream.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeEvent(event: ChatEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function parseLines(chunks: Uint8Array[]): ChatEvent[] {
  const raw = chunks.map((chunk) => decoder.decode(chunk)).join("");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChatEvent);
}

async function* ofEvents(events: ChatEvent[]): AsyncGenerator<ChatEvent> {
  for (const event of events) {
    yield event;
  }
}

async function* hangUntilAbort(signal: AbortSignal): AsyncGenerator<ChatEvent> {
  yield { type: "status", phase: "generating" };
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}

describe("isTerminalChatEvent", () => {
  it("treats citations, done, and error as terminal", () => {
    assert.equal(isTerminalChatEvent("citations"), true);
    assert.equal(isTerminalChatEvent("done"), true);
    assert.equal(isTerminalChatEvent("error"), true);
    assert.equal(isTerminalChatEvent("status"), false);
    assert.equal(isTerminalChatEvent("text"), false);
    assert.equal(isTerminalChatEvent("followups"), false);
  });
});

describe("isFinalChatEvent", () => {
  it("treats only done and error as final (heartbeats stop after these)", () => {
    assert.equal(isFinalChatEvent("done"), true);
    assert.equal(isFinalChatEvent("error"), true);
    assert.equal(isFinalChatEvent("citations"), false);
    assert.equal(isFinalChatEvent("followups"), false);
    assert.equal(isFinalChatEvent("status"), false);
  });
});

describe("pipeChatNdjsonStream", () => {
  it("forwards a normal answer as citations + done without injecting an error", async () => {
    const chunks: Uint8Array[] = [];
    const events: ChatEvent[] = [
      { type: "status", phase: "searching" },
      { type: "status", phase: "generating" },
      {
        type: "citations",
        found: true,
        needsClarification: false,
        citations: [],
        citationVerificationFailed: false,
        answer: "Antwoord.",
      },
      {
        type: "done",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        traceId: "trace-1",
      },
    ];

    const result = await pipeChatNdjsonStream({
      events: ofEvents(events),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => false,
      isTurnTimedOut: () => false,
      workSignal: new AbortController().signal,
      heartbeatMs: 60_000,
    });

    assert.equal(result.sentTerminal, true);
    assert.equal(result.sawError, false);
    assert.deepEqual(parseLines(chunks), events);
  });

  it("emits a timeout error when the turn budget fires and the client is still connected", async () => {
    const chunks: Uint8Array[] = [];
    const client = new AbortController();
    const cancel = new AbortController();
    const { workSignal, turnDeadline } = createChatWorkSignal({
      clientSignal: client.signal,
      cancelSignal: cancel.signal,
      turnBudgetMs: 30,
    });

    const result = await pipeChatNdjsonStream({
      events: hangUntilAbort(workSignal),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => client.signal.aborted,
      isTurnTimedOut: () => turnDeadline.aborted,
      workSignal,
      heartbeatMs: 60_000,
    });

    assert.equal(result.sentTerminal, true);
    assert.equal(result.sawError, true);
    assert.equal(turnDeadline.aborted, true);
    assert.equal(client.signal.aborted, false);

    const lines = parseLines(chunks);
    assert.equal(lines[0]?.type, "status");
    const terminal = lines.at(-1);
    assert.deepEqual(terminal, { type: "error", message: CHAT_TIMEOUT_MESSAGE });
  });

  it("emits a generic error on unexpected failure while the client is connected", async () => {
    const chunks: Uint8Array[] = [];

    async function* boom(): AsyncGenerator<ChatEvent> {
      yield { type: "status", phase: "generating" };
      throw new Error("provider exploded");
    }

    const result = await pipeChatNdjsonStream({
      events: boom(),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => false,
      isTurnTimedOut: () => false,
      workSignal: new AbortController().signal,
      heartbeatMs: 60_000,
    });

    assert.equal(result.sentTerminal, true);
    assert.equal(result.sawError, true);
    const terminal = parseLines(chunks).at(-1);
    assert.deepEqual(terminal, { type: "error", message: CHAT_GENERIC_ERROR_MESSAGE });
  });

  it("emits a timeout error when the stream ends silently without a terminal event", async () => {
    const chunks: Uint8Array[] = [];

    const result = await pipeChatNdjsonStream({
      events: ofEvents([{ type: "status", phase: "generating" }]),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => false,
      isTurnTimedOut: () => false,
      workSignal: new AbortController().signal,
      heartbeatMs: 60_000,
    });

    assert.equal(result.sentTerminal, true);
    assert.equal(result.sawError, true);
    const terminal = parseLines(chunks).at(-1);
    assert.deepEqual(terminal, { type: "error", message: CHAT_TIMEOUT_MESSAGE });
  });

  it("does not emit after the client has disconnected", async () => {
    const chunks: Uint8Array[] = [];
    const client = new AbortController();

    async function* disconnectMidway(): AsyncGenerator<ChatEvent> {
      yield { type: "status", phase: "generating" };
      client.abort();
      throw new DOMException("Aborted", "AbortError");
    }

    const result = await pipeChatNdjsonStream({
      events: disconnectMidway(),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => client.signal.aborted,
      isTurnTimedOut: () => false,
      workSignal: client.signal,
      heartbeatMs: 60_000,
    });

    assert.equal(result.sentTerminal, false);
    assert.equal(result.sawError, false);
    assert.deepEqual(parseLines(chunks), [{ type: "status", phase: "generating" }]);
  });

  it("emits empty heartbeat lines while waiting", async () => {
    const chunks: Uint8Array[] = [];
    const gate = new AbortController();

    async function* slow(): AsyncGenerator<ChatEvent> {
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      yield {
        type: "citations",
        found: true,
        needsClarification: false,
        citations: [],
        citationVerificationFailed: false,
        answer: "ok",
      };
      yield {
        type: "done",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        traceId: null,
      };
      gate.abort();
    }

    const result = await pipeChatNdjsonStream({
      events: slow(),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => false,
      isTurnTimedOut: () => false,
      workSignal: new AbortController().signal,
      heartbeatMs: 20,
    });

    assert.equal(result.sawError, false);
    const hasHeartbeat = chunks.some((chunk) => decoder.decode(chunk) === "\n");
    assert.equal(hasHeartbeat, true);
  });

  it("keeps heartbeats after citations while waiting for followups and done", async () => {
    const chunks: Uint8Array[] = [];

    async function* citationsThenFollowUps(): AsyncGenerator<ChatEvent> {
      yield {
        type: "citations",
        found: true,
        needsClarification: false,
        citations: [],
        citationVerificationFailed: false,
        answer: "Antwoord.",
      };
      // Simulate the silent follow-up model call between citations and done.
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      yield { type: "followups", questions: ["Vervolgvraag?"] };
      yield {
        type: "done",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        traceId: "trace-1",
      };
    }

    const result = await pipeChatNdjsonStream({
      events: citationsThenFollowUps(),
      enqueue: (chunk) => chunks.push(chunk),
      encodeEvent,
      isClientDisconnected: () => false,
      isTurnTimedOut: () => false,
      workSignal: new AbortController().signal,
      heartbeatMs: 20,
    });

    assert.equal(result.sentTerminal, true);
    assert.equal(result.sawError, false);
    const hasHeartbeat = chunks.some((chunk) => decoder.decode(chunk) === "\n");
    assert.equal(hasHeartbeat, true);
    const events = parseLines(chunks);
    assert.equal(events.some((event) => event.type === "followups"), true);
    assert.equal(events.at(-1)?.type, "done");
  });
});
