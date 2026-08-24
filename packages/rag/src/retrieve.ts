import { embed } from "@wunderstack/ai";
import {
  chunks,
  cosineDistance,
  documents,
  and,
  eq,
  sql,
  fundSchemaName,
  withSearchPath,
  type Database,
} from "@wunderstack/db";
import { EMBEDDING_CONFIG } from "@wunderstack/shared";
import { requireRerankConfig } from "@wunderstack/shared";
import { z } from "zod";

/**
 * Retrieval step of the RAG pipeline (Fase 5): query -> pgvector top-k chunks + source metadata.
 *
 * The query is embedded with the exact same pinned model + dimension as the corpus
 * (EMBEDDING_CONFIG, decided by the Fase 3 bake-off), so query and stored vectors live in the
 * same space. All DB access goes through the @wunderstack/db seam (see 400-data-rag.mdc); this
 * package never touches drizzle-orm directly.
 */

export const retrieveInputSchema = z.object({
  query: z.string().min(1, "query must not be empty"),
  /**
   * Extra retrieval queries whose candidate pools are unioned with `query` before reranking.
   * Follow-up turns pass a history-aware fallback here so a single bad condensation cannot miss the
   * relevant chunk.
   */
  additionalQueries: z.array(z.string().min(1)).max(2).optional(),
  /**
   * How many chunks to fetch from pgvector as rerank candidates. Defaults to the pinned
   * RERANK_CONFIG.candidateK (15). The rerank step trims to `topK`.
   */
  candidateK: z.number().int().positive().max(50).optional(),
  /** How many chunks to keep after reranking (fed to assemble). Defaults to RERANK_CONFIG.topK (5). */
  topK: z.number().int().positive().max(50).optional(),
  /** Restrict to a single O&O fund (control/data-plane key). Required on the agent path. */
  fund: z.string().min(1),
  /** Corpus agent key (e.g. cao | arbo). Required — no default; callers must scope explicitly. */
  agentKey: z.string().min(1),
  /**
   * Minimum cosine similarity in [0,1] a chunk must reach to be kept. This is the seed of the
   * "say not found instead of hallucinating" guard the agent enforces in Fase 6; default 0
   * keeps everything so the caller can decide the threshold.
   */
  minScore: z.number().min(0).max(1).default(0),
});

export type RetrieveInput = z.input<typeof retrieveInputSchema>;
/** Input after Zod parsing (defaults applied). The pipeline passes this to avoid re-parsing. */
export type ParsedRetrieveInput = z.output<typeof retrieveInputSchema>;

export interface RetrievedChunkSource {
  documentId: string;
  title: string;
  sourceUri: string;
  fund: string;
  agentKey: string;
  /** Physical schema SET LOCAL used for this search. Evidence, not a caller-supplied label. */
  schemaName: string;
  version: string;
}

/** CAO structure metadata from Fase 10 ingestion, surfaced for citations (Fase 11). */
export interface RetrievedChunkStructure {
  chapter: string | null;
  article: string | null;
  lid: string | null;
  sourceRef: string | null;
  chunkType: string;
}

export interface RetrievedChunk {
  chunkId: string;
  ordinal: number;
  content: string;
  /** Cosine similarity in [0,1] (1 = identical); higher is more relevant. */
  score: number;
  source: RetrievedChunkSource;
  structure: RetrievedChunkStructure;
  metadata: Record<string, unknown>;
}

export async function embedQuery(query: string): Promise<number[]> {
  const result = await embed({
    texts: [query],
    model: EMBEDDING_CONFIG.model,
    version: EMBEDDING_CONFIG.version,
  });
  if (result.dim !== EMBEDDING_CONFIG.dim) {
    throw new Error(
      `Query embedding dim ${String(result.dim)} does not match pinned dim ` +
        `${String(EMBEDDING_CONFIG.dim)} (model ${EMBEDDING_CONFIG.model}). Re-run the bake-off.`,
    );
  }
  const [vector] = result.embeddings;
  if (!vector) {
    throw new Error("Embedding provider returned no vector for the query.");
  }
  return vector;
}

export async function retrieve(input: RetrieveInput): Promise<RetrievedChunk[]> {
  return retrieveValidated(retrieveInputSchema.parse(input));
}

/**
 * Retrieval on already-validated input. `retrieveContext` (index.ts) calls this directly so the
 * pipeline parses the input exactly once; the public `retrieve` above validates then delegates here.
 */
export async function retrieveValidated(input: ParsedRetrieveInput): Promise<RetrievedChunk[]> {
  const { chunks } = await retrieveValidatedTimed(input);
  return chunks;
}

export interface RetrievePhaseTimings {
  embedMs: number;
  searchMs: number;
}

export interface RetrieveFromVectorInput {
  fund: string;
  agentKey: string;
  minScore?: number;
  candidateK?: number;
  /**
   * Physical schema to resolve unqualified `documents`/`chunks` against (track B:
   * organizational search_path via SET LOCAL in a transaction). Omit to use
   * `fund_<fund>` (with `public` still on the path for pgvector operators).
   * Do not mix fund schemas.
   */
  searchPath?: string;
}

/**
 * Physical schema SET LOCAL will use. Hits report this as `source.schemaName` — callers cannot
 * assign a different label than the path that was searched.
 */
export function searchPathForRetrieve(input: { fund: string; searchPath?: string }): string {
  return input.searchPath ?? fundSchemaName(input.fund);
}

/**
 * Exact (flat) pgvector search with a precomputed query vector. Used by the PR3
 * copy-identity measurement so `public` and `fund_<key>` see the same embedding.
 * No rewrite, no rerank, no sibling expansion.
 */
export async function retrieveFromVector(
  queryVector: number[],
  input: RetrieveFromVectorInput,
): Promise<{ chunks: RetrievedChunk[]; searchMs: number }> {
  const config = requireRerankConfig();
  const candidateK = input.candidateK ?? config.candidateK;
  const minScore = input.minScore ?? 0;
  const schemaName = searchPathForRetrieve(input);
  const params = { fund: input.fund, agentKey: input.agentKey, candidateK, minScore, schemaName };

  return withSearchPath(schemaName, (tx) => searchByVector(tx, queryVector, params));
}

/** Retrieval with per-phase timings for Langfuse latency budgets. */
export async function retrieveValidatedTimed(
  input: ParsedRetrieveInput,
): Promise<{ chunks: RetrievedChunk[]; timings: RetrievePhaseTimings }> {
  const embedStart = performance.now();
  const queryVector = await embedQuery(input.query);
  const embedMs = performance.now() - embedStart;

  const { chunks: hits, searchMs } = await retrieveFromVector(queryVector, input);
  return { chunks: hits, timings: { embedMs, searchMs } };
}

async function searchByVector(
  db: Pick<Database, "select">,
  queryVector: number[],
  input: { fund: string; agentKey: string; minScore: number; candidateK: number; schemaName: string },
): Promise<{ chunks: RetrievedChunk[]; searchMs: number }> {
  const { fund, agentKey, minScore, candidateK, schemaName } = input;
  const distance = cosineDistance(chunks.embedding, queryVector);

  const searchStart = performance.now();
  const rows = await db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      ordinal: chunks.ordinal,
      content: chunks.content,
      metadata: chunks.metadata,
      chapter: chunks.chapter,
      article: chunks.article,
      lid: chunks.lid,
      sourceRef: chunks.sourceRef,
      chunkType: chunks.chunkType,
      title: documents.title,
      sourceUri: documents.sourceUri,
      fund: documents.fund,
      agentKey: documents.agentKey,
      version: documents.version,
      distance: sql<number>`${distance}`,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(documents.fund, fund), eq(documents.agentKey, agentKey)))
    .orderBy(distance)
    .limit(candidateK);
  const searchMs = performance.now() - searchStart;

  const mapped = rows
    .map((row) => ({
      chunkId: row.chunkId,
      ordinal: row.ordinal,
      content: row.content,
      score: 1 - Number(row.distance),
      source: {
        documentId: row.documentId,
        title: row.title,
        sourceUri: row.sourceUri,
        fund: row.fund,
        agentKey: row.agentKey,
        schemaName,
        version: row.version,
      },
      structure: {
        chapter: row.chapter,
        article: row.article,
        lid: row.lid,
        sourceRef: row.sourceRef,
        chunkType: row.chunkType,
      },
      metadata: row.metadata,
    }))
    .filter((hit) => hit.score >= minScore);

  return { chunks: mapped, searchMs };
}
