import { embed } from "@wunderstack/ai";
import { chunks, cosineDistance, documents, eq, getDb, sql } from "@wunderstack/db";
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
   * How many chunks to fetch from pgvector as rerank candidates. Defaults to the pinned
   * RERANK_CONFIG.candidateK (20). The rerank step trims to `topK`.
   */
  candidateK: z.number().int().positive().max(50).optional(),
  /** How many chunks to keep after reranking (fed to assemble). Defaults to RERANK_CONFIG.topK (5). */
  topK: z.number().int().positive().max(50).optional(),
  /** Restrict to a single O&O fund's CAO (control/data-plane key). Omit to search all. */
  fund: z.string().min(1).optional(),
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
  version: string;
}

export interface RetrievedChunk {
  chunkId: string;
  ordinal: number;
  content: string;
  /** Cosine similarity in [0,1] (1 = identical); higher is more relevant. */
  score: number;
  source: RetrievedChunkSource;
  metadata: Record<string, unknown>;
}

async function embedQuery(query: string): Promise<number[]> {
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
  const { query, fund, minScore } = input;
  const config = requireRerankConfig();
  const candidateK = input.candidateK ?? config.candidateK;
  const queryVector = await embedQuery(query);
  const db = getDb();

  // pgvector cosine distance = 1 - cosine similarity (0 = identical). The 4096-dim column has
  // no ANN index (exceeds pgvector's 2000-dim limit, see schema.ts), so this is an exact scan
  // ordered by distance ascending: cost grows linearly with the corpus. Fine for the demo; a
  // larger corpus needs a re-embed to <=2000 dim (or a dim-reduction step) to enable an hnsw index
  // — a deliberate re-embed migration, not a silent change (see .cursor/rules/400-data-rag.mdc).
  const distance = cosineDistance(chunks.embedding, queryVector);

  const rows = await db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      ordinal: chunks.ordinal,
      content: chunks.content,
      metadata: chunks.metadata,
      title: documents.title,
      sourceUri: documents.sourceUri,
      fund: documents.fund,
      version: documents.version,
      distance: sql<number>`${distance}`,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(fund === undefined ? undefined : eq(documents.fund, fund))
    .orderBy(distance)
    .limit(candidateK);

  return rows
    .map((row) => ({
      chunkId: row.chunkId,
      ordinal: row.ordinal,
      content: row.content,
      // Driver returns numeric as string; coerce and convert distance -> similarity.
      score: 1 - Number(row.distance),
      source: {
        documentId: row.documentId,
        title: row.title,
        sourceUri: row.sourceUri,
        fund: row.fund,
        version: row.version,
      },
      metadata: row.metadata,
    }))
    .filter((hit) => hit.score >= minScore);
}
