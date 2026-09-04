import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  conversationFilterExtras,
  conversationListHref,
  conversationPermalink,
  exerciseStatusLabel,
  parseConversationFilters,
  parseConversationId,
} from "./conversations";

test("filters live in the URL: parse + href round-trip", () => {
  const filters = parseConversationFilters(
    { period: "7d", agent: "cao", outcome: "refused", reason: "no_coverage" },
    ["cao", "arbo", "roleplay"],
  );
  assert.deepEqual(filters, {
    period: "7d",
    agentId: "cao",
    outcome: "refused",
    reason: "no_coverage",
  });
  assert.equal(
    conversationListHref("/conversations", filters),
    "/conversations?period=7d&agent=cao&outcome=refused&reason=no_coverage",
  );
});

test("reason without outcome implies refused so the breakdown comparison applies", () => {
  const filters = parseConversationFilters({ reason: "no_coverage" }, ["cao"]);
  assert.equal(filters.outcome, "refused");
  assert.equal(filters.reason, "no_coverage");
  assert.equal(filters.period, "30d");
});

test("unknown agent or outcome is dropped, not stored as client state", () => {
  const filters = parseConversationFilters(
    { agent: "nope", outcome: "maybe", reason: "other" },
    ["cao"],
  );
  assert.equal(filters.agentId, undefined);
  assert.equal(filters.outcome, undefined);
  assert.equal(filters.reason, undefined);
});

test("permalink is id-only and survives another session's filters", () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.equal(conversationPermalink("/conversations", id), `/conversations/${id}#v-${id}`);
  assert.equal(
    conversationPermalink("/admin/funds/oomt/conversations/", id),
    `/admin/funds/oomt/conversations/${id}#v-${id}`,
  );
  const extras = conversationFilterExtras({
    period: "7d",
    agentId: "cao",
    outcome: "refused",
    reason: "no_coverage",
  });
  assert.equal(extras.agent, "cao");
  assert.equal(conversationPermalink("/conversations", id).includes("period"), false);
  assert.equal(conversationPermalink("/conversations", id).includes("agent"), false);
});

test("parseConversationId accepts a shareable uuid and rejects junk", () => {
  assert.equal(
    parseConversationId("AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"),
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  );
  assert.equal(parseConversationId("not-an-id"), null);
  assert.equal(parseConversationId("gesprekken"), null);
});

test("exercise status copy is completed/abandoned, not a Q&A outcome", () => {
  assert.equal(exerciseStatusLabel("ended", "completed"), "Afgerond");
  assert.equal(exerciseStatusLabel("ended", "abandoned"), "Afgebroken");
  assert.equal(exerciseStatusLabel("active", null), "Bezig");
});

test("conversation cards switch on profile kind, never on agent key", () => {
  const files = [
    "../components/fund/conversation-cards.tsx",
    "../components/fund/conversations.tsx",
    "../components/fund/conversation-filters.tsx",
    "../components/fund/conversation-detail.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /===\s*["']roleplay["']/, file);
    assert.doesNotMatch(source, /agentKey\s*===/, file);
    assert.doesNotMatch(source, /agentId\s*===\s*["']roleplay["']/, file);
  }
  const cards = readFileSync(
    new URL("../components/fund/conversation-cards.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cards, /item\.kind === "exercise"/);
});
