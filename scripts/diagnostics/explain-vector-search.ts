/**
 * Read-only diagnostic: EXPLAIN ANALYZE on the pgvector cosine top-k query.
 * Requires DATABASE_URL (use Scalingo db-tunnel on localhost:10000).
 *
 *   pnpm --filter @wunderstack/agents exec tsx --env-file-if-exists=../../.env ../../scripts/diagnostics/explain-vector-search.ts
 */
import { chunks, getDb, sql } from "@wunderstack/db";
import { EMBEDDING_CONFIG } from "@wunderstack/shared";

const CANDIDATE_K = 15;

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function main(): Promise<void> {
  const db = getDb();

  const [sample] = await db.select({ embedding: chunks.embedding }).from(chunks).limit(1);
  if (!sample) {
    console.log("No chunks in database — run ingest first.");
    return;
  }

  const vectorLiteral = toVectorLiteral(sample.embedding);

  const explainSql = sql.raw(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT c.id, (c.embedding <=> '${vectorLiteral}'::vector) AS distance
    FROM chunks c
    INNER JOIN documents d ON d.id = c.document_id
    ORDER BY distance ASC
    LIMIT ${String(CANDIDATE_K)}
  `);

  const rows = await db.execute(explainSql);
  console.log("=== EXPLAIN ANALYZE: cosine top-" + String(CANDIDATE_K) + " (flat search) ===");
  console.log(`Embedding model: ${EMBEDDING_CONFIG.model} @ ${String(EMBEDDING_CONFIG.dim)} dim`);
  console.log("");
  for (const row of rows) {
    const line = Object.values(row)[0];
    if (typeof line === "string") {
      console.log(line);
    }
  }

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(chunks);
  console.log("");
  console.log(`Corpus size: ${String(countRow?.count ?? 0)} chunks`);
  console.log("");
  console.log("Region notes (verify in provider consoles):");
  console.log("  Scalingo app: osc-fr1 (Paris)");
  console.log("  Scaleway API: api.scaleway.ai (EU — confirm project region matches Paris)");
  console.log("  Mistral API: api.mistral.ai (FR/EU)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
