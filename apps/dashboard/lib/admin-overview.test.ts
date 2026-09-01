import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { answerRate } from "@wunderstack/analytics";
import {
  answerRateDisplay,
  fundStatusFromInstancesAndActivity,
  fundStatusLabel,
  statusFromCounts,
} from "./admin-overview.js";

const empty = { answered: 0, refused: 0, clarified: 0, error: 0, unknown: 0 };

test("error and unknown stay out of the answer-rate denominator (D7)", () => {
  const counts = { answered: 3, refused: 1, clarified: 1, error: 5, unknown: 10 };
  assert.deepEqual(answerRate(counts), { numerator: 3, denominator: 5 });
  assert.equal(answerRateDisplay(answerRate(counts), 20), "3 / 5");
  assert.notEqual(answerRateDisplay(answerRate(counts), 20), "15%");
});

test("zero volume is an em dash, not 0%", () => {
  assert.equal(answerRateDisplay(answerRate(empty), 0), "—");
  assert.equal(answerRateDisplay({ kind: "no_measurable_turns" }, 4), "geen meetbare turns");
});

test("one degraded agent makes the fund degraded (S12)", () => {
  assert.equal(
    fundStatusFromInstancesAndActivity(
      ["cao", "arbo"],
      [
        { agentId: "cao", byOutcome: { answered: 10, refused: 0, clarified: 0, error: 0, unknown: 0 } },
        { agentId: "arbo", byOutcome: { answered: 7, refused: 0, clarified: 0, error: 3, unknown: 0 } },
      ],
    ),
    "degraded",
  );
});

test("events without instances still count as live", () => {
  assert.equal(
    fundStatusFromInstancesAndActivity(
      [],
      [{ agentId: "cao", byOutcome: { answered: 5, refused: 0, clarified: 0, error: 0, unknown: 0 } }],
    ),
    "operational",
  );
});

test("configured agents with no events keep the fund offline", () => {
  assert.equal(fundStatusFromInstancesAndActivity(["cao"], []), "offline");
  assert.equal(fundStatusFromInstancesAndActivity([], []), "offline");
});

test("statusFromCounts matches deriveAgentStatus on total and errors", () => {
  assert.equal(statusFromCounts(empty), "offline");
  assert.equal(
    statusFromCounts({ answered: 8, refused: 0, clarified: 0, error: 3, unknown: 0 }),
    "degraded",
  );
});

test("fund status labels stay Dutch", () => {
  assert.equal(fundStatusLabel("offline"), "Nog niet live");
  assert.equal(fundStatusLabel("degraded"), "Beperkt");
  assert.equal(fundStatusLabel("operational"), "Actief");
});

test("admin overviews do not keep a local status or citation-rate definition", () => {
  const admin = readFileSync(new URL("../app/(admin)/admin/page.tsx", import.meta.url), "utf8");
  const funds = readFileSync(
    new URL("../app/(admin)/admin/funds/page.tsx", import.meta.url),
    "utf8",
  );
  for (const source of [admin, funds]) {
    assert.match(source, /listOutcomeActivity/);
    assert.doesNotMatch(source, /function deriveStatus/);
    assert.doesNotMatch(source, /function deriveFundStatus/);
    assert.doesNotMatch(source, /answeredWithCitations/);
    assert.doesNotMatch(source, /getAgentActivity/);
    assert.doesNotMatch(source, /getKpiSummary/);
  }
  assert.match(funds, /fundStatusFromInstancesAndActivity/);
});
