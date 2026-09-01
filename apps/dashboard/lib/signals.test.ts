import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { conversationPermalink } from "./conversations.js";
import { parseSignalsFilters, signalsFilterExtras } from "./signals.js";

test("filters live in the URL: parse + extras round-trip", () => {
  const filters = parseSignalsFilters({ period: "7d", agent: "cao" }, ["cao", "roleplay"]);
  assert.deepEqual(filters, { period: "7d", agentId: "cao" });
  assert.deepEqual(signalsFilterExtras(filters), { agent: "cao" });
});

test("unknown agent is dropped, period defaults to 30d", () => {
  const filters = parseSignalsFilters({ agent: "nope", period: "nope" }, ["cao"]);
  assert.equal(filters.agentId, undefined);
  assert.equal(filters.period, "30d");
});

test("each signal row permalinks to the conversation, independent of list filters", () => {
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.equal(conversationPermalink("/conversations", id), `/conversations/${id}#v-${id}`);
  assert.equal(
    conversationPermalink("/admin/funds/oomt/conversations", id),
    `/admin/funds/oomt/conversations/${id}#v-${id}`,
  );
  assert.equal(conversationPermalink("/conversations", id).includes("period"), false);
  assert.equal(conversationPermalink("/conversations", id).includes("agent"), false);
});

test("Signalen UI has no generated labels and every question row links through", () => {
  const view = readFileSync(new URL("../components/fund/signals.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /openai|summariz|cluster|generateTheme|themeLabel/i);
  assert.match(view, /conversationPermalink\(conversationsPath, row\.latestEventId\)/);
  assert.match(view, /latestAbandonedId \?\? row\.latestSessionId/);
  assert.match(view, /row\.question/);
  assert.match(view, /showSuspicious/);
});

test("fund Signalen does not load suspicious refusals; admin does", () => {
  const fund = readFileSync(
    new URL("../app/(fund)/signals/page.tsx", import.meta.url),
    "utf8",
  );
  const admin = readFileSync(
    new URL(
      "../app/(admin)/admin/funds/[fundKey]/(fund-console)/signals/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(fund, /includeSuspicious: false/);
  assert.match(fund, /showSuspicious=\{false\}/);
  assert.match(admin, /includeSuspicious: true/);
  assert.match(admin, /showSuspicious/);
});

test("load path puts the threshold in analytics, not in the dashboard UI", () => {
  const load = readFileSync(new URL("./signals-load.ts", import.meta.url), "utf8");
  const view = readFileSync(new URL("../components/fund/signals.tsx", import.meta.url), "utf8");
  assert.match(load, /listSignals\(/);
  assert.doesNotMatch(load, /occurrenceCount\s*>=/);
  assert.doesNotMatch(view, /occurrenceCount\s*>=/);
  assert.match(view, /SIGNAL_MIN_OCCURRENCES/);
});
