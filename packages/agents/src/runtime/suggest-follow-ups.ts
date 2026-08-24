import { generateText } from "@wunderstack/ai";

import type { AgentUsage } from "../types.js";

/**
 * Post-answer follow-up suggestions (grounded chips). A cheap Mistral Small call that proposes
 * 2–3 natural Dutch follow-up questions answerable from the already-retrieved CAO passages.
 *
 * Pattern mirrors `condense.ts`: thin `generateText` via `@wunderstack/ai`, temperature low,
 * small maxTokens, tolerant parse + cap. Fully best-effort — any failure returns `[]` so the
 * answer stream is never broken by suggestion generation.
 */

/** EU-sovereign Small model — pinned; registered in @wunderstack/ai. */
export const FOLLOW_UP_MODEL = "mistral-small-2603";

/**
 * Bounded deadline for the suggestion call. Chips are a nicety: past this we ship the answer
 * without them rather than stall the turn between `citations` and `done`.
 */
export const FOLLOW_UP_TIMEOUT_MS = 8_000;

const MAX_QUESTIONS = 3;
const MAX_QUESTION_LENGTH = 200;
const ZERO_USAGE: AgentUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

export interface SuggestFollowUpsInput {
  /** The verified Dutch answer that was just shown to the user. */
  answer: string;
  /** Prompt-ready retrieval context (the same passages the answer was grounded on). */
  context: string;
  /** The user's original question — filtered out of suggestions so we don't re-ask it. */
  question: string;
  abortSignal?: AbortSignal;
}

export interface SuggestFollowUpsResult {
  questions: string[];
  usage: AgentUsage;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeKey(text: string): string {
  return normalizeWhitespace(text).toLowerCase().replace(/[?.!]+$/u, "");
}

function followUpSignal(caller?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(FOLLOW_UP_TIMEOUT_MS);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

/**
 * Tolerant parse: prefer a JSON array; fall back to packed `"q1","q2"` strings, then
 * one-question-per-line. Then trim, dedupe, drop the original question, and cap at
 * {@link MAX_QUESTIONS}.
 *
 * Small models often truncate the array (`maxTokens`) or omit the wrapping `[…]`. The
 * previous newline fallback then treated the whole blob as one chip, which rendered as a
 * single button containing `Vraag 1?","Vraag 2?`.
 */
export function parseFollowUpQuestions(raw: string, originalQuestion: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const candidates = collectCandidates(trimmed);
  const seen = new Set<string>();
  const originalKey = normalizeKey(originalQuestion);
  const cleaned: string[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate).slice(0, MAX_QUESTION_LENGTH);
    if (normalized.length === 0) {
      continue;
    }
    const key = normalizeKey(normalized);
    if (key.length === 0 || key === originalKey || seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push(normalized);
    if (cleaned.length >= MAX_QUESTIONS) {
      break;
    }
  }

  return cleaned;
}

function collectCandidates(trimmed: string): string[] {
  const fromJson = parseJsonQuestionArray(trimmed);
  if (fromJson !== null) {
    return fromJson.flatMap(expandPackedQuestion);
  }

  const packed = splitPackedQuotedQuestions(trimmed);
  if (packed.length > 1) {
    return packed;
  }

  return trimmed
    .split("\n")
    .map((line) => stripListLine(line))
    .filter((line) => line.length > 0)
    .flatMap(expandPackedQuestion);
}

/** Split a single string that is still a packed `"q1","q2"` blob (JSON parse yielded one element). */
function expandPackedQuestion(question: string): string[] {
  if (!question.includes('","')) {
    return [question];
  }
  const split = splitPackedQuotedQuestions(question);
  return split.length > 1 ? split : [question];
}

function parseJsonQuestionArray(text: string): string[] | null {
  const candidate = jsonArrayCandidate(text);
  if (candidate === null) {
    return null;
  }
  const parsed = parseJsonArray(candidate) ?? parseJsonArray(repairTruncatedJsonArray(candidate));
  if (parsed === null) {
    return null;
  }
  const strings = parsed.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : null;
}

function parseJsonArray(json: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Close a truncated JSON string array so `JSON.parse` can recover complete items plus the
 * last (possibly unfinished) question. Does not invent missing items.
 */
function repairTruncatedJsonArray(json: string): string {
  let repaired = json.trimEnd();
  if (repaired.endsWith("]")) {
    return repaired;
  }
  if (!repaired.endsWith('"')) {
    repaired += '"';
  }
  return `${repaired}]`;
}

function jsonArrayCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1]?.trim() ?? text).trim();
  const extracted = extractJsonArray(body);
  if (extracted !== null) {
    return extracted;
  }
  if (body.startsWith("[")) {
    return body;
  }
  if (body.includes('","')) {
    return `[${body}]`;
  }
  return null;
}

/**
 * Split a packed quoted-string blob (`"Q1?","Q2?"` or `["Q1?","Q2?"`) into bare questions.
 * Only splits on `","` so a real question that contains a comma stays intact.
 */
function splitPackedQuotedQuestions(text: string): string[] {
  const stripped = text.trim().replace(/^\[+\s*/, "").replace(/\s*\]+$/, "");
  if (!stripped.includes('","')) {
    const cleaned = stripListLine(stripped);
    return cleaned.length > 0 ? [cleaned] : [];
  }
  return stripped
    .split('","')
    .map((part) => stripListLine(part))
    .filter((part) => part.length > 0);
}

/**
 * Clean a single fallback line into a bare question. Strips a leading list marker
 * (`-`, `*`, `1.`, `1)`) and then peels JSON array/string wrapper artifacts the model
 * sometimes leaves behind — e.g. `["Vraag?"]` or `"Vraag?",` — so brackets and quotes
 * never leak into a rendered chip.
 */
function stripListLine(line: string): string {
  let text = line.trim().replace(/^[-*\d.)\s]+/, "");
  text = text.replace(/^\[+\s*/, "").replace(/\s*\]+,?$/, "");
  text = text.replace(/^"+\s*/, "").replace(/\s*"+,?$/, "");
  return text.replace(/,+$/, "").trim();
}

/** Pull a `[...]` JSON array out of free text / markdown fences, or null if none found. */
function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

/**
 * Suggest 2–3 grounded follow-up questions. Never throws — returns `{ questions: [], usage }`
 * on any failure so the answer path stays intact.
 */
export async function suggestFollowUps(input: SuggestFollowUpsInput): Promise<SuggestFollowUpsResult> {
  const answer = normalizeWhitespace(input.answer);
  const context = input.context.trim();
  const question = normalizeWhitespace(input.question);

  if (answer.length === 0 || context.length === 0) {
    return { questions: [], usage: ZERO_USAGE };
  }

  try {
    const result = await generateText({
      model: FOLLOW_UP_MODEL,
      temperature: 0.3,
      maxTokens: 280,
      abortSignal: followUpSignal(input.abortSignal),
      messages: [
        {
          role: "system",
          content: [
            "Je stelt 2 of 3 korte, natuurlijke Nederlandse vervolgvragen over een CAO.",
            "Schrijf de vragen op taalniveau B1: korte zinnen, actieve vorm en alledaagse woorden. Eén gedachte per vraag.",
            "Gebruik geen moeilijke of formele juridische formuleringen als een eenvoudiger woord hetzelfde betekent.",
            "CAO-termen die in de passages staan (zoals proeftijd of opzegtermijn) mag je wel gebruiken.",
            "De vragen moeten ALLEEN te beantwoorden zijn met de meegeleverde CAO-passages.",
            "Verzin geen onderwerpen die niet in die passages staan.",
            "Herhaal de zojuist gestelde vraag niet.",
            'Antwoord uitsluitend met een JSON-array van strings, bijvoorbeeld: ["Vraag 1?","Vraag 2?"].',
            "Geen toelichting, geen markdown.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Gestelde vraag: ${question}`,
            "",
            "Antwoord dat zojuist is gegeven:",
            "<answer>",
            answer,
            "</answer>",
            "",
            "CAO-passages (enige bron voor vervolgvragen):",
            "<passages>",
            context,
            "</passages>",
            "",
            "Formuleer 2 of 3 vervolgvragen op B1-niveau die met deze passages te beantwoorden zijn.",
          ].join("\n"),
        },
      ],
    });

    return {
      questions: parseFollowUpQuestions(result.text, question),
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch {
    return { questions: [], usage: ZERO_USAGE };
  }
}

export function addUsage(a: AgentUsage, b: AgentUsage): AgentUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
