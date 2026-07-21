/**
 * Gate registry — the control-plane list of the four-layer gate model (G1 CONTRACT / G2 GEDRAG /
 * G3 PRODUCTIE / G4 RUNTIME). Canonical description: docs/eval/GATE-ARCHITECTURE.md.
 *
 * This module holds only the STATIC spec of each gate (id, layer, title, prerequisites) — no run
 * logic, no env access, no side effects. That keeps it importable from unit tests
 * (gate-registry.test.ts) without executing the eval, and gives the runner in cao.eval.ts a single
 * source of truth to attach `run` functions to. Adding a capability is a new case-category inside an
 * existing gate (e.g. `multi-turn` under G2), not a new gate — see GATE-ARCHITECTURE.md §1.
 *
 * G4 (runtime hard-fact guard) is enforced on the served path in production (cao/agent.ts), not by
 * this eval harness, so it is deliberately NOT a registry entry.
 */

/** Layer identifiers of the four-layer gate model. */
export type GateLayer = "G1" | "G2" | "G3";

/**
 * Credential/DB prerequisites a gate needs to run. A missing prerequisite becomes a FAIL on the
 * protected paths (EVAL_REQUIRE_ALL for key gates, EVAL_REQUIRE_DB for the nightly DB gates) and a
 * SKIP otherwise — resolved by the runner in cao.eval.ts.
 */
export type GateRequirement =
  | "none"
  | "scaleway"
  | "scaleway+mistral"
  | "db+scaleway"
  | "db+scaleway+mistral";

/** Static description of a gate — free of any run logic or env access. */
export interface GateSpec {
  readonly id: string;
  readonly layer: GateLayer;
  readonly title: string;
  readonly requires: GateRequirement;
  /** True when this gate expands to one report per discovered fund set (G3-fund). */
  readonly perFundSet?: boolean;
}

/**
 * The gates, in execution order. Each id is the stable identifier used in eval-report.json,
 * GATE-ARCHITECTURE.md (Bijlage A + the code↔doc id table) and commit messages. Old labels
 * (Gate A–D/B2/F, E0–E13, P1–P8) live only in that mapping table.
 */
export const GATE_SPECS = [
  {
    id: "G1-contract",
    layer: "G1",
    requires: "none",
    title: "prompt, clarify & fund-scoping CONTRACT (change-detector, not a behavioral gate)",
  },
  {
    id: "G2-retrieval",
    layer: "G2",
    requires: "scaleway",
    title: "retrieval recall + rerank",
  },
  {
    id: "G2-multi-turn",
    layer: "G2",
    requires: "scaleway+mistral",
    title: "multi-turn condensation retrieval (G2-retrieval case-category)",
  },
  {
    id: "G2-answer",
    layer: "G2",
    requires: "scaleway+mistral",
    title: "answer-level quality",
  },
  {
    id: "G3-pipeline",
    layer: "G3",
    requires: "db+scaleway",
    title: "production retrieval pipeline (nightly)",
  },
  {
    id: "G3-fund",
    layer: "G3",
    requires: "db+scaleway+mistral",
    title: "fund-specific correctness (nightly)",
    perFundSet: true,
  },
  {
    id: "G3-isolation",
    layer: "G3",
    requires: "db+scaleway",
    title: "corpus isolation (live cross-fund probe)",
  },
] as const satisfies readonly GateSpec[];

/** Union of the registered gate ids — used to type the run-function map exhaustively. */
export type GateId = (typeof GATE_SPECS)[number]["id"];
