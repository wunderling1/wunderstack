/**
 * Consistency guard: the gate registry (gates.ts) and the canonical document
 * (docs/eval/GATE-ARCHITECTURE.md) must not drift apart. Runs offline on `test:unit` (no keys), so
 * it fires on every PR — a renamed/added/removed gate that is not documented (or vice versa) fails
 * loudly here instead of leaving the doc silently stale.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { GATE_SPECS } from "./gates.js";

const here = dirname(fileURLToPath(import.meta.url));
// packages/agents/src/evals -> repo root -> docs/eval/GATE-ARCHITECTURE.md
const docPath = join(here, "..", "..", "..", "..", "docs", "eval", "GATE-ARCHITECTURE.md");
const doc = readFileSync(docPath, "utf8");

/**
 * The single pinned set of registered gate ids. Changing the registry without updating this list (or
 * the doc) fails the test — the drift the four-layer restructure exists to prevent.
 */
const EXPECTED_IDS = [
  "G1-contract",
  "G2-retrieval",
  "G2-multi-turn",
  "G2-answer",
  "G3-pipeline",
  "G3-fund",
  "G3-isolation",
] as const;

test("registry ids match the pinned set", () => {
  assert.deepEqual(
    GATE_SPECS.map((spec) => spec.id),
    [...EXPECTED_IDS],
    "GATE_SPECS drifted from the pinned id list — update EXPECTED_IDS and GATE-ARCHITECTURE.md deliberately.",
  );
});

test("every registered gate id is documented in GATE-ARCHITECTURE.md", () => {
  for (const spec of GATE_SPECS) {
    assert.ok(
      doc.includes(spec.id),
      `gate id "${spec.id}" is not mentioned in docs/eval/GATE-ARCHITECTURE.md`,
    );
  }
});

test("the doc's code<->doc id table lists exactly the registered gates (plus G4 runtime)", () => {
  // Ids appearing as `code spans` in the doc, restricted to G-identifiers of the gate namespace.
  const documentedIds = new Set(
    [...doc.matchAll(/`(G[1-4]-[a-z-]+)`/g)].map((match) => match[1] as string),
  );
  for (const id of documentedIds) {
    assert.ok(
      (EXPECTED_IDS as readonly string[]).includes(id),
      `doc mentions gate id "${id}" that is not in the registry (stale doc or missing gate)`,
    );
  }
});

test("every gate declares a known layer", () => {
  for (const spec of GATE_SPECS) {
    assert.ok(["G1", "G2", "G3"].includes(spec.layer), `gate "${spec.id}" has unknown layer "${spec.layer}"`);
  }
});
