import { type ModelCitation } from "@wunderstack/shared";
import { z } from "zod";

import { CITATIONS_SENTINEL } from "./generation-schema";

/**
 * The model emits snake_case JSON (`chunk_id`) as instructed in the prompt; map it to the camelCase
 * `ModelCitation` contract. Accept `chunkId` too, in case a model normalizes the key.
 */
const rawModelCitationSchema = z
  .object({
    marker: z.number().int().positive(),
    chunk_id: z.string().min(1).optional(),
    chunkId: z.string().min(1).optional(),
    quote: z.string().min(1),
  })
  .transform((value) => ({
    marker: value.marker,
    chunkId: value.chunk_id ?? value.chunkId ?? "",
    quote: value.quote,
  }))
  .refine((value): value is ModelCitation => value.chunkId.length > 0, {
    message: "chunk_id is required",
  });

const modelCitationsArraySchema = z.array(rawModelCitationSchema);

/**
 * Locate the citation-block sentinel, tolerating the word the model occasionally corrupts. The prompt
 * asks for the exact `<<<CITATIONS>>>`, but on a Dutch task the model sometimes "translates" the English
 * word to a Dutch variant — `<<<CITATIES>>>`, `<<<CITATIE>>>`, `<<<CITATION>>>` (golden-set.REVIEW.md §19,
 * etd-008). The `<<<` / `>>>` fence is distinctive enough that matching any `CITATI…` word between them
 * cannot collide with answer prose, so we normalize the protocol wrapper while the quotes inside still go
 * through absolute verbatim verification — the same "normalize the wrapper, keep the content check hard"
 * principle as chunk-id and ellipsis tolerance.
 */
const SENTINEL_PATTERN = /<<<\s*CITATI[A-Z]*\s*>>>/i;

function locateSentinel(raw: string): { index: number; length: number } {
  const exact = raw.indexOf(CITATIONS_SENTINEL);
  if (exact !== -1) {
    return { index: exact, length: CITATIONS_SENTINEL.length };
  }
  const match = SENTINEL_PATTERN.exec(raw);
  return match ? { index: match.index, length: match[0].length } : { index: -1, length: 0 };
}

export interface ParsedGenerationOutput {
  /** Answer prose with `[n]` markers; sentinel, citation block, and leaked chunk_id stripped. */
  answerMarkdown: string;
  /** Raw model citations before verification (may be empty if parsing failed). */
  modelCitations: ModelCitation[];
  /** True when the citation JSON block could not be parsed. */
  citationParseFailed: boolean;
}

/**
 * Remove citation-protocol identifiers the model copies from assembled context
 * (`[n] chunk_id=<id> …`) into the user-facing running text. Users see `[n]` chips;
 * the uuid belongs only in the post-sentinel JSON.
 *
 * Matches `chunk_id=` (equals), not JSON `"chunk_id":`, so a leaked JSON array in the
 * prose is left for the citation-coupling guard instead of being silently mangled.
 *
 * The assembled-context leak is `Citaat: "…" [chunk_id=…]` as a pair. Strip that pair
 * only — a Dutch sentence that uses `Citaat: "…"` without a chunk_id is answer text,
 * not protocol, and must not be silently shortened (#21).
 */
export function stripChunkIdsFromProse(answer: string): string {
  return answer
    .replace(/[ \t]*\.?[ \t]*Citaat:\s*"[^"]*"[ \t]*\[chunk_id=[^\]]+\]/gi, "")
    .replace(/[ \t]*\[chunk_id=[^\]]+\]/gi, "")
    .replace(/[ \t]*\bchunk_id=[A-Za-z0-9._-]+/gi, "")
    .replace(/ +([.,;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?<=\S) {2,}/g, " ")
    .trimEnd();
}

/**
 * Split streamed/full model output into answer prose and the trailing citation JSON block.
 * Everything before the sentinel is answer text; everything after is parsed as JSON citations.
 */
export function parseGenerationOutput(raw: string): ParsedGenerationOutput {
  const sentinel = locateSentinel(raw);
  if (sentinel.index === -1) {
    return {
      answerMarkdown: stripChunkIdsFromProse(raw.trimEnd()),
      modelCitations: [],
      citationParseFailed: true,
    };
  }

  const answerMarkdown = stripChunkIdsFromProse(raw.slice(0, sentinel.index).trimEnd());
  const afterSentinel = raw.slice(sentinel.index + sentinel.length).trim();

  if (afterSentinel.length === 0) {
    return { answerMarkdown, modelCitations: [], citationParseFailed: true };
  }

  try {
    const jsonText = extractJsonArray(afterSentinel);
    const parsed = modelCitationsArraySchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      return { answerMarkdown, modelCitations: [], citationParseFailed: true };
    }
    return { answerMarkdown, modelCitations: parsed.data, citationParseFailed: false };
  } catch {
    return { answerMarkdown, modelCitations: [], citationParseFailed: true };
  }
}

/**
 * Pull the first *balanced* JSON array from trailing model output.
 *
 * A first-`[`/last-`]` span breaks whenever the model appends anything after the array — a stray
 * empty `[]`, a lone `]`, or several arrays in a row — which small models do often; the span then
 * spans invalid JSON and the whole citation block is discarded. Instead we bracket-depth scan from
 * the first `[` and return as soon as depth returns to zero, ignoring any trailing tokens. Brackets
 * inside string literals are skipped so a quote containing `[`/`]` cannot end the array early.
 *
 * Conservative recovery (Gate C close-out, etd-012): when the scan ends with depth > 0 *outside* a
 * string — the model dropped the closing `]` after a complete object — append the missing brackets
 * and only accept the result if `JSON.parse` then succeeds. Mid-string / mid-object truncation still
 * throws (`citationParseFailed`). Recovered citations still go through absolute verbatim verification;
 * recovery is a parse-layer fix, never a verification exemption.
 */
function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  if (start === -1) {
    throw new Error("No JSON array in citation block");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // Unbalanced: attempt a conservative close only when we are outside a string (objects fully closed).
  if (!inString && depth > 0) {
    const recovered = text.slice(start) + "]".repeat(depth);
    try {
      JSON.parse(recovered);
      return recovered;
    } catch {
      // Fall through to the throw below — mid-object / mid-string truncation is not recoverable.
    }
  }

  throw new Error("No balanced JSON array in citation block");
}

/**
 * Stream-safe splitter: given accumulated text, return the portion safe to emit as answer deltas
 * (never including a partial sentinel or the citation block).
 */
export function splitStreamBuffer(buffer: string): { emit: string; hold: string } {
  const sentinelIndex = buffer.indexOf(CITATIONS_SENTINEL);
  if (sentinelIndex !== -1) {
    return { emit: buffer.slice(0, sentinelIndex), hold: buffer.slice(sentinelIndex) };
  }

  // Hold a suffix that could be the start of the sentinel so we never leak partial markers.
  const maxHold = CITATIONS_SENTINEL.length - 1;
  for (let holdLen = Math.min(maxHold, buffer.length); holdLen > 0; holdLen--) {
    const suffix = buffer.slice(-holdLen);
    if (CITATIONS_SENTINEL.startsWith(suffix)) {
      return {
        emit: buffer.slice(0, buffer.length - holdLen),
        hold: suffix,
      };
    }
  }

  return { emit: buffer, hold: "" };
}

export { CITATIONS_SENTINEL };
