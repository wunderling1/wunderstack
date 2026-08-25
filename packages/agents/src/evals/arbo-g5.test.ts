import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OUT_OF_SCOPE_MESSAGE } from "../arbo/prompt.js";
import { arboDeterministicAnswerChecks } from "./arbo-g5.js";

describe("arboDeterministicAnswerChecks", () => {
  it("G5-3a-SCOPE goes red when a scope refusal answers substantively", () => {
    const checks = arboDeterministicAnswerChecks(
      [
        {
          id: "arbo-oomt-ref-01",
          category: "refusal",
          question: "Wat zegt de Arbowet over tillen?",
          answerRaw: "Je moet tillen vermijden volgens algemene kennis.",
          refused: false,
        },
      ],
      "arbo-oomt-2",
    );
    const scope = checks.find((check) => check.name.startsWith("G5-3a-SCOPE"));
    assert.ok(scope);
    assert.equal(scope.ok, false);
  });

  it("G5-3a-SCOPE is green on exact OUT_OF_SCOPE_MESSAGE without citations", () => {
    const checks = arboDeterministicAnswerChecks(
      [
        {
          id: "arbo-oomt-ref-01",
          category: "refusal",
          question: "Wat zegt de Arbowet over tillen?",
          answerRaw: OUT_OF_SCOPE_MESSAGE,
          refused: true,
        },
      ],
      "arbo-oomt-2",
    );
    const scope = checks.find((check) => check.name.startsWith("G5-3a-SCOPE"));
    assert.ok(scope);
    assert.equal(scope.ok, true);
  });

  it("G5-2b-GRONDSLAG goes red on an invented Arbowet article", () => {
    const checks = arboDeterministicAnswerChecks(
      [
        {
          id: "arbo-oomt-01",
          category: "in_scope",
          question: "Hoe maak ik spanningsloos?",
          answerRaw: "Volgens Arbowet artikel 3 moet je eerst de serviceplug trekken.",
          refused: false,
        },
      ],
      "arbo-oomt-2",
    );
    const grondslag = checks.find((check) => check.name.startsWith("G5-2b-GRONDSLAG"));
    assert.ok(grondslag);
    assert.equal(grondslag.ok, false);
  });

  it("G5-5-RESTRISICO goes red on 'voldoe je aan de wet'", () => {
    const checks = arboDeterministicAnswerChecks(
      [
        {
          id: "arbo-oomt-01",
          category: "in_scope",
          question: "Welke PBM?",
          answerRaw: "Draag klasse-0 handschoenen; dan voldoe je aan de wet.",
          refused: false,
        },
      ],
      "arbo-oomt-2",
    );
    const restrisico = checks.find((check) => check.name.startsWith("G5-5-RESTRISICO"));
    assert.ok(restrisico);
    assert.equal(restrisico.ok, false);
  });

  it("corpus-metadata G5 ids report as N/A (not pass, not skip)", () => {
    const checks = arboDeterministicAnswerChecks([], "arbo-oomt-2");
    const na = checks.filter((check) => check.na === true);
    assert.equal(na.length, 3);
    assert.ok(na.every((check) => /niet van toepassing/.test(check.detail ?? "")));
  });
});
