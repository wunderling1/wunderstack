/**
 * Per-agent eval profile — the seam that keeps gate *content* agent-generic.
 *
 * A new agent = a profile entry + (optional) base golden set + fund fixtures in FUND_SET_META.
 * Do not add a third `*.eval.ts`. G2-retrieval / G2-answer run only for profiles with
 * `hasBaseGoldenSet` (today: cao). G1 prompt checks and G3-fund (via set.agentKey) cover every
 * registered agent in one process / one `eval-report.json`.
 */

import type { EvalCheck } from "./harness.js";
import type { HardFactAgentKey } from "../hard-facts.js";

import {
  NOT_IN_CATALOG_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
  ARBO_SYSTEM_INSTRUCTIONS,
} from "../arbo/prompt.js";

export interface AgentEvalProfile {
  readonly agentKey: HardFactAgentKey;
  /** When true, this agent owns the G2 base-layer retrieval/answer golden set. */
  readonly hasBaseGoldenSet: boolean;
  /**
   * Extra G1 prompt-contract checks beyond the CAO suite in cao.eval.ts.
   * CAO checks stay colocated with clarify/fixture helpers; other agents register here.
   */
  readonly extraPromptContractChecks?: () => EvalCheck[];
}

function arboPromptContractChecks(): EvalCheck[] {
  return [
    {
      name: "arbo-prompt: contains NOT_IN_CATALOG_MESSAGE verbatim",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes(NOT_IN_CATALOG_MESSAGE),
    },
    {
      name: "arbo-prompt: contains OUT_OF_SCOPE_MESSAGE verbatim",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes(OUT_OF_SCOPE_MESSAGE),
    },
    {
      name: "arbo-prompt: forbids Arbowet and CAO as sources",
      ok:
        ARBO_SYSTEM_INSTRUCTIONS.includes("NIET uit de Arbowet") &&
        ARBO_SYSTEM_INSTRUCTIONS.includes("niet uit een CAO"),
    },
    {
      name: "arbo-prompt: catalog measures with ik/je stay in scope",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes("géén individueel advies"),
    },
  ];
}

/** Registered agents. Add agent 3 here — not as a third eval entrypoint. */
export const AGENT_EVAL_PROFILES: readonly AgentEvalProfile[] = [
  { agentKey: "cao", hasBaseGoldenSet: true },
  {
    agentKey: "arbo",
    hasBaseGoldenSet: false,
    extraPromptContractChecks: arboPromptContractChecks,
  },
];

export function extraPromptContractChecks(): EvalCheck[] {
  return AGENT_EVAL_PROFILES.flatMap((profile) => profile.extraPromptContractChecks?.() ?? []);
}
