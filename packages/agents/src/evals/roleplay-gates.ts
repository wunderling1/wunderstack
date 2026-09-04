import { env } from "@wunderstack/shared";

import { createRoleplayAgent } from "../roleplay/agent";
import { ROLEPLAY_PROMPT_VERSION } from "../roleplay/version";
import { isAdvisory, ROLEPLAY_CHECK_KIND, resolveTier } from "./content-policy";
import type { EvalCheck } from "./harness";
import { retryWithBackoff } from "./retry";
import { PERSONA_FLOORS, REVIEW_FLOORS, type RoleplayFloor } from "./roleplay-floors";
import {
  roleplayOpeningCases,
  roleplayReviewCases,
  roleplayScenario,
  roleplayTurnCases,
  ROLEPLAY_FIXTURE_HASH,
  ROLEPLAY_SET_VERSION,
  type RoleplayEvalScenario,
} from "./roleplay-golden-set";
import {
  aggregateRoleplayReviews,
  aggregateRoleplayTurns,
  detectLiteralLeaks,
  detectPersonaBreaks,
  judgeRoleplayReply,
  type RoleplayReviewRun,
  type RoleplayTurnScore,
} from "./roleplay-judge";
import type {
  RoleplayGenerationFailure,
  RoleplayPersonaReport,
  RoleplayReviewFailure,
  RoleplayReviewReport,
} from "./report-writer";

/**
 * The two behavioural roleplay gates (Fase 6). G1-roleplay-contract lives in roleplay-contract.ts;
 * this module owns the ones that cost model calls.
 *
 * Both run through `createRoleplayAgent()` with no `generate` override — the production seam,
 * including its model settings and its Mastra/Langfuse wiring. That is the roleplay equivalent of
 * the "one verified-answer seam, three consumers" invariant: the moment the eval builds its own
 * model call, it starts scoring something users never get. It also means `EVAL_GENERATION_MODEL`
 * does NOT apply here — the roleplay branches pin their own temperatures per branch (a warm partner,
 * a cold reviewer), and A/B-ing that belongs behind the same seam, not next to it.
 */

/** How often the same transcript is re-reviewed to measure grade stability. */
const REVIEW_REPEATS = env.EVAL_ROLEPLAY_REPEATS ?? 3;
const TIER = resolveTier(env.EVAL_TIER);

function toChecks<T>(floors: readonly RoleplayFloor<T>[], aggregate: T): EvalCheck[] {
  return floors.map((floor) => {
    const kind = ROLEPLAY_CHECK_KIND[floor.thresholdKey];
    const advisory = isAdvisory(kind, TIER);
    return {
      name: floor.name,
      ok: floor.ok(aggregate),
      detail: floor.detail(aggregate),
      ...(advisory ? { advisory: true } : {}),
    };
  });
}

/**
 * Run one case, recording a failure instead of throwing.
 *
 * Two layers, because two different things go wrong. `retryWithBackoff` absorbs the transient ones —
 * a 429, a dropped socket, a request timeout — the same way Gate C survives its ~28 minutes of
 * provider calls; without it a five-minute run dies on a hiccup that says nothing about the agent.
 * What survives that is a real measurement: the floors gate it at zero, but it is recorded rather
 * than thrown, so one bad draw names the case instead of costing the other thirteen and the artefact.
 */
async function run<T>(
  caseId: string,
  failures: RoleplayGenerationFailure[],
  label: string,
  call: () => Promise<T>,
): Promise<T | null> {
  try {
    return await retryWithBackoff(call);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    failures.push({ caseId, reason });
    console.warn(`[${label}] ${caseId}: ${reason}`);
    return null;
  }
}

async function scoreReply(
  scenario: RoleplayEvalScenario,
  learnerMessage: string,
  reply: string,
): Promise<
  Pick<
    RoleplayTurnScore,
    "personaBreaks" | "literalLeaks" | "inRole" | "judgedReveal" | "judgedClose"
  >
> {
  const judged = await judgeRoleplayReply({
    partnerRole: scenario.prompt.partnerRole,
    persona: scenario.prompt.persona,
    contextDescription: scenario.prompt.contextDescription,
    hiddenSummary: scenario.hiddenSummary,
    learnerMessage,
    reply,
  });

  return {
    personaBreaks: detectPersonaBreaks(reply),
    literalLeaks: detectLiteralLeaks(reply, scenario.hiddenFacts),
    inRole: judged.inRole,
    judgedReveal: judged.revealed,
    judgedClose: judged.closes,
  };
}

/**
 * G2-roleplay-persona — does the persona keep the three rules the prompt gives it?
 *
 * Every reply is scored on every dimension, not only the one its category is named after: a persona
 * break in an ending case is still a persona break. The category decides what is PERMITTED
 * (`reveal`, `endPermitted`), not what is measured, which is what keeps the model-call budget honest —
 * 14 generations produce 14 in-role scores, 14 leak checks and 14 ending decisions.
 */
export async function runRoleplayPersonaGate(): Promise<{
  checks: EvalCheck[];
  report: RoleplayPersonaReport;
}> {
  const agent = createRoleplayAgent();
  const scores: RoleplayTurnScore[] = [];
  const failures: RoleplayGenerationFailure[] = [];
  let model = "";

  for (const testCase of roleplayOpeningCases) {
    const scenario = roleplayScenario(testCase.scenarioKey);
    const result = await run(testCase.id, failures, "roleplay-persona", () =>
      agent.openingLine({ scenario: scenario.prompt }),
    );
    if (!result) {
      continue;
    }
    model = result.model;
    scores.push({
      id: testCase.id,
      category: "opening",
      scenarioKey: testCase.scenarioKey,
      // An opening line is spoken before the learner has said anything, so nothing can have earned a
      // disclosure yet — and an opening that leaks leaves nothing to uncover at all.
      reveal: "forbidden",
      isClosingTurn: false,
      reply: result.text,
      conversationEnd: false,
      // An opening line has nothing to end, so a reply that reads as a goodbye is itself the bug the
      // mismatch metric catches.
      endPermitted: false,
      ...(await scoreReply(scenario, "(nog niets — dit is de openingszin)", result.text)),
    });
  }

  for (const testCase of roleplayTurnCases) {
    const scenario = roleplayScenario(testCase.scenarioKey);
    const result = await run(testCase.id, failures, "roleplay-persona", () =>
      agent.nextTurn({
        scenario: scenario.prompt,
        history: testCase.history,
        message: testCase.message,
        isClosingTurn: testCase.isClosingTurn,
      }),
    );
    if (!result) {
      continue;
    }
    model = result.model;
    scores.push({
      id: testCase.id,
      category: testCase.category,
      scenarioKey: testCase.scenarioKey,
      reveal: testCase.reveal,
      isClosingTurn: testCase.isClosingTurn,
      reply: result.text,
      conversationEnd: result.conversationEnd,
      endPermitted: testCase.endPermitted,
      ...(await scoreReply(scenario, testCase.message, result.text)),
    });
  }

  const aggregate = aggregateRoleplayTurns(scores, failures.length);
  return {
    checks: toChecks(PERSONA_FLOORS, aggregate),
    report: {
      setVersion: ROLEPLAY_SET_VERSION,
      fixtureHash: ROLEPLAY_FIXTURE_HASH,
      promptVersion: ROLEPLAY_PROMPT_VERSION,
      model,
      aggregate,
      cases: scores,
      failures,
    },
  };
}

/**
 * G2-roleplay-review — does the same transcript get the same grade?
 *
 * This gate does NOT check whether the grade is right; nothing in the repo can, because there are no
 * real transcripts with trainer scores to compare against (see roleplay-golden-set.ts). What it
 * checks is the part that fails visibly to a learner: identical work must not come back as pass on
 * one run and fail on the next, and a conversation the set ranks better must outscore the worse one
 * every single time. A rubric that cannot do that is not usable for grading, whatever its absolute
 * numbers look like.
 */
export async function runRoleplayReviewGate(): Promise<{
  checks: EvalCheck[];
  report: RoleplayReviewReport;
}> {
  const agent = createRoleplayAgent();
  const entries: {
    testCase: { id: string; expectedRank: number; expectPass: boolean };
    runs: RoleplayReviewRun[];
    rubricLength: number;
    missingReviews: number;
  }[] = [];
  const failures: RoleplayReviewFailure[] = [];
  let model = "";

  for (const testCase of roleplayReviewCases) {
    const scenario = roleplayScenario(testCase.scenarioKey);
    const criteria = scenario.prompt.rubric.criteria;
    const runs: RoleplayReviewRun[] = [];
    let missingReviews = 0;

    for (let repeat = 0; repeat < REVIEW_REPEATS; repeat++) {
      let result;
      try {
        result = await retryWithBackoff(() =>
          agent.reviewSession({
            scenario: scenario.prompt,
            history: testCase.transcript,
            endReason: testCase.endReason,
          }),
        );
      } catch (error) {
        // A review that does not come back is the failure this gate exists to catch, so it is
        // counted, not thrown: throwing would end the run at the first bad draw and leave the other
        // transcript, the other repeats and the artefact unmeasured. `maxMissingReviewCount` is 0,
        // so the gate is red either way — this way it is also diagnosable. What reached here already
        // survived the backoff above, so it is not a provider hiccup.
        missingReviews += 1;
        const reason = error instanceof Error ? error.message : String(error);
        failures.push({ caseId: testCase.id, repeat, reason });
        console.warn(`[roleplay-review] ${testCase.id} repeat ${String(repeat)}: ${reason}`);
        continue;
      }
      model = result.model;
      runs.push({
        weightedScore: result.weightedScore,
        passed: result.passed,
        modelReportedPassed: result.modelReportedPassed,
        criteriaCount: result.criteria.length,
        unscoredCount: result.criteria.filter((criterion) => criterion.score === null).length,
        questionsVerbatim: result.criteria.every(
          (criterion, index) => criterion.question === criteria[index]?.question,
        ),
        completionTokens: result.usage.completionTokens,
      });
    }

    entries.push({
      testCase: {
        id: testCase.id,
        expectedRank: testCase.expectedRank,
        expectPass: testCase.expectPass,
      },
      runs,
      rubricLength: criteria.length,
      missingReviews,
    });
  }

  const aggregate = aggregateRoleplayReviews(entries);
  return {
    checks: toChecks(REVIEW_FLOORS, aggregate),
    report: {
      setVersion: ROLEPLAY_SET_VERSION,
      fixtureHash: ROLEPLAY_FIXTURE_HASH,
      promptVersion: ROLEPLAY_PROMPT_VERSION,
      model,
      repeats: REVIEW_REPEATS,
      aggregate,
      failures,
    },
  };
}
