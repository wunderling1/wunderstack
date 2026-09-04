import {
  passageLabel,
  uniqueByPassageLabel,
  uniquePassageWindow,
} from "@wunderstack/rag";

import type { AgentStreamEvent } from "../types";
import type { RetrievalOutput } from "./profile";

const RETRIEVAL_HIT_CAP = 6;

/** Build the `retrieval` NDJSON event from measured retrieval output (B1 — no invented labels). */
export function buildRetrievalStreamEvent(
  retrieval: RetrievalOutput,
  retrievalQuery: string,
  corpusVersion?: string,
): Extract<AgentStreamEvent, { type: "retrieval" }> {
  const sample =
    retrieval.progressFound[0] ??
    retrieval.chunks[0] ??
    retrieval.progressDropped[0] ??
    retrieval.droppedChunks[0];
  // Empty retrieval carries no document to name, and the UI reads this as "In de … gezocht".
  const corpusLabel = sample?.source.title ?? "bronnen";
  const version = corpusVersion ?? sample?.source.version ?? "";

  // Production retrieveContext fills progressFound/Dropped (unique headings, pre-rerank).
  // Fixtures that omit them fall back to the ranked chunks + droppedChunks and still unique.
  const hasProgress = retrieval.progressFound.length > 0 || retrieval.progressDropped.length > 0;
  const { found, dropped } = uniquePassageWindow(
    hasProgress ? retrieval.progressFound : retrieval.chunks,
    hasProgress ? retrieval.progressDropped : retrieval.droppedChunks,
  );

  // Kept passages claim the cap first. Retrieval usually drops more than it keeps, so filling
  // from the dropped list would spend all six slots on struck-through labels and report none of
  // the passages the answer is actually built on.
  const hits: { label: string; dropped: boolean }[] = [];
  for (const chunk of found) {
    if (hits.length >= RETRIEVAL_HIT_CAP) {
      break;
    }
    hits.push({ label: passageLabel(chunk), dropped: false });
  }
  for (const chunk of dropped) {
    if (hits.length >= RETRIEVAL_HIT_CAP) {
      break;
    }
    hits.push({ label: passageLabel(chunk), dropped: true });
  }

  return {
    type: "retrieval",
    corpus: { label: corpusLabel, version },
    query: retrievalQuery,
    considered: found.length + dropped.length,
    aboveThreshold: found.length,
    used: retrieval.usedPassageCount ?? uniqueByPassageLabel(retrieval.chunks).length,
    hits,
  };
}
