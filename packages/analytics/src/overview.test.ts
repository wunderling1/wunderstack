import assert from "node:assert/strict";
import { sql } from "@wunderstack/db";
import { test } from "node:test";

import { breakdownCountSelect, breakdownFromRow, emptyOutcomeBreakdown } from "./outcomes.js";

/**
 * `getActivitySnapshot` puts both windows in one select by prefixing two copies of
 * `breakdownCountSelect` and splitting the row back apart on those prefixes. The drizzle postgres-js
 * driver reads rows with `.values()` — positionally, not by column name — so the two copies must
 * carry the same keys in the same order, and `breakdownFromRow` must read exactly those keys.
 *
 * Without this guard, adding a column to one branch of `breakdownCountSelect` would silently shift
 * the previous window's numbers into the current window's fields. Nothing would throw.
 */
test("both windows select the same columns in the same order", () => {
  const plain = Object.keys(breakdownCountSelect());
  const scoped = Object.keys(breakdownCountSelect(sql`true`));
  assert.deepEqual(scoped, plain);
  assert.equal(plain.length, 12);
});

test("every selected column is a field breakdownFromRow reads", () => {
  const columns = Object.keys(breakdownCountSelect());
  const row = Object.fromEntries(columns.map((key, index) => [key, index + 1]));
  const breakdown = breakdownFromRow(row);

  // Each count lands where its column name says it does — no silent zero from a renamed key.
  assert.equal(breakdown.byOutcome.answered, row.answered);
  assert.equal(breakdown.byOutcome.refused, row.refused);
  assert.equal(breakdown.byOutcome.clarified, row.clarified);
  assert.equal(breakdown.byOutcome.error, row.error);
  assert.equal(breakdown.byOutcome.unknown, row.unknown);
  assert.equal(breakdown.refusedByReason.no_coverage, row.refusedNoCoverage);
  assert.equal(breakdown.refusedByReason.guard_hard_fact, row.refusedGuardHardFact);
  assert.equal(breakdown.refusedByReason.guard_citation_coupling, row.refusedGuardCitationCoupling);
  assert.equal(breakdown.refusedByReason.out_of_scope, row.refusedOutOfScope);
  assert.equal(breakdown.refusedByStrength.none, row.refusedStrengthNone);
  assert.equal(breakdown.refusedByStrength.weak, row.refusedStrengthWeak);
  assert.equal(breakdown.refusedByStrength.strong, row.refusedStrengthStrong);
});

test("an agent with no rows in the window reads as nothing measured, not as 0%", () => {
  const empty = emptyOutcomeBreakdown();
  assert.equal(empty.byOutcome.answered, 0);
  assert.equal(empty.byOutcome.error, 0);
  // A rate over an empty denominator is not zero — it is absent (D6).
  assert.deepEqual(empty.rates.answered, { kind: "no_measurable_turns" });
  assert.deepEqual(empty.rates.refusedJustified, { kind: "no_measurable_turns" });
});
