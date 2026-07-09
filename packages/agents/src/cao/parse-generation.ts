import { type ModelCitation } from "@wunderstack/shared";
import { z } from "zod";

import { CITATIONS_SENTINEL } from "./generation-schema.js";

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

export interface ParsedGenerationOutput {
  /** Answer prose with `[n]` markers; sentinel and citation block stripped. */
  answerMarkdown: string;
  /** Raw model citations before verification (may be empty if parsing failed). */
  modelCitations: ModelCitation[];
  /** True when the citation JSON block could not be parsed. */
  citationParseFailed: boolean;
}

/**
 * Split streamed/full model output into answer prose and the trailing citation JSON block.
 * Everything before the sentinel is answer text; everything after is parsed as JSON citations.
 */
export function parseGenerationOutput(raw: string): ParsedGenerationOutput {
  const sentinelIndex = raw.indexOf(CITATIONS_SENTINEL);
  if (sentinelIndex === -1) {
    return {
      answerMarkdown: raw.trimEnd(),
      modelCitations: [],
      citationParseFailed: true,
    };
  }

  const answerMarkdown = raw.slice(0, sentinelIndex).trimEnd();
  const afterSentinel = raw.slice(sentinelIndex + CITATIONS_SENTINEL.length).trim();

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

/** Pull the first JSON array from trailing model output (tolerates stray whitespace/newlines). */
function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON array in citation block");
  }
  return text.slice(start, end + 1);
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
