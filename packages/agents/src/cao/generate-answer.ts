import type { ChatMessage, TokenUsage } from "@wunderstack/ai";

import { extractCitationMarkers } from "./build-citations.js";
import { containsHardFact, findUngroundedFacts } from "./hard-facts.js";
import { parseGenerationOutput } from "./parse-generation.js";
import { NOT_FOUND_MESSAGE } from "./prompt.js";
import { verifyCitations } from "./verify-citations.js";

/**
 * Generation with a single citation-contract repair retry — the seam that stabilises Gate C.
 *
 * Gate C is dominated by generator non-determinism: mistral-small-2603 emits a malformed citation
 * block, an unverifiable quote, or an ungrounded number on a *different* handful of cases every run,
 * which swings citation-verification / under-refusal by 10+ points between otherwise identical runs.
 * A single targeted retry — feeding the specific contract violation back so the model can correct
 * itself, the same shape as the judge's parse-retry (judge.ts) — collapses that variance WITHOUT
 * weakening any threshold: a genuinely grounded answer that merely mis-formatted its citations gets a
 * second chance, and an ungrounded assertion (e.g. an invented "16 weken [1]") is re-asked and
 * typically resolves to the exact not-found refusal.
 *
 * The generator is injected (`AnswerGenerate`) so this module stays free of any specific client: the
 * eval passes a @wunderstack/ai `generateText` adapter, the agent a Mastra one. It never rewrites the
 * model output — it only chooses which raw attempt to return — so the eval keeps scoring raw text.
 */

/** One attempt at a cited answer from the generator, plus optional token usage. */
export interface AnswerAttempt {
  /** Raw model output: prose + the trailing citation block, unmodified. */
  text: string;
  usage?: TokenUsage;
  /**
   * Provider finish reason for this attempt (`stop`, `length`, …). Persisted on the Gate C artefact
   * so an unterminated citation block can be diagnosed as truncation-by-cap vs a dropped bracket
   * (Gate C close-out, etd-012).
   */
  finishReason?: string | null;
}

/**
 * Runs one generation turn. `extraMessages` are appended AFTER the base system+user prompt so a
 * repair turn can feed the previous attempt back. The caller owns the base prompt and model settings;
 * this helper only decides whether a retry is warranted and which attempt to keep.
 */
export type AnswerGenerate = (extraMessages: ChatMessage[]) => Promise<AnswerAttempt>;

export interface AnswerWithRepairResult {
  /** Raw model output of the chosen attempt (prose + citation block), unmodified. */
  text: string;
  /** Number of generation attempts actually run (1 = first attempt already clean; up to `maxAttempts`). */
  attempts: number;
  /** True when a later (repair) attempt was chosen over the first generation. */
  repaired: boolean;
  usage: TokenUsage;
  /** Finish reason of the chosen attempt (truncation diagnostic). */
  finishReason: string | null;
}

export interface ContractAssessment {
  /** 0 = the citation contract is honoured; higher = more/worse violations. */
  penalty: number;
  /** Dutch, model-facing reason used to steer the repair turn (empty when penalty is 0). */
  reason: string;
  /**
   * The exact quotes that failed verbatim verification, echoed back in the repair turn so the model
   * fixes the specific spans instead of guessing. Empty when nothing was stripped.
   */
  strippedQuotes: string[];
}

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Raised when a full generation budget produced no usable answer — every attempt was aborted or
 * came back empty (typically the client disconnected mid-generation, or the provider request timed
 * out). It is a deliberate throw so the caller stops the turn cleanly instead of serving an empty
 * `found=true` bubble. See {@link isUnusableAttempt}.
 */
export class GenerationAbortedError extends Error {
  constructor(attempts: number) {
    super(`Generation produced no usable answer after ${String(attempts)} attempt(s) (aborted or empty).`);
    this.name = "GenerationAbortedError";
  }
}

/**
 * An attempt that must never be served or win the repair loop.
 *
 * Mastra surfaces an aborted (client disconnect) or guardrail-tripped generation as an EMPTY
 * completion with `finishReason: "tripwire"` — it does not throw. Left unchecked, that empty string
 * parses as a "clean refusal" (no sentinel, no markers, no hard fact → penalty 0 in
 * `assessCitationContract`), so it silently beats a real answer in the `<=` tie-break and is emitted
 * as a blank, sourceless bubble marked `found=true`. Treat any empty/tripwire attempt as unusable:
 * a real refusal is the non-empty `NOT_FOUND_MESSAGE`, never "".
 */
function isUnusableAttempt(attempt: AnswerAttempt): boolean {
  return attempt.finishReason === "tripwire" || attempt.text.trim().length === 0;
}

/** A missing/unparseable block or an ungrounded fact is a hard fail; one bad marker is a soft fail. */
const PENALTY_PARSE_FAILED = 100;
const PENALTY_UNGROUNDED_FACT = 100;
const PENALTY_PER_BAD_MARKER = 10;

/**
 * Judge one raw attempt against the citation contract, deterministically and offline — the same
 * checks Gate C scores (judge.ts `scoreCitationVerification`), reused here so the retry trigger
 * cannot drift from the metric it defends:
 *   - a refusal / claim-free answer with no `[n]` markers and no hard fact is vacuously clean;
 *   - an answerable attempt whose citation block is missing or invalid JSON is a hard violation;
 *   - each quote that is not verbatim in its chunk, and each prose `[n]` without a verified citation
 *     behind it, is a marker-level violation;
 *   - a load-bearing fact (money / percentage / quantity) that is not grounded in the chunk content is
 *     a hard violation — the SAME `findUngroundedFacts` decision as the production hard-fact guard
 *     (agent.ts, E13) and the eval's hard-hallucination scorer (judge.ts), so a citation must carry
 *     the figure, not merely sit next to it (the etd-026 "decorative citation" gap). `userSupplied`
 *     (question + history) is grounding: a number the user provided is a premise, not a fabrication.
 */
export function assessCitationContract(
  raw: string,
  chunkContentById: Map<string, string>,
  userSupplied = "",
): ContractAssessment {
  const parsed = parseGenerationOutput(raw);
  const proseMarkers = extractCitationMarkers(parsed.answerMarkdown);
  const asserts = proseMarkers.length > 0 || containsHardFact(parsed.answerMarkdown);

  if (parsed.citationParseFailed) {
    if (!asserts) {
      // No claim to back and no citation block: a clean refusal / no-source answer. Nothing to repair.
      return { penalty: 0, reason: "", strippedQuotes: [] };
    }
    return {
      penalty: PENALTY_PARSE_FAILED,
      reason: "het citatieblok na de sentinel ontbrak of was geen geldige JSON-array",
      strippedQuotes: [],
    };
  }

  const verification = verifyCitations(parsed.modelCitations, chunkContentById);
  const verifiedMarkers = new Set(verification.verified.map((citation) => citation.marker));
  const unbacked = proseMarkers.filter((marker) => !verifiedMarkers.has(marker));

  let penalty = 0;
  const reasons: string[] = [];
  if (verification.strippedMarkers.length > 0) {
    penalty += verification.strippedMarkers.length * PENALTY_PER_BAD_MARKER;
    reasons.push(`${verification.strippedMarkers.length} citaat(en) waren niet woordelijk in de context terug te vinden`);
  }
  if (unbacked.length > 0) {
    penalty += unbacked.length * PENALTY_PER_BAD_MARKER;
    reasons.push(`${unbacked.length} [n]-verwijzing(en) in de tekst hadden geen geverifieerd citaat`);
  }
  const grounding = [...chunkContentById.values()].join(" ");
  const ungroundedFacts = findUngroundedFacts(parsed.answerMarkdown, grounding, userSupplied);
  if (ungroundedFacts.length > 0) {
    penalty += PENALTY_UNGROUNDED_FACT;
    reasons.push(
      `de tekst noemt een concreet bedrag, percentage of aantal dat niet in de context staat (${ungroundedFacts.join(", ")})`,
    );
  }

  return {
    penalty,
    reason: reasons.join("; "),
    strippedQuotes: verification.strippedCitations.map((citation) => citation.quote),
  };
}

/**
 * The naar-rato repair hatch may fire only when BOTH are true:
 *   - the contract violation is an ungrounded load-bearing fact (the `assessCitationContract` reason
 *     contains "niet in de context staat");
 *   - the question or previous attempt is a deeltijd / pro-rata computation.
 *
 * Unconditional, the hatch taught the model to "verwijs naar het fonds" on etd-026 (WAZo / 16 weken)
 * instead of refusing. Derived golden questions (etd-d01 "24 uur per week", etd-d02 "parttime",
 * etd-d03 "contract van 12 uur") do not always say "deeltijd", so the signal covers those phrasings.
 */
const UNGROUNDED_FACT_REASON = /niet in de context staat/i;
const PRO_RATA_SIGNAL =
  /deeltijd|part[- ]?time|pro-?rata|naar rato|naar-rato|\d+\s*uur per week|contract van \s*\d+\s*uur/i;

export function isProRataViolation(reason: string, previous: string, userSupplied = ""): boolean {
  if (!UNGROUNDED_FACT_REASON.test(reason)) {
    return false;
  }
  return PRO_RATA_SIGNAL.test(`${userSupplied}\n${previous}`);
}

function buildRepairMessages(
  previous: string,
  reason: string,
  strippedQuotes: string[] = [],
  userSupplied = "",
): ChatMessage[] {
  // Echo the exact quotes that failed verbatim verification so the repair turn fixes those specific
  // spans instead of re-guessing. The most common recoverable failure is a quote that stitched two
  // spans or paraphrased the head; the fix is to split into contiguous quotes under one marker.
  const strippedQuoteLines =
    strippedQuotes.length === 0
      ? []
      : [
          "Deze citaten waren NIET letterlijk in de context terug te vinden:",
          ...strippedQuotes.map((quote) => `  - "${quote}"`),
          "Voor elk daarvan: splits het op in MEERDERE citatie-objecten met HETZELFDE marker-nummer,",
          "elk met een eigen aaneengesloten quote die begint bij een woord dat letterlijk in de passage",
          "staat. Plak nooit twee stukken aan elkaar met \"…\" of \"...\".",
        ];
  // naar-rato escape hatch (golden-set.REVIEW.md §15): a self-computed pro-rata TOTAL flagged as
  // ungrounded must not collapse into a blanket refusal (etd-d03). Only offer that middle path when
  // the question actually is a deeltijd/pro-rata computation — otherwise the hatch licenses
  // under-refusal on out-of-corpus facts (etd-026 "16 weken" / "verwijs naar het fonds").
  const proRataLines = isProRataViolation(reason, previous, userSupplied)
    ? [
        "Gaat het om een zelf te berekenen deeltijd- of pro-rata-uitkomst (bijvoorbeeld vakantie-uren naar",
        "rato)? Verzin dan GEEN totaal, maar weiger ook NIET: noem de wél vermelde gegevens (zoals het",
        "fulltime-aantal en de regel dat het naar rato geldt) mét [n], en verwijs voor het exacte getal naar",
        "het fonds. Dat is een geldig, gegrond antwoord — geef dat in plaats van NOT_FOUND.",
      ]
    : [];
  return [
    { role: "assistant", content: previous },
    {
      role: "user",
      content: [
        `Je vorige antwoord voldeed niet aan het citatie-contract: ${reason}.`,
        ...strippedQuoteLines,
        "Herschrijf je volledige antwoord op basis van UITSLUITEND de eerder gegeven context.",
        "Onderbouw elke feitelijke bewering met een [n]-verwijzing én een woordelijk (verbatim) citaat in",
        "het citatieblok na de sentinel. Voeg geen [n]-verwijzing toe zonder bijbehorend geverifieerd citaat.",
        // etd-021: the model paraphrased the quote head and hyphenated the chunk_id. Force character-
        // for-character copy of both so the repair turn cannot "fix" the contract by rewording.
        "Kopieer elk citaat KARAKTER VOOR KARAKTER uit de context — geen herformulering, geen synoniemen,",
        "geen weglating van woorden. Gebruik exact de chunk_id zoals die in de context staat (geen koppeltekens",
        "of spaties toevoegen of weglaten). Zet chunk_id NOOIT in de lopende tekst — alleen in de JSON na de sentinel.",
        // Long verbatim spans are where the copy breaks; a short exact fragment is far more reliable.
        "Houd elk citaat ZO KORT MOGELIJK: kies het kortste aaneengesloten fragment dat het feit dekt (een",
        "paar woorden of één deelzin), en begin het bij een woord dat letterlijk in de passage staat —",
        "neem geen inleidende woorden mee die je zou moeten aanpassen (lidwoord, hoofdletter).",
        ...proRataLines,
        // Mirror prompt.ts "niet bepaalt / niet regelt / niet noemt": a first-pass hedge is a
        // not-found case. The old repair turn only had the "niets bruikbaars" fallback, so the model
        // rewrote the hedge instead of emitting the exact refusal.
        'Concludeer je dat de CAO iets niet bepaalt, niet regelt of niet noemt? Dat is een niet-gevonden-geval:',
        `antwoord dan EXACT met "${NOT_FOUND_MESSAGE}" en een lege citatie-array []. Voeg geen [n] toe.`,
        `Staat er echt niets bruikbaars in de context? Zelfde zin, woord voor woord: "${NOT_FOUND_MESSAGE}"`,
      ].join("\n"),
    },
  ];
}

function addUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage {
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}

/**
 * The exact state the serve-time coupling guard (verifyAndBuild, agent.ts) refuses: a SUBSTANTIVE
 * answer — it carries a `[n]` marker or a load-bearing hard fact — for which not a single citation
 * verifies verbatim. "Asserts" is read off the ORIGINAL prose so an answer whose markers would be
 * stripped still counts as substantive. This is the trigger for the one bounded extra repair attempt
 * (option b): it fires ONLY here, so latency/cost rise by at most one call and only on the case that
 * would otherwise be served sourceless.
 */
function isUnverifiableContentAnswer(raw: string, chunkContentById: Map<string, string>): boolean {
  const parsed = parseGenerationOutput(raw);
  const asserts = extractCitationMarkers(parsed.answerMarkdown).length > 0 || containsHardFact(parsed.answerMarkdown);
  if (!asserts) {
    return false;
  }
  return verifyCitations(parsed.modelCitations, chunkContentById).verified.length === 0;
}

/**
 * Generate a cited answer as a bounded best-of-N over the citation contract. The first attempt is a
 * plain generation; every subsequent attempt is a repair turn fed the best-so-far violation, so the
 * model keeps getting a concrete "your quote X was not verbatim / fact Y is ungrounded" nudge. The loop
 * returns the FIRST attempt that satisfies the contract (penalty 0) and otherwise the lowest-penalty
 * attempt seen; ties go to the later attempt (it acted on the feedback). The chosen raw text is returned
 * unmodified so downstream verification/scoring is unchanged.
 *
 * `maxAttempts` is the generation analogue of the judge's EVAL_JUDGE_SAMPLES: Gate C's zero-tolerance
 * count gates (citation-verification, dangling-marker) fail whenever a SINGLE case emits a slightly
 * off-verbatim quote, and which case flakes rotates run-to-run (golden-set.REVIEW.md §14). Sampling a
 * couple of attempts and keeping a clean one collapses that variance WITHOUT weakening any threshold —
 * a genuinely ungrounded assertion still fails every attempt and is served as the not-found refusal.
 * Defaults to 2 (one generation + one repair), so production latency is unchanged; the eval raises it.
 *
 * Beyond `maxAttempts`, ONE additional repair attempt (option b) fires only when the chosen attempt is
 * a substantive answer with zero verified citations ({@link isUnverifiableContentAnswer}) — the exact
 * state the serve-time coupling guard refuses. This targets the sourceless-answer failure the penalty
 * does not single out, at a bounded +1 call on the worst case.
 */
export async function generateAnswerWithRepair(args: {
  chunkContentById: Map<string, string>;
  generate: AnswerGenerate;
  /** The user's question + history: grounding for hard facts (a user-supplied number is a premise). */
  userSupplied?: string;
  /** Total generation attempts (>= 1). Default 2 = one generation + one repair (legacy behaviour). */
  maxAttempts?: number;
}): Promise<AnswerWithRepairResult> {
  const userSupplied = args.userSupplied ?? "";
  const budget = Math.max(1, Math.trunc(args.maxAttempts ?? 2));

  let usage: TokenUsage = ZERO_USAGE;
  let attemptsRun = 0;
  let best: { attempt: AnswerAttempt; assessment: ContractAssessment; index: number } | undefined;

  for (let index = 0; index < budget; index += 1) {
    attemptsRun += 1;
    // Retry-first, by design: attempt 0 is a plain generation; each later attempt gets the repair turn
    // (the best-so-far violation fed back) so the model can ground the figure or refuse cleanly BEFORE
    // the serve-time guard (agent.ts) turns a violation into a hard NOT_FOUND. The guard is the safety
    // net, not the first line.
    const extraMessages =
      best === undefined
        ? []
        : buildRepairMessages(
            best.attempt.text,
            best.assessment.reason,
            best.assessment.strippedQuotes,
            userSupplied,
          );
    const attempt = await args.generate(extraMessages);
    usage = addUsage(usage, attempt.usage);

    // An aborted/tripwire (empty) attempt is not an answer: never let it become `best`, trigger the
    // penalty-0 clean-stop, or overwrite a real earlier attempt. Skip it and, if budget remains, try
    // again; a run that yields ONLY unusable attempts throws below instead of returning "".
    if (isUnusableAttempt(attempt)) {
      continue;
    }

    const assessment = assessCitationContract(attempt.text, args.chunkContentById, userSupplied);

    // `<=` so a later attempt wins ties (it acted on the feedback); strict improvements always win.
    if (best === undefined || assessment.penalty <= best.assessment.penalty) {
      best = { attempt, assessment, index };
    }
    if (best.assessment.penalty === 0) {
      break;
    }
  }

  if (best === undefined) {
    // Every attempt was aborted/empty — surface it as an aborted turn, not a silent empty answer.
    throw new GenerationAbortedError(attemptsRun);
  }

  // Option b — one bounded extra repair attempt, targeted at the exact state the serve-time coupling
  // guard would otherwise refuse: a substantive answer with zero verified citations. The normal budget
  // optimises the penalty; this rescue optimises the specific "sourceless answer" failure that the
  // penalty alone does not distinguish (a single stripped marker and an all-stripped answer can carry
  // the same penalty). Fires at most once, only on this state, so cost is +1 call on the worst case.
  if (best.assessment.penalty > 0 && isUnverifiableContentAnswer(best.attempt.text, args.chunkContentById)) {
    attemptsRun += 1;
    const rescue = await args.generate(
      buildRepairMessages(
        best.attempt.text,
        best.assessment.reason,
        best.assessment.strippedQuotes,
        userSupplied,
      ),
    );
    usage = addUsage(usage, rescue.usage);
    if (!isUnusableAttempt(rescue)) {
      const assessment = assessCitationContract(rescue.text, args.chunkContentById, userSupplied);
      // `<=` keeps the rescue on a tie: it acted on the feedback and, at equal penalty, is more likely
      // to have split the offending quote into a verifiable span.
      if (assessment.penalty <= best.assessment.penalty) {
        best = { attempt: rescue, assessment, index: budget };
      }
    }
  }

  const chosen = best;
  return {
    text: chosen.attempt.text,
    attempts: attemptsRun,
    repaired: chosen.index > 0,
    usage,
    finishReason: chosen.attempt.finishReason ?? null,
  };
}
