import assert from "node:assert/strict";
import { test } from "node:test";

import { isElliptical } from "./condense.js";

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
