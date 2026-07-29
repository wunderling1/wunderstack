import assert from "node:assert/strict";
import { test } from "node:test";

import { isElliptical, buildFallbackRetrievalQuery, isDegenerateCondensation, retrievalQueriesForFollowUp } from "./condense.js";

const history = [
  { role: "user" as const, content: "Krijgen oudere werknemers extra vakantiedagen?" },
  { role: "assistant" as const, content: "Ja, van 55 t/m 59 jaar krijg je twee extra dagen." },
];

test("no history is never elliptical", () => {
  assert.equal(isElliptical("En hoeveel extra dagen krijg ik als ik 58 ben?", []), false);
});

test("connective-led follow-up up to 14 words is elliptical (Gate B2 etd-029/etd-030)", () => {
  // 10 words, both open with "En" — real ties to the previous turn.
  assert.equal(isElliptical("En hoeveel extra dagen krijg ik als ik 58 ben?", history), true);
  assert.equal(isElliptical("En als mijn werktijd al is verkort naar 38 uur?", history), true);
});

test("short follow-up without connective stays elliptical", () => {
  assert.equal(isElliptical("En hoeveel dan?", history), true);
  assert.equal(isElliptical("Hoeveel dan?", history), true);
});

test("boundary: a long self-contained sentence merely opening with 'En' is not elliptical", () => {
  // 16 words, opens with "En" but is a complete standalone question — beyond the connective budget.
  const long =
    "En kunnen werknemers die parttime werken ook aanspraak maken op de volledige jaarlijkse vakantietoeslag en eindejaarsuitkering?";
  assert.equal(isElliptical(long, history), false);
});

test("long follow-up with a strong standalone term and no connective is not elliptical", () => {
  assert.equal(
    isElliptical("Hoeveel vakantiedagen krijgt een fulltime werknemer per kalenderjaar precies toegewezen?", history),
    false,
  );
});

test("buildFallbackRetrievalQuery keeps the last user turn with the follow-up", () => {
  assert.equal(
    buildFallbackRetrievalQuery(history, "En hoeveel extra dagen krijg ik als ik 58 ben?"),
    "Krijgen oudere werknemers extra vakantiedagen? En hoeveel extra dagen krijg ik als ik 58 ben?",
  );
});

test("retrievalQueriesForFollowUp always includes a history-aware fallback", () => {
  const queries = retrievalQueriesForFollowUp(history, "En hoeveel extra dagen krijg ik als ik 58 ben?", "Hoeveel extra vakantiedagen bij 58 jaar?");
  assert.equal(queries.length, 2);
  assert.ok(queries.some((query) => query.includes("Krijgen oudere werknemers")));
});

test("isDegenerateCondensation flags an echo of the original question", () => {
  assert.equal(
    isDegenerateCondensation("En hoeveel extra dagen krijg ik als ik 58 ben?", "En hoeveel extra dagen krijg ik als ik 58 ben?"),
    true,
  );
  assert.equal(isDegenerateCondensation("Hoeveel extra vakantiedagen bij 58 jaar?", "En hoeveel extra dagen krijg ik als ik 58 ben?"), false);
});
