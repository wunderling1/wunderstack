import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONVERSATION_GAP_MINUTES,
  groupIntoConversations,
  isThreadedChannel,
} from "./conversation-boundary";

const NOON = Date.UTC(2026, 8, 1, 12, 0, 0);

function row(
  id: string,
  minutes: number,
  sessionId = "tab-1",
  agentId = "cao",
  channel: string | null = "playground",
): {
  id: string;
  sessionId: string;
  agentId: string;
  occurredAt: Date;
  channel: string | null;
} {
  return {
    id,
    sessionId,
    agentId,
    occurredAt: new Date(NOON + minutes * 60_000),
    channel,
  };
}

test("questions in one sitting are one conversation", () => {
  const groups = groupIntoConversations([row("a", 0), row("b", 4), row("c", 25)]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]?.questions.map((question) => question.id),
    ["a", "b", "c"],
  );
  assert.equal(groups[0]?.id, "a", "the conversation is anchored on its first question");
});

test("silence longer than the threshold starts a new conversation", () => {
  // The gap is measured between consecutive questions, so both sides of the boundary are asserted
  // here: exactly 30 minutes of silence still continues, 31 does not.
  const groups = groupIntoConversations([
    row("a", 0),
    row("b", CONVERSATION_GAP_MINUTES),
    row("c", CONVERSATION_GAP_MINUTES * 2 + 1),
  ]);
  assert.deepEqual(
    groups.map((group) => group.questions.map((question) => question.id)),
    [["a", "b"], ["c"]],
  );
});

/**
 * The case that made this necessary. Measured on 1 September 2026 in `fund_oomt`: one session id
 * held 63 questions over 34 hours with a 12-hour gap in it, because the playground keeps the id in
 * sessionStorage without an expiry. Raw session ids gave 5.90 questions per "conversation"; the
 * boundary gives 2.52.
 */
test("a parked browser tab is not one long conversation", () => {
  const groups = groupIntoConversations([
    row("morning-1", 0),
    row("morning-2", 3),
    // Twelve hours later, same tab, same session id.
    row("evening-1", 12 * 60),
    row("evening-2", 12 * 60 + 2),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.questions.length),
    [2, 2],
  );
});

/**
 * Two measured sessions in `fund_oomt` carry both `cao` and `arbo`, because the playground shares
 * one sessionStorage key across agents. S22 says one visitor, one agent.
 */
test("one tab talking to two agents is two conversations", () => {
  const groups = groupIntoConversations([
    row("cao-1", 0, "tab-1", "cao"),
    row("arbo-1", 1, "tab-1", "arbo"),
    row("cao-2", 2, "tab-1", "cao"),
  ]);
  assert.equal(groups.length, 2);
  const byAgent = new Map(groups.map((group) => [group.agentId, group.questions.length]));
  assert.equal(byAgent.get("cao"), 2);
  assert.equal(byAgent.get("arbo"), 1);
});

test("separate visitors are never merged, whatever order the rows arrive in", () => {
  const groups = groupIntoConversations([
    row("b", 1, "tab-2"),
    row("a", 0, "tab-1"),
    row("c", 2, "tab-1"),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => new Set(group.questions.map((q) => q.sessionId)).size === 1));
});

test("grouping is total: every question lands in exactly one conversation", () => {
  const rows = [row("a", 0), row("b", 90), row("c", 91), row("d", 400, "tab-2")];
  const groups = groupIntoConversations(rows);
  const grouped = groups.flatMap((group) => group.questions.map((question) => question.id));
  assert.equal(grouped.length, rows.length);
  assert.equal(new Set(grouped).size, rows.length);
});

test("no rows means no conversations, not one empty one", () => {
  assert.deepEqual(groupIntoConversations([]), []);
});

test("mcp and api carry no thread id; playground, embed and pre-channel rows do", () => {
  assert.equal(isThreadedChannel("mcp"), false);
  assert.equal(isThreadedChannel("api"), false);
  assert.equal(isThreadedChannel("playground"), true);
  assert.equal(isThreadedChannel("embed"), true);
  assert.equal(isThreadedChannel(null), true);
});

test("three MCP turns with one session id are three conversations", () => {
  const groups = groupIntoConversations([
    row("mcp-1", 0, "shared-host", "cao", "mcp"),
    row("mcp-2", 1, "shared-host", "cao", "mcp"),
    row("mcp-3", 2, "shared-host", "cao", "mcp"),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => group.questions.map((question) => question.id)),
    [["mcp-1"], ["mcp-2"], ["mcp-3"]],
  );
});
