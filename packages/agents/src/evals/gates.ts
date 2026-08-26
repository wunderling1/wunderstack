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
 *
 * The roleplay gates are the one place where "a new capability is a case-category, not a gate" does
 * not apply, and the reason is worth stating: roleplay is not a capability of the grounded agent, it
 * is a second agent type whose failure modes have no overlap with the grounded ones. Nothing in
 * G2-retrieval or G2-answer says anything about a persona that admits it is a language model, leaks
 * the subtext in its first sentence, or hands the same transcript two different grades. They are new
 * risks, so they are new gates — but inside the existing four layers, because the layers describe
 * WHEN and against WHAT a gate runs (offline contract / fixtures + keys / real corpus), which does
 * not change per agent. See DECISION-roleplay-agent.md and GATE-ARCHITECTURE.md §"Rollenspel".
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
  | "mistral"
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
    id: "G1-roleplay-contract",
    layer: "G1",
    requires: "none",
    title: "roleplay prompt & scoring CONTRACT (change-detector, not a behavioral gate)",
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
    title: "multi-turn condensation retrieval + serve-path citation coupling (G2-retrieval case-category)",
  },
  {
    id: "G2-answer",
    layer: "G2",
    requires: "scaleway+mistral",
    title: "answer-level quality",
  },
  {
    id: "G2-roleplay-persona",
    layer: "G2",
    requires: "mistral",
    title: "roleplay persona behaviour: stays in role, withholds the hidden layer, ends on time",
  },
  {
    id: "G2-roleplay-review",
    layer: "G2",
    requires: "mistral",
    title: "roleplay review stability: same transcript, same grade",
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
