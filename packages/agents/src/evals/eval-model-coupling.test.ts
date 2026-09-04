import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_LLM_MODEL } from "@wunderstack/ai";

import { JUDGE_MODEL } from "./judge";

/**
 * Eval/production coupling INVARIANT (see docs/eval/GATE-ARCHITECTURE.md).
 *
 * Gate C only means something if it scores the SAME model production ships. The eval must therefore
 * derive its generator from `DEFAULT_LLM_MODEL`, diverging ONLY via an explicit `EVAL_GENERATION_MODEL`
 * override. This is an invariant, not a convention: commit c763ea0 silently hardcoded the generator to
 * a cheaper model (`const EVAL_LLM_MODEL = "mistral-small-2603"`), decoupling the quality bar from what
 * users get, and no test caught it. This offline unit test is that missing net — it runs on the fast
 * `test:unit` path (no API keys) so it fires on every PR, even when Gate C itself skips.
 *
 * P4 (judge ≠ generator) was retired 2026-08-22: JUDGE_MODEL must equal DEFAULT_LLM_MODEL. A silent
 * re-split (e.g. pinning Small as judge) would revive a false claim in docs without updating the
 * decision — this test is that net.
 */

const evalSourcePath = fileURLToPath(new URL("./cao.eval.ts", import.meta.url));
const evalSource = readFileSync(evalSourcePath, "utf8");

/** Extract the right-hand side of `const EVAL_LLM_MODEL = <rhs>;` from the eval source. */
function evalGeneratorAssignment(): string {
  const rhs = evalSource.match(/const\s+EVAL_LLM_MODEL\s*=\s*([^;]+);/)?.[1];
  assert.ok(rhs, "cao.eval.ts must declare `const EVAL_LLM_MODEL = ...;`");
  return rhs.replace(/\s+/g, " ").trim();
}

describe("eval/production model coupling (invariant)", () => {
  it("derives EVAL_LLM_MODEL from DEFAULT_LLM_MODEL, overridable only by EVAL_GENERATION_MODEL", () => {
    assert.equal(
      evalGeneratorAssignment(),
      "env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL",
      "Gate C must score the production generator (DEFAULT_LLM_MODEL). Diverge only via an explicit " +
        "EVAL_GENERATION_MODEL override — never by hardcoding a model. See docs/eval/GATE-ARCHITECTURE.md.",
    );
  });

  it("never hardcodes a model literal for the eval generator", () => {
    const rhs = evalGeneratorAssignment();
    assert.ok(
      !/["'`]/.test(rhs),
      `EVAL_LLM_MODEL is assigned a hardcoded string (${rhs}). The eval generator must be coupled to ` +
        "DEFAULT_LLM_MODEL, not pinned to a literal (this is exactly the c763ea0 regression).",
    );
  });

  it("the coupling contract resolves to the production model when no override is set", () => {
    // Mirrors cao.eval.ts:110. With no override the eval generator IS the production default; an
    // explicit override (and only that) is allowed to diverge.
    const resolve = (override?: string): string => override ?? DEFAULT_LLM_MODEL;
    assert.equal(resolve(undefined), DEFAULT_LLM_MODEL);
    assert.equal(resolve("mistral-large-2512"), "mistral-large-2512");
  });

  it("JUDGE_MODEL equals DEFAULT_LLM_MODEL (P4 retired 2026-08-22)", () => {
    assert.equal(
      JUDGE_MODEL,
      DEFAULT_LLM_MODEL,
      "Judge and production generator must stay the same pin after P4 retirement. A deliberate " +
        "split requires updating judge.ts, GATE-ARCHITECTURE.md, and this test.",
    );
  });
});
