/**
 * Read-only diagnostic: EXPLAIN ANALYZE on the pgvector cosine top-k query.
 * Requires DATABASE_URL (use Scalingo db-tunnel on localhost:10000).
 *
 *   pnpm --filter @wunderstack/agents exec tsx --env-file-if-exists=../../.env ../../scripts/diagnostics/explain-vector-search.ts -- --fund elektronische-detailhandel
 */
import { parseArgs } from "node:util";

import { chunks, closeDb, sql, withFundSchema } from "@wunderstack/db";
import { EMBEDDING_CONFIG } from "@wunderstack/shared";

const CANDIDATE_K = 15;
const DEFAULT_FUND = "elektronische-detailhandel";

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { fund: { type: "string", default: DEFAULT_FUND } },
    strict: true,
    allowPositionals: true,
  });
  const fund = values.fund ?? DEFAULT_FUND;

  await withFundSchema(fund, async (db) => {
    const [sample] = await db.select({ embedding: chunks.embedding }).from(chunks).limit(1);
    if (!sample) {
      console.log(`No chunks in fund schema "${fund}" — run ingest first.`);
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
    console.log(`Fund: ${fund}`);
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
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
