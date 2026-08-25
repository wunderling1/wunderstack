/**
 * Per-agent eval profile — the seam that keeps gate *content* agent-generic.
 *
 * A new agent = an {@link AGENT_PROFILES} entry + an eval profile here + (optional) base golden set
 * + fund fixtures in FUND_SET_META. Do not add a third `*.eval.ts`. G2-retrieval stays on the CAO
 * base fixtures; G2-answer expands per profile with `hasBaseGoldenSet` (cao + arbo). G1 prompt
 * checks and G3-fund (via set.agentKey) cover every registered agent in one process /
 * one `eval-report.json`.
 *
 * `Record<AgentKey, …>` makes this exhaustive: registering an agent without an eval profile is a
 * type error (same compiler trick as `Record<GateId, …>` in gates.ts).
 */

import type { EvalCheck } from "./harness.js";
import type { AgentKey } from "../runtime/registry.js";
import type { HardFactAgentKey } from "../hard-facts.js";
import type { GoldenCase, GoldenPassage } from "./golden-set.js";
import {
  ARBO_G2_CORPUS_VERSION,
  arboGoldenCases,
  arboGoldenPassages,
  arboPassagesForCase,
  goldenCases,
  goldenPassages,
  passagesForCase,
} from "./golden-set.js";

import {
  NOT_FOUND_MESSAGE,
  CAO_SYSTEM_INSTRUCTIONS,
  buildAnswerPrompt as buildCaoAnswerPrompt,
} from "../cao/prompt.js";
import {
  NOT_IN_CATALOG_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
  ARBO_REFUSAL_MESSAGES,
  ARBO_SYSTEM_INSTRUCTIONS,
  ARBO_WERKGEBIED_MESSAGE,
  buildAnswerPrompt as buildArboAnswerPrompt,
} from "../arbo/prompt.js";

export interface AgentEvalProfile {
  readonly agentKey: HardFactAgentKey;
  /** When true, this agent participates in G2-answer (own golden cases + passages). */
  readonly hasBaseGoldenSet: boolean;
  readonly systemInstructions: string;
  readonly buildAnswerPrompt: (context: string, question: string) => string;
  /** Catalog-miss sentence coached by repair; also the primary refusal template. */
  readonly notFoundMessage: string;
  /** All refusal sentences that count as a calibrated refuse for this agent. */
  readonly refusalMessages: readonly string[];
  /** Default minScore for this agent's question schema (diagnostics / report). */
  readonly defaultMinScore: number;
  readonly goldenCases: readonly GoldenCase[];
  readonly goldenPassages: readonly GoldenPassage[];
  readonly passagesForCase: (testCase: GoldenCase) => GoldenPassage[];
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
    {
      name: "arbo-prompt: werkgebied (art. 3a) present verbatim",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes(ARBO_WERKGEBIED_MESSAGE),
    },
    {
      name: "arbo-prompt: tie-break twijfel (a)/(c) → (c)",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes("twijfel tussen (a) en (c) → kies (c)"),
    },
    {
      name: "arbo-prompt: volledigheid exception on 'houd het compact'",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes('houd het compact'),
    },
    {
      name: "arbo-prompt: forbids 'voldoe je aan de wet'",
      ok: ARBO_SYSTEM_INSTRUCTIONS.includes("voldoe je aan de wet"),
    },
  ];
}

/** Registered agents. Add agent 3 here — not as a third eval entrypoint. */
export const AGENT_EVAL_PROFILES: Record<AgentKey, AgentEvalProfile> = {
  cao: {
    agentKey: "cao",
    hasBaseGoldenSet: true,
    systemInstructions: CAO_SYSTEM_INSTRUCTIONS,
    buildAnswerPrompt: buildCaoAnswerPrompt,
    notFoundMessage: NOT_FOUND_MESSAGE,
    refusalMessages: [NOT_FOUND_MESSAGE],
    defaultMinScore: 0.48,
    goldenCases,
    goldenPassages: goldenPassages,
    passagesForCase,
  },
  arbo: {
    agentKey: "arbo",
    hasBaseGoldenSet: true,
    systemInstructions: ARBO_SYSTEM_INSTRUCTIONS,
    buildAnswerPrompt: buildArboAnswerPrompt,
    notFoundMessage: NOT_IN_CATALOG_MESSAGE,
    refusalMessages: ARBO_REFUSAL_MESSAGES,
    defaultMinScore: 0.35,
    goldenCases: arboGoldenCases,
    goldenPassages: arboGoldenPassages,
    passagesForCase: arboPassagesForCase,
    extraPromptContractChecks: arboPromptContractChecks,
  },
};

export function extraPromptContractChecks(): EvalCheck[] {
  return Object.values(AGENT_EVAL_PROFILES).flatMap(
    (profile) => profile.extraPromptContractChecks?.() ?? [],
  );
}

export function answerGateProfiles(): AgentEvalProfile[] {
  return Object.values(AGENT_EVAL_PROFILES).filter((profile) => profile.hasBaseGoldenSet);
}

/** Corpus label for report suffixes (arbo G2 fixtures pin their own version). */
export function answerGateCorpusLabel(profile: AgentEvalProfile): string {
  if (profile.agentKey === "arbo") {
    return ARBO_G2_CORPUS_VERSION;
  }
  return "base";
}
