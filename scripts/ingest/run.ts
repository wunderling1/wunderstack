/**
 * Ingestion runner (Fase 4): CAO source files -> chunks -> embeddings -> pgvector.
 *
 * The only background/batch job in v1 (see .cursor/rules/400-data-rag.mdc). Idempotent: a
 * document is keyed by source_uri and a sha256 of its parsed text. Re-running an unchanged
 * source is a no-op; a changed source replaces that document's chunks (a deliberate re-embed).
 *
 * Usage:
 *   pnpm --filter @wunderstack/ingest ingest [path] --fund <fund> --version <v>
 *   pnpm --filter @wunderstack/ingest ingest [path] --dry-run    # parse + chunk only, no DB/API
 *   pnpm --filter @wunderstack/ingest ingest [path] --force      # re-chunk + re-embed unchanged source
 *
 * `path` is a file or directory (default: scripts/ingest/input). DATABASE_URL + SCALEWAY_API_KEY
 * are read from the repo-root .env automatically (except in --dry-run).
 */

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

import { embed } from "@wunderstack/ai";
import { chunks as chunksTable, closeDb, documents, eq, getDb } from "@wunderstack/db";
import { EMBEDDING_CONFIG, env } from "@wunderstack/shared";

import { chunk, type Chunk } from "./chunk.js";
import { parseFile, SUPPORTED_EXTENSIONS } from "./parse.js";

const DEFAULT_INPUT_DIR = "input";
const EMBED_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 200;

interface CliOptions {
  inputPath: string;
  fund: string;
  version: string;
  dryRun: boolean;
  force: boolean;
}

function parseCli(): CliOptions {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      fund: { type: "string" },
      version: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  return {
    inputPath: positionals[0] ?? DEFAULT_INPUT_DIR,
    fund: values.fund ?? "demo",
    version: values.version ?? "1",
    dryRun: values["dry-run"] ?? false,
    force: values.force ?? false,
  };
}

function chunkOptionsFromEnv(): { targetChars?: number; overlapChars?: number } {
  return {
    targetChars: env.INGEST_CHUNK_CHARS,
    overlapChars: env.INGEST_OVERLAP_CHARS,
  };
}

async function listInputFiles(inputPath: string): Promise<string[]> {
  const stats = await stat(inputPath);
  const supported = (file: string): boolean =>
    (SUPPORTED_EXTENSIONS as readonly string[]).includes(extname(file).toLowerCase());

  if (stats.isDirectory()) {
    const entries = await readdir(inputPath);
    return entries
      .filter(supported)
      .sort((a, b) => a.localeCompare(b))
      .map((entry) => join(inputPath, entry));
  }
  if (!supported(inputPath)) {
    throw new Error(`Unsupported file: ${inputPath} (supported: ${SUPPORTED_EXTENSIONS.join(", ")}).`);
  }
  return [inputPath];
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function embedChunks(items: Chunk[]): Promise<number[][]> {
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

interface FileOutcome {
  sourceUri: string;
  status: "created" | "updated" | "unchanged" | "dry-run";
  chunkCount: number;
  tableChunks: number;
  structuredChunks: number;
  sampleRefs: string[];
}

function summarize(pieces: Chunk[]): Pick<FileOutcome, "tableChunks" | "structuredChunks" | "sampleRefs"> {
  const tableChunks = pieces.filter((piece) => piece.chunkType === "table").length;
  const structuredChunks = pieces.filter((piece) => piece.sourceRef !== null).length;
  const sampleRefs = [...new Set(pieces.map((piece) => piece.sourceRef).filter((ref): ref is string => ref !== null))].slice(0, 5);
  return { tableChunks, structuredChunks, sampleRefs };
}

async function ingestFile(options: CliOptions, filePath: string): Promise<FileOutcome> {
  // Namespace the source URI by fund so the same filename ingested under two funds produces two
  // distinct documents (source_uri is globally unique) instead of silently overwriting each other.
  const sourceUri = `${options.fund}/${basename(filePath)}`;
  const title = basename(filePath, extname(filePath));
  const text = await parseFile(filePath);
  const contentHash = sha256(text);
  const pieces = chunk(text, chunkOptionsFromEnv());
  const summary = summarize(pieces);

  if (options.dryRun) {
    return { sourceUri, status: "dry-run", chunkCount: pieces.length, ...summary };
  }
  if (pieces.length === 0) {
    throw new Error(`No chunks produced for ${filePath}; nothing to ingest.`);
  }

  const db = getDb();
  const existing = await db
    .select({ contentHash: documents.contentHash })
    .from(documents)
    .where(eq(documents.sourceUri, sourceUri))
    .limit(1);

  // Idempotency is keyed on the parsed SOURCE TEXT, not the chunk output. A chunker/config change
  // (same PDF) therefore looks "unchanged" and would be skipped; --force re-chunks and re-embeds.
  if (existing[0]?.contentHash === contentHash && !options.force) {
    return { sourceUri, status: "unchanged", chunkCount: pieces.length, ...summary };
  }
  const isUpdate = existing.length > 0;

  const vectors = await embedChunks(pieces);

  await db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        fund: options.fund,
        title,
        sourceUri,
        version: options.version,
        contentHash,
      })
      .onConflictDoUpdate({
        target: documents.sourceUri,
        set: {
          fund: options.fund,
          title,
          version: options.version,
          contentHash,
          ingestedAt: new Date(),
        },
      })
      .returning({ id: documents.id });

    if (!document) throw new Error("Failed to upsert document row.");

    // Replace any prior chunks for this document (a re-embed on content change).
    await tx.delete(chunksTable).where(eq(chunksTable.documentId, document.id));

    const rows = pieces.map((piece, index) => {
      const embedding = vectors[index];
      if (!embedding) throw new Error("Chunk/vector count mismatch.");
      return {
        documentId: document.id,
        ordinal: piece.ordinal,
        content: piece.content,
        chapter: piece.chapter,
        article: piece.article,
        lid: piece.lid,
        sourceRef: piece.sourceRef,
        chunkType: piece.chunkType,
        metadata: piece.metadata,
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

  return { sourceUri, status: isUpdate ? "updated" : "created", chunkCount: pieces.length, ...summary };
}

async function main(): Promise<void> {
  const options = parseCli();
  const files = await listInputFiles(options.inputPath);

  if (files.length === 0) {
    console.log(`No supported files found in ${options.inputPath}. Nothing to ingest.`);
    return;
  }

  console.log(
    `Ingesting ${String(files.length)} file(s) from ${options.inputPath}` +
      `${options.dryRun ? " (dry-run: parse + chunk only)" : ""}.` +
      `${options.dryRun ? "" : ` Embedding model: ${EMBEDDING_CONFIG.model} @ ${String(EMBEDDING_CONFIG.dim)}.`}\n`,
  );

  for (const file of files) {
    const outcome = await ingestFile(options, file);
    console.log(
      `  ${outcome.status.padEnd(9)} ${outcome.sourceUri} (${String(outcome.chunkCount)} chunks, ` +
        `${String(outcome.tableChunks)} table, ${String(outcome.structuredChunks)} with sourceRef)`,
    );
    if (outcome.sampleRefs.length > 0) {
      console.log(`             refs: ${outcome.sampleRefs.join(" | ")}`);
    }
  }

  console.log("\nDone.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // Close the pool so the process exits (postgres.js keeps sockets open otherwise) — matters in CI.
  .finally(closeDb);
