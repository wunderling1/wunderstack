/**
 * Arbocatalogus-agent eval entry — G1 prompt contract + shared corpus-isolation gates.
 * Fund-layer G3 runs via cao.eval.ts once the arbo corpus is ingested (golden-set.arbo.oomt.jsonl).
 */
import { closeDb } from "@wunderstack/rag";
import { env } from "@wunderstack/shared";

import {
  NOT_IN_CATALOG_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
  ARBO_SYSTEM_INSTRUCTIONS,
} from "../arbo/prompt.js";
import { corpusIsolationContractChecks, corpusIsolationLiveChecks } from "./corpus-isolation.js";
import { GATE_SPECS } from "./gates.js";
import { createEvalHarness, runEvalChecks } from "./harness.js";

const REQUIRE_ALL = env.EVAL_REQUIRE_ALL === "1" || env.EVAL_REQUIRE_ALL === "true";
const REQUIRE_DB = env.EVAL_REQUIRE_DB === "1" || env.EVAL_REQUIRE_DB === "true";

const { pushGate, pushUnavailable, credentialsAvailable, requirementLabel } = createEvalHarness({
  requireAll: REQUIRE_ALL,
  requireDb: REQUIRE_DB,
});

function promptContractChecks() {
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

async function main(): Promise<void> {
  let allPassed = true;

  const g1Spec = GATE_SPECS.find((spec) => spec.id === "G1-contract");
  if (g1Spec) {
    allPassed =
      pushGate(g1Spec, [...promptContractChecks(), ...corpusIsolationContractChecks()]) && allPassed;
  } else {
    allPassed = runEvalChecks([...promptContractChecks(), ...corpusIsolationContractChecks()]) && allPassed;
  }

  const isolationSpec = GATE_SPECS.find((spec) => spec.id === "G3-isolation");
  if (isolationSpec) {
    if (!credentialsAvailable(isolationSpec.requires)) {
      allPassed = pushUnavailable(isolationSpec, requirementLabel(isolationSpec.requires)) && allPassed;
    } else {
      allPassed = pushGate(isolationSpec, await corpusIsolationLiveChecks()) && allPassed;
    }
  } else {
    throw new Error("GATE_SPECS is missing G3-isolation");
  }

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
