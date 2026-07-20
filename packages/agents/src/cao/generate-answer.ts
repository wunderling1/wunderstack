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
}

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

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
      return { penalty: 0, reason: "" };
    }
    return {
      penalty: PENALTY_PARSE_FAILED,
      reason: "het citatieblok na de sentinel ontbrak of was geen geldige JSON-array",
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

  return { penalty, reason: reasons.join("; ") };
}

function buildRepairMessages(previous: string, reason: string): ChatMessage[] {
  return [
    { role: "assistant", content: previous },
    {
      role: "user",
      content: [
        `Je vorige antwoord voldeed niet aan het citatie-contract: ${reason}.`,
        "Herschrijf je volledige antwoord op basis van UITSLUITEND de eerder gegeven context.",
        "Onderbouw elke feitelijke bewering met een [n]-verwijzing én een woordelijk (verbatim) citaat in",
        "het citatieblok na de sentinel. Voeg geen [n]-verwijzing toe zonder bijbehorend geverifieerd citaat.",
        // etd-021: the model paraphrased the quote head and hyphenated the chunk_id. Force character-
        // for-character copy of both so the repair turn cannot "fix" the contract by rewording.
        "Kopieer elk citaat KARAKTER VOOR KARAKTER uit de context — geen herformulering, geen synoniemen,",
        "geen weglating van woorden. Gebruik exact de chunk_id zoals die in de context staat (geen koppeltekens",
        "of spaties toevoegen of weglaten).",
        // Long verbatim spans are where the copy breaks; a short exact fragment is far more reliable.
        "Houd elk citaat ZO KORT MOGELIJK: kies het kortste aaneengesloten fragment dat het feit dekt (een",
        "paar woorden of één deelzin), en begin het bij een woord dat letterlijk in de passage staat —",
        "neem geen inleidende woorden mee die je zou moeten aanpassen (lidwoord, hoofdletter).",
        // naar-rato escape hatch (golden-set.REVIEW.md §15): once a self-computed pro-rata TOTAL is
        // flagged as ungrounded, the model must NOT fall back to a blanket refusal — that turns a fixable
        // deferral into over-refusal (etd-d03). Offer the grounded middle path explicitly, above the
        // NOT_FOUND fallback, so a deeltijd/pro-rata question is answered, not refused.
        "Gaat het om een zelf te berekenen deeltijd- of pro-rata-uitkomst (bijvoorbeeld vakantie-uren naar",
        "rato)? Verzin dan GEEN totaal, maar weiger ook NIET: noem de wél vermelde gegevens (zoals het",
        "fulltime-aantal en de regel dat het naar rato geldt) mét [n], en verwijs voor het exacte getal naar",
        "het fonds. Dat is een geldig, gegrond antwoord — geef dat in plaats van NOT_FOUND.",
        `Staat er echt niets bruikbaars in de context? Antwoord dan EXACT met: "${NOT_FOUND_MESSAGE}" en een lege citatie-array [].`,
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
      best === undefined ? [] : buildRepairMessages(best.attempt.text, best.assessment.reason);
    const attempt = await args.generate(extraMessages);
    usage = addUsage(usage, attempt.usage);
    const assessment = assessCitationContract(attempt.text, args.chunkContentById, userSupplied);

    // `<=` so a later attempt wins ties (it acted on the feedback); strict improvements always win.
    if (best === undefined || assessment.penalty <= best.assessment.penalty) {
      best = { attempt, assessment, index };
    }
    if (best.assessment.penalty === 0) {
      break;
    }
  }

  const chosen = best as { attempt: AnswerAttempt; assessment: ContractAssessment; index: number };
  return {
    text: chosen.attempt.text,
    attempts: attemptsRun,
    repaired: chosen.index > 0,
    usage,
    finishReason: chosen.attempt.finishReason ?? null,
  };
}
