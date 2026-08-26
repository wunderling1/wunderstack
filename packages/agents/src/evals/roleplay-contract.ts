import { createHash } from "node:crypto";

import {
  buildJsonRetryUserMessage,
  buildOpeningSystemPrompt,
  buildOpeningUserMessage,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  buildTurnSystemPrompt,
  buildTurnUserMessage,
} from "../roleplay/prompts.js";
import { normalizeRubricWeights } from "../roleplay/rubric.js";
import { scenarioFixture } from "../roleplay/scenario-fixture.js";
import { roleplayScenarioPromptSchema } from "../roleplay/snapshot.js";
import { ROLEPLAY_PROMPT_VERSION } from "../roleplay/version.js";
import type { EvalCheck } from "./harness.js";
import {
  ROLEPLAY_FIXTURE_HASH,
  ROLEPLAY_SET_VERSION,
  roleplayScenarios,
} from "./roleplay-golden-set.js";

/**
 * G1-roleplay-contract — the offline change-detector for the roleplay agent.
 *
 * Same character as G1-contract for the grounded agent, and the same limitation: it proves the rules
 * are still IN the prompt, never that the model follows them. "Deel je NIET ongevraagd" can be
 * present and ignored; whether the persona actually withholds is G2-roleplay-persona.
 *
 * What makes this worth running anyway is that every rule below was put there to prevent a specific
 * defect, and a refactor can delete one without any test noticing. The three that carry the most
 * weight are the two hidden-information rules (a leak empties the exercise), the "do not compute the
 * total" rule (a model-computed grade would contradict the one sent to a customer's LMS), and the
 * absence of Qonvo's "previous attempts" heading (with no learner history, that heading forces the
 * model to invent progress).
 */

/** A scenario with every optional branch filled, so no prompt section goes unrendered. */
function contractScenario(): ReturnType<typeof scenarioFixture> {
  return scenarioFixture({
    difficulty: {
      conversationPrompt: "Wees extra kritisch en geef niet snel toe.",
      reviewPrompt: "Beoordeel strenger dan gebruikelijk.",
    },
  });
}

/**
 * Every prompt this agent can produce, concatenated. Hashing the RENDERED output (not the source
 * file) is what turns `ROLEPLAY_PROMPT_VERSION` from a convention into a check: version.ts says
 * "bump on ANY change to prompts.ts", and a bump that is forgotten makes every stored session claim
 * a prompt text it never saw (EU AI Act Art. 12). Change a word and this fails until the pin below
 * is updated — which is a line right next to the version, so forgetting the bump is loud.
 */
function renderAllPrompts(): string {
  const scenario = contractScenario();
  return [
    buildOpeningSystemPrompt(scenario),
    buildOpeningUserMessage(scenario),
    buildTurnSystemPrompt(scenario, false),
    buildTurnSystemPrompt(scenario, true),
    buildTurnUserMessage(scenario, "Wat gaan we doen?", "Klantadviseur: \"Hallo\""),
    buildReviewSystemPrompt(scenario, "completed"),
    buildReviewSystemPrompt(scenario, "max_turns_reached"),
    buildReviewSystemPrompt(scenario, "abandoned"),
    buildReviewUserMessage(scenario, "[]"),
    buildJsonRetryUserMessage("Oorspronkelijke vraag", "{kapot", "Unexpected end of JSON input"),
    buildJsonRetryUserMessage("Oorspronkelijke vraag", "", "no JSON object"),
  ].join("\n\u0000\n");
}

/**
 * The prompt build this version string stands for. Update BOTH fields in the same edit; the check
 * prints the computed hash when it fails, so re-pinning is a copy, not a puzzle.
 */
const PINNED_PROMPT_BUILD = {
  version: "2026-08-25-review-retry",
  hash: "c1d71d8f9db8bb085ce09e1863d7aedf0b6fdf31edd8a92493d4a3f7874d5ea9",
} as const;

/**
 * The golden set this hash stands for. Same mechanism as the CAO fixture-hash guard: an edit to the
 * fixtures without a deliberate version bump is a silent change to the measuring stick.
 */
const PINNED_FIXTURE = {
  version: "3",
  hash: "9a4cc43a52ed91c5f52b68b27e90fd3ac1e6cb737be65283be30d5b0233b25ca",
} as const;

export function roleplayContractChecks(): EvalCheck[] {
  const scenario = contractScenario();
  const opening = buildOpeningSystemPrompt(scenario);
  const turn = buildTurnSystemPrompt(scenario, false);
  const closingTurn = buildTurnSystemPrompt(scenario, true);
  const reviewCompleted = buildReviewSystemPrompt(scenario, "completed");
  const reviewMaxTurns = buildReviewSystemPrompt(scenario, "max_turns_reached");
  const retry = buildJsonRetryUserMessage(
    buildReviewUserMessage(scenario, "[]"),
    "{kapot",
    "Unexpected end of JSON input",
  );

  const promptHash = createHash("sha256").update(renderAllPrompts()).digest("hex");
  const weightSums = roleplayScenarios.map((entry) =>
    normalizeRubricWeights(
      entry.prompt.rubric.criteria.map((criterion) => ({
        question: criterion.question,
        description: criterion.description,
        behavioralIndicators: criterion.behavioralIndicators,
        // Already-resolved percentages round-trip through the normaliser; the invariant under test is
        // that whatever goes in, the percentages come out summing to exactly 100.
        weight: criterion.weight,
      })),
    ).reduce((sum, criterion) => sum + criterion.weight, 0),
  );

  // The snapshot schema is strict, so these two are rejections rather than absences. `briefing` is
  // the learner's preparation text — a persona that reads it starts steering toward the lesson —
  // and there is no identity field at all (DECISION-roleplay-agent.md, R3).
  const rejectsBriefing = !roleplayScenarioPromptSchema.safeParse({
    ...scenario,
    briefing: "Bereid je voor op een lastig gesprek.",
  }).success;
  const rejectsIdentity = !roleplayScenarioPromptSchema.safeParse({
    ...scenario,
    learnerName: "Robin de Vries",
  }).success;

  return [
    {
      name: "rp-contract: turn prompt withholds the hidden information until asked",
      ok: turn.includes("deel je NIET ongevraagd"),
    },
    {
      name: "rp-contract: opening prompt withholds the hidden information outright",
      ok: opening.includes("deel je NIET in je openingszin"),
    },
    {
      name: "rp-contract: closing turn forbids asking new questions",
      ok: closingTurn.includes("Je stelt dus geen nieuwe vragen meer!"),
    },
    {
      name: "rp-contract: a non-closing turn carries no closing instruction",
      ok: !turn.includes("Je stelt dus geen nieuwe vragen meer!"),
    },
    {
      name: "rp-contract: reviewer may not compute the weighted total",
      ok: reviewCompleted.includes("Bereken GEEN gewogen totaalscore"),
    },
    {
      name: "rp-contract: reviewer must copy each rubric question verbatim",
      ok: reviewCompleted.includes("WOORD-VOOR-WOORD"),
    },
    {
      name: "rp-contract: reviewer is not asked about previous attempts (no history to report on)",
      ok: !/vorige poging/i.test(reviewCompleted),
    },
    {
      // The retry exists to fix formatting, not to buy a second opinion: a retry that invited the
      // model to reconsider would make a learner's grade depend on whether the first draw parsed.
      // It must also still carry the original message — a reviewer asked to repeat its judgement
      // without the transcript in front of it will invent one.
      name: "rp-contract: the parse-retry restates the request and asks only for reformatting",
      ok:
        retry.includes("Verander de inhoud van je") &&
        /alleen de opmaak/i.test(retry) &&
        retry.includes("# Gesprek transcript"),
    },
    {
      name: "rp-contract: a spent turn budget changes the reviewer's instruction",
      ok:
        reviewMaxTurns.includes("maximum aantal beurten") &&
        !reviewCompleted.includes("maximum aantal beurten"),
    },
    {
      name: "rp-contract: no voice/TTS formatting block in the turn prompt (v1 is text-only)",
      ok: !/\b(text-to-speech|voorgelezen|uitgesproken|spraakuitvoer)\b/i.test(closingTurn),
    },
    {
      name: "rp-contract: prompt schema rejects the learner briefing",
      ok: rejectsBriefing,
    },
    {
      name: "rp-contract: prompt schema rejects a learner identity field",
      ok: rejectsIdentity,
    },
    {
      name: "rp-contract: rubric weights normalise to exactly 100%",
      ok: weightSums.every((sum) => Math.abs(sum - 100) < 1e-9),
      detail: weightSums.map((sum) => sum.toFixed(2)).join(", "),
    },
    {
      name: "rp-contract: rendered prompts match ROLEPLAY_PROMPT_VERSION",
      ok: ROLEPLAY_PROMPT_VERSION === PINNED_PROMPT_BUILD.version && promptHash === PINNED_PROMPT_BUILD.hash,
      detail:
        ROLEPLAY_PROMPT_VERSION === PINNED_PROMPT_BUILD.version && promptHash === PINNED_PROMPT_BUILD.hash
          ? `${ROLEPLAY_PROMPT_VERSION} @ ${promptHash.slice(0, 12)}`
          : `prompts changed: bump ROLEPLAY_PROMPT_VERSION and re-pin PINNED_PROMPT_BUILD to { version: "${ROLEPLAY_PROMPT_VERSION}", hash: "${promptHash}" }`,
    },
    {
      name: "rp-contract: golden set matches its pinned version",
      ok:
        ROLEPLAY_SET_VERSION === PINNED_FIXTURE.version &&
        ROLEPLAY_FIXTURE_HASH === PINNED_FIXTURE.hash,
      detail:
        ROLEPLAY_SET_VERSION === PINNED_FIXTURE.version && ROLEPLAY_FIXTURE_HASH === PINNED_FIXTURE.hash
          ? `v${ROLEPLAY_SET_VERSION} @ ${ROLEPLAY_FIXTURE_HASH.slice(0, 12)}`
          : `fixtures changed: bump "version" in roleplay-golden-set.json and re-pin PINNED_FIXTURE to { version: "${ROLEPLAY_SET_VERSION}", hash: "${ROLEPLAY_FIXTURE_HASH}" }`,
    },
  ];
}
