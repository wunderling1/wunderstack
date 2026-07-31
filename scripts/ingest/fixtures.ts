/**
 * Fixture-ingest (Fase E11). Loads the golden passages into a reserved test fund so the nightly
 * Gate B-integration can run the REAL retrieval pipeline (rewrite -> pgvector -> rerank -> assemble)
 * against them — closing the gap where Gate B only did in-memory cosine on the fixtures (audit open
 * question 5; retrieval-side divergences #3/#6/#8).
 *
 * Idempotent: keyed on a sha256 of the passages file. Re-running with unchanged passages is a no-op;
 * a change (or --force) triggers a deliberate re-embed. Ingested chunk ids are DB-generated uuids,
 * NOT the fixture ids — so the gate matches relevance on article/lid, never on chunk id (see
 * cao.eval.ts). The fixture id is kept in chunk metadata for debuggability only.
 *
 * The passages file is the single source of truth (packages/agents/src/evals/fixtures). This reads
 * it directly as a file — no module import of the heavy agents package, so no arrow-rule edge.
 *
 * Usage: pnpm --filter @wunderstack/ingest ingest:fixtures [--force]
 * Needs DATABASE_URL + SCALEWAY_API_KEY (read from repo-root .env automatically).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { embed } from "@wunderstack/ai";
import { chunks as chunksTable, closeDb, documents, eq, getDb } from "@wunderstack/db";
import { EMBEDDING_CONFIG, EVAL_FIXTURE_FUND, env } from "@wunderstack/shared";
import { z } from "zod";

import { describeDatabaseTarget, describeFailure, formatDatabaseTarget } from "./diagnostics.js";

/** Distinctive source_uri so it can never collide with a real ingested document (globally unique). */
const SOURCE_URI = `${EVAL_FIXTURE_FUND}://golden-passages.jsonl`;
const EMBED_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 200;

// Mirrors goldenPassageSchema (packages/agents/src/evals/golden-set.ts). Duplicated on purpose to
// keep this script decoupled from the agents package; these are stable fixture columns.
const passageSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  content: z.string().min(1),
  article: z.string().optional(),
  lid: z.string().optional(),
  chunkType: z.enum(["text", "table"]).default("text"),
});
type Passage = z.infer<typeof passageSchema>;

const passagesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "packages",
  "agents",
  "src",
  "evals",
  "fixtures",
  "golden-passages.jsonl",
);

/** Mirrors sourceRefFor in golden-set.ts so the assembled context anchor matches production shape. */
function sourceRefFor(passage: Passage): string | null {
  if (!passage.article) return null;
  return /^bijlage/i.test(passage.article) ? passage.article : `Artikel ${passage.article}`;
}

function parsePassages(raw: string): Passage[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split("\n").map((line) => passageSchema.parse(JSON.parse(line)));
}

async function embedAll(items: Passage[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBED_BATCH_SIZE);
    const result = await embed({
      texts: batch.map((item) => item.content),
      model: EMBEDDING_CONFIG.model,
      version: EMBEDDING_CONFIG.version,
    });
    if (result.dim !== EMBEDDING_CONFIG.dim) {
      throw new Error(
        `Embedding dim ${String(result.dim)} does not match pinned dim ` +
          `${String(EMBEDDING_CONFIG.dim)} (model ${EMBEDDING_CONFIG.model}). Re-run the bake-off.`,
      );
    }
    vectors.push(...result.embeddings);
  }
  return vectors;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: "boolean", default: false } } });
  const force = values.force ?? false;

  const raw = readFileSync(passagesPath, "utf8");
  const contentHash = createHash("sha256").update(raw).digest("hex");
  const passages = parsePassages(raw);
  if (passages.length === 0) {
    throw new Error(`No passages found in ${passagesPath}; nothing to ingest.`);
  }

  // Printed before the first query, because that is where the nightly died for eleven nights with no
  // clue as to which database it was even talking to.
  console.log(formatDatabaseTarget(describeDatabaseTarget(env.DATABASE_URL)));

  const db = getDb();
  const existing = await db
    .select({ contentHash: documents.contentHash })
    .from(documents)
    .where(eq(documents.sourceUri, SOURCE_URI))
    .limit(1);

  if (existing[0]?.contentHash === contentHash && !force) {
    console.log(
      `Fixtures unchanged (${String(passages.length)} passages, fund "${EVAL_FIXTURE_FUND}"). Nothing to ingest.`,
    );
    return;
  }

  console.log(
    `Ingesting ${String(passages.length)} golden passages into fund "${EVAL_FIXTURE_FUND}" ` +
      `(model ${EMBEDDING_CONFIG.model} @ ${String(EMBEDDING_CONFIG.dim)}).`,
  );
  const vectors = await embedAll(passages);

  await db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        fund: EVAL_FIXTURE_FUND,
        title: "Golden eval fixtures",
        sourceUri: SOURCE_URI,
        version: contentHash.slice(0, 12),
        contentHash,
      })
      .onConflictDoUpdate({
        target: documents.sourceUri,
        set: {
          fund: EVAL_FIXTURE_FUND,
          title: "Golden eval fixtures",
          version: contentHash.slice(0, 12),
          contentHash,
          ingestedAt: new Date(),
        },
      })
      .returning({ id: documents.id });

    if (!document) throw new Error("Failed to upsert the fixtures document row.");

    // Replace any prior fixture chunks for this document (a re-embed on change).
    await tx.delete(chunksTable).where(eq(chunksTable.documentId, document.id));

    const rows = passages.map((passage, index) => {
      const embedding = vectors[index];
      if (!embedding) throw new Error("Passage/vector count mismatch.");
      return {
        documentId: document.id,
        ordinal: index,
        content: passage.content,
        chapter: null,
        article: passage.article ?? null,
        lid: passage.lid ?? null,
        sourceRef: sourceRefFor(passage),
        chunkType: passage.chunkType,
        metadata: { fixtureId: passage.id },
        embedding,
        embeddingModel: EMBEDDING_CONFIG.model,
        embeddingDim: EMBEDDING_CONFIG.dim,
        embeddingVersion: EMBEDDING_CONFIG.version,
      };
    });

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await tx.insert(chunksTable).values(rows.slice(i, i + INSERT_BATCH_SIZE));
    }
  });

  console.log(`Done. ${String(passages.length)} passages ingested into fund "${EVAL_FIXTURE_FUND}".`);
}

main()
  .catch((error: unknown) => {
    console.error(describeFailure(error));
    process.exitCode = 1;
  })
  // Close the pool so the process exits (postgres.js keeps sockets open otherwise) — matters in CI.
  .finally(closeDb);
