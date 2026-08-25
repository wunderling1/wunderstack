/**
 * Deterministic Beleidsregel asserties under G2-answer (capability, not a new G-id).
 * Ids and article mapping: docs/compliance/arbo-agent-wettelijke-eisen-spiegeling.md
 * Soft judge scores (faithfulness/relevance/completeness) do NOT block — generator == judge
 * (mistral-large-2512); see judge.ts module comment and GATE-ARCHITECTURE.md P4-retired.
 */

import type { EvalCheck } from "./harness.js";
import type { GoldenCase } from "./golden-set.js";
import { ARBO_G2_CORPUS_VERSION } from "./golden-set.js";
import { OUT_OF_SCOPE_MESSAGE } from "../arbo/prompt.js";

export interface AnswerCaseLike {
  readonly id: string;
  readonly category: GoldenCase["category"];
  readonly question: string;
  readonly answerRaw: string;
  readonly refused: boolean;
}

const FORBIDDEN_COMPLIANCE_CLAIMS =
  /voldoe je aan de wet|dan ben je klaar|dan is het risico weg/i;
const FORBIDDEN_MODALITY = /de wet verplicht je|wettelijk verplicht(?!\s+in de context)/i;
const ARBOWET_ARTICLE =
  /\b(?:Arbowet|Arbobesluit)\s*(?:art(?:ikel)?\.?\s*)?\d+/i;

/**
 * Five blocking deterministic checks + three n.v.t. reports (missing corpus metadata).
 * Judge soft metrics are recorded elsewhere and must not gate release (B4).
 */
export function arboDeterministicAnswerChecks(
  cases: readonly AnswerCaseLike[],
  corpusVersion: string = ARBO_G2_CORPUS_VERSION,
): EvalCheck[] {
  const refusals = cases.filter((row) => row.category === "refusal");
  const answerable = cases.filter((row) => row.category !== "refusal");

  const scopeRefusals = refusals.filter((row) =>
    /arbowet|cao|bedrijfsarts|vakantie|tilnorm|beeldscherm/i.test(row.question),
  );
  const scopeOk =
    scopeRefusals.length === 0 ||
    scopeRefusals.every(
      (row) => row.refused && row.answerRaw.includes(OUT_OF_SCOPE_MESSAGE) && !/\[\d+\]/.test(row.answerRaw),
    );

  const modalityViolations = answerable.filter((row) => FORBIDDEN_MODALITY.test(row.answerRaw));
  const complianceViolations = cases.filter((row) => FORBIDDEN_COMPLIANCE_CLAIMS.test(row.answerRaw));
  const grondslagViolations = answerable.filter((row) => ARBOWET_ARTICLE.test(row.answerRaw));

  // Completeness: for step-plan questions, require the answer to mention more than one imperative
  // step when the reference/question signals a stappenplan. Conservative: only cases whose id/question
  // mention "stap".
  const stepCases = answerable.filter((row) => /stap/i.test(row.question) || /stap/i.test(row.id));
  const incompleteSteps = stepCases.filter((row) => {
    const stepMentions = row.answerRaw.match(/\b(?:stap\s*)?\d+\b/gi) ?? [];
    return stepMentions.length < 2 && !row.refused;
  });

  return [
    {
      name: "G5-3a-SCOPE: scope refusals use OUT_OF_SCOPE_MESSAGE, empty citations",
      ok: scopeOk,
      detail: scopeOk
        ? undefined
        : scopeRefusals
            .filter((row) => !row.answerRaw.includes(OUT_OF_SCOPE_MESSAGE))
            .map((row) => row.id)
            .join(", "),
    },
    {
      name: "G5-3e-VOLLEDIG: step-plan answers keep multiple steps when asked",
      ok: incompleteSteps.length === 0,
      detail:
        incompleteSteps.length === 0
          ? undefined
          : `thin step coverage: ${incompleteSteps.map((row) => row.id).join(", ")}`,
    },
    {
      name: "G5-5-RESTRISICO: no 'voldoe je aan de wet' / 'dan ben je klaar' (exacte zin wacht op OOMT)",
      ok: complianceViolations.length === 0,
      detail:
        complianceViolations.length === 0
          ? undefined
          : complianceViolations.map((row) => row.id).join(", "),
    },
    {
      name: "G5-3e-MODALITEIT: no 'de wet verplicht je' / 'wettelijk verplicht' unless refusal",
      ok: modalityViolations.length === 0,
      detail:
        modalityViolations.length === 0
          ? undefined
          : modalityViolations.map((row) => row.id).join(", "),
    },
    {
      name: "G5-2b-GRONDSLAG: no Arbowet/Arbobesluit article numbers in answerable prose",
      ok: grondslagViolations.length === 0,
      detail:
        grondslagViolations.length === 0
          ? undefined
          : grondslagViolations.map((row) => row.id).join(", "),
    },
    {
      name: `G5-3f-GROEPEN`,
      ok: true,
      na: true,
      detail: `niet van toepassing — veld ontbreekt in corpus ${corpusVersion}`,
    },
    {
      name: `G5-3d-INTERPRETATIE`,
      ok: true,
      na: true,
      detail: `niet van toepassing — veld ontbreekt in corpus ${corpusVersion}`,
    },
    {
      name: `G5-3c-INGANG`,
      ok: true,
      na: true,
      detail: `niet van toepassing — veld ontbreekt in corpus ${corpusVersion}`,
    },
  ];
}
