import { deriveChunkHeading, type RetrievedChunk } from "@wunderstack/rag";

import type { AgentStreamEvent } from "../types";
import type { RetrievalOutput } from "./profile";

const RETRIEVAL_HIT_CAP = 6;

/** Build the `retrieval` NDJSON event from measured retrieval output (B1 — no invented labels). */
export function buildRetrievalStreamEvent(
  retrieval: RetrievalOutput,
  retrievalQuery: string,
  corpusVersion?: string,
): Extract<AgentStreamEvent, { type: "retrieval" }> {
  const sample = retrieval.chunks[0] ?? retrieval.droppedChunks[0];
  const corpusLabel = sample?.source.title ?? "Corpus";
  const version = corpusVersion ?? sample?.source.version ?? "";

  // Kept passages claim the cap first. Retrieval usually drops more than it keeps, so filling
  // from the dropped list would spend all six slots on struck-through labels and report none of
  // the passages the answer is actually built on.
  const hits: { label: string; dropped: boolean }[] = [];
  for (const chunk of retrieval.chunks) {
    if (hits.length >= RETRIEVAL_HIT_CAP) {
      break;
    }
    hits.push({ label: labelForChunk(chunk), dropped: false });
  }
  for (const chunk of retrieval.droppedChunks) {
    if (hits.length >= RETRIEVAL_HIT_CAP) {
      break;
    }
    hits.push({ label: labelForChunk(chunk), dropped: true });
  }

  return {
    type: "retrieval",
    corpus: { label: corpusLabel, version },
    query: retrievalQuery,
    considered: retrieval.consideredCount,
    aboveThreshold: retrieval.aboveThresholdCount,
    hits,
  };
}

function labelForChunk(chunk: RetrievedChunk): string {
  return deriveChunkHeading(chunk) ?? chunk.source.title;
}
