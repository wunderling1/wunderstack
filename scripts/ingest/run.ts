/**
 * Ingestion runner (Fase 4): CAO source files -> chunks -> embeddings -> pgvector.
 *
 * The only background/batch job in v1 (see .cursor/rules/400-data-rag.mdc). Idempotent: a
 * document is keyed by source_uri and a sha256 of its parsed text. Re-running an unchanged
 * source is a no-op; a changed source replaces that document's chunks (a deliberate re-embed).
 *
 * Usage:
 *   pnpm --filter @wunderstack/ingest ingest [path] --fund <fund> --agent <key> --version <v>
 *   pnpm --filter @wunderstack/ingest ingest [path] --dry-run    # parse + chunk only, no DB/API
 *   pnpm --filter @wunderstack/ingest ingest [path] --force      # re-chunk + re-embed unchanged source
 *   pnpm --filter @wunderstack/ingest ingest [path] --prune      # input IS the fund's whole corpus
 *
 * `path` is a file or directory (default: scripts/ingest/input). DATABASE_URL + SCALEWAY_API_KEY
 * are read from the repo-root .env automatically (except in --dry-run).
 */

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { embed } from "@wunderstack/ai";
import { and, chunks as chunksTable, closeDb, documents, eq, getDb, inArray, sql } from "@wunderstack/db";
import { EMBEDDING_CONFIG, env } from "@wunderstack/shared";

import { chunk, type Chunk } from "./chunk.js";
import { describeFailure } from "./diagnostics.js";
import { parseFile, SUPPORTED_EXTENSIONS } from "./parse.js";
import { reportAfterIngest } from "./report.js";

const DEFAULT_INPUT_DIR = "input";
const EMBED_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 200;

interface CliOptions {
  inputPath: string;
  fund: string;
  agentKey: string;
  version: string;
  dryRun: boolean;
  force: boolean;
  /** Treat the input set as the fund's COMPLETE corpus and retract anything else it still holds. */
  prune: boolean;
  /** Filename suffix for the structure report, so a before/after pair on one day stays distinguishable. */
  label?: string;
}

function parseCli(): CliOptions {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      fund: { type: "string" },
      agent: { type: "string" },
      version: { type: "string" },
      label: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      prune: { type: "boolean", default: false },
    },
  });
  if (!values.agent) {
    throw new Error("--agent <key> is required (e.g. cao).");
  }
  return {
    inputPath: positionals[0] ?? DEFAULT_INPUT_DIR,
    fund: values.fund ?? "demo",
    agentKey: values.agent,
    version: values.version ?? "1",
    dryRun: values["dry-run"] ?? false,
    force: values.force ?? false,
    prune: values.prune ?? false,
    ...(values.label ? { label: values.label } : {}),
  };
}

function chunkOptionsFromEnv(): { targetChars?: number; overlapChars?: number } {
  return {
    targetChars: env.INGEST_CHUNK_CHARS,
    overlapChars: env.INGEST_OVERLAP_CHARS,
  };
}

/**
 * Documentation that lives next to a corpus is not corpus. A README in the input directory would
 * otherwise become retrievable chunks the agent can cite as if they were CAO text. Only applies to a
 * directory scan: naming a file explicitly is an explicit instruction and is honoured as given.
 */
const NON_CORPUS_FILE = /^readme(\.|$)/i;

export function isCorpusFile(fileName: string): boolean {
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extname(fileName).toLowerCase())) return false;
  return !NON_CORPUS_FILE.test(fileName);
}

async function listInputFiles(inputPath: string): Promise<string[]> {
  const stats = await stat(inputPath);
  const supported = (file: string): boolean =>
    (SUPPORTED_EXTENSIONS as readonly string[]).includes(extname(file).toLowerCase());

  if (stats.isDirectory()) {
    const entries = await readdir(inputPath);
    for (const entry of entries.filter((file) => supported(file) && !isCorpusFile(file)).sort()) {
      console.log(`  skipped   ${entry} (documentation, not corpus)`);
    }
    return entries
      .filter(isCorpusFile)
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
  /** Kept so a dry-run can still be measured by the structure report (nothing was stored to read back). */
  pieces: Chunk[];
}

function summarize(pieces: Chunk[]): Pick<FileOutcome, "tableChunks" | "structuredChunks" | "sampleRefs"> {
  const tableChunks = pieces.filter((piece) => piece.chunkType === "table").length;
  const structuredChunks = pieces.filter((piece) => piece.sourceRef !== null).length;
  const sampleRefs = [...new Set(pieces.map((piece) => piece.sourceRef).filter((ref): ref is string => ref !== null))].slice(0, 5);
  return { tableChunks, structuredChunks, sampleRefs };
}

function chunkForAgent(agentKey: string, text: string, options: ReturnType<typeof chunkOptionsFromEnv>): Chunk[] {
  if (agentKey === "cao") return chunk(text, options);
  throw new Error(`Unknown ingest agent "${agentKey}" — expected cao.`);
}

async function ingestFile(options: CliOptions, filePath: string): Promise<FileOutcome> {
  // Namespace the source URI by fund so the same filename ingested under two funds produces two
  // distinct documents (source_uri is globally unique) instead of silently overwriting each other.
  const sourceUri = `${options.fund}/${basename(filePath)}`;
  const title = basename(filePath, extname(filePath));
  const text = await parseFile(filePath);
  const contentHash = sha256(text);
  const pieces = chunkForAgent(options.agentKey, text, chunkOptionsFromEnv());
  const summary = summarize(pieces);

  if (options.dryRun) {
    return { sourceUri, status: "dry-run", chunkCount: pieces.length, pieces, ...summary };
  }
  if (pieces.length === 0) {
    throw new Error(`No chunks produced for ${filePath}; nothing to ingest.`);
  }

  const db = getDb();
  const existing = await db
    .select({ contentHash: documents.contentHash })
    .from(documents)
    .where(and(eq(documents.sourceUri, sourceUri), eq(documents.agentKey, options.agentKey)))
    .limit(1);

  // Idempotency is keyed on the parsed SOURCE TEXT, not the chunk output. A chunker/config change
  // (same PDF) therefore looks "unchanged" and would be skipped; --force re-chunks and re-embeds.
  if (existing[0]?.contentHash === contentHash && !options.force) {
    return { sourceUri, status: "unchanged", chunkCount: pieces.length, pieces, ...summary };
  }
  const isUpdate = existing.length > 0;

  const vectors = await embedChunks(pieces);

  await db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        fund: options.fund,
        agentKey: options.agentKey,
        title,
        sourceUri,
        version: options.version,
        contentHash,
      })
      .onConflictDoUpdate({
        target: [documents.agentKey, documents.sourceUri],
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

  return { sourceUri, status: isUpdate ? "updated" : "created", chunkCount: pieces.length, pieces, ...summary };
}

interface PrunedDocument {
  sourceUri: string;
  chunkCount: number;
}

/**
 * Whether a held document row should be retracted when pruning a (fund, agent_key) corpus.
 * Exported for unit tests — prune must never touch another agent's rows on the same fund.
 */
export function isPruneCandidate(
  doc: { fund: string; agentKey: string; sourceUri: string },
  fund: string,
  agentKey: string,
  keptSourceUris: Set<string>,
): boolean {
  return doc.fund === fund && doc.agentKey === agentKey && !keptSourceUris.has(doc.sourceUri);
}

/**
 * Retract documents of this fund+agent that the current input set does not contain.
 *
 * Off by default, because an ingest is normally an ADDITION to a fund's corpus. With --prune the
 * caller states that the input IS the fund's complete corpus — which is what a corpus replacement
 * needs. Without it, a CAO republished under a new filename leaves the previous edition silently
 * retrievable next to the new one (found in the demo fund on 2026-07-30, see
 * docs/eval/ingest/FINDING-demo-corpus-mismatch-2026-07-30.md).
 *
 * Chunks go with the document row via the schema's ON DELETE CASCADE.
 */
async function pruneFund(fund: string, agentKey: string, keptSourceUris: string[]): Promise<PrunedDocument[]> {
  const db = getDb();
  const held = await db
    .select({
      id: documents.id,
      sourceUri: documents.sourceUri,
      fund: documents.fund,
      agentKey: documents.agentKey,
    })
    .from(documents)
    .where(and(eq(documents.fund, fund), eq(documents.agentKey, agentKey)));

  const kept = new Set(keptSourceUris);
  const stale = held.filter((doc) => isPruneCandidate(doc, fund, agentKey, kept));
  if (stale.length === 0) return [];

  const staleIds = stale.map((doc) => doc.id);
  const counts = await db
    .select({ documentId: chunksTable.documentId, count: sql<number>`count(*)::int` })
    .from(chunksTable)
    .where(inArray(chunksTable.documentId, staleIds))
    .groupBy(chunksTable.documentId);
  const countByDocument = new Map(counts.map((row) => [row.documentId, row.count]));

  await db.delete(documents).where(and(eq(documents.fund, fund), eq(documents.agentKey, agentKey), inArray(documents.id, staleIds)));

  return stale.map((doc) => ({
    sourceUri: doc.sourceUri,
    chunkCount: countByDocument.get(doc.id) ?? 0,
  }));
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

  const produced: Chunk[] = [];
  const ingestedSourceUris: string[] = [];
  for (const file of files) {
    const outcome = await ingestFile(options, file);
    produced.push(...outcome.pieces);
    ingestedSourceUris.push(outcome.sourceUri);
    console.log(
      `  ${outcome.status.padEnd(9)} ${outcome.sourceUri} (${String(outcome.chunkCount)} chunks, ` +
        `${String(outcome.tableChunks)} table, ${String(outcome.structuredChunks)} with sourceRef)`,
    );
    if (outcome.sampleRefs.length > 0) {
      console.log(`             refs: ${outcome.sampleRefs.join(" | ")}`);
    }
  }

  if (options.prune && !options.dryRun) {
    const pruned = await pruneFund(options.fund, options.agentKey, ingestedSourceUris);
    for (const doc of pruned) {
      console.log(`  retracted ${doc.sourceUri} (${String(doc.chunkCount)} chunks removed)`);
    }
    if (pruned.length === 0) {
      console.log(`  retracted nothing: fund "${options.fund}" held no documents outside this input set.`);
    }
  } else if (options.prune) {
    console.log("  --prune ignored in a dry-run (nothing is stored, so nothing can be retracted).");
  }

  // Structure report (visibility, never a gate): a corpus that loses its anchors must not be able to
  // pass unnoticed. A failure to write the report may not fail the ingest itself.
  try {
    await reportAfterIngest({
      fund: options.fund,
      dryRun: options.dryRun,
      chunks: produced,
      ...(options.label ? { label: options.label } : {}),
    });
  } catch (error: unknown) {
    console.warn(`\n  warning: structure report failed (${error instanceof Error ? error.message : String(error)}).`);
  }

  console.log("\nDone.");
}

// Only run when invoked as the CLI, so unit tests can import the pure helpers above without
// triggering an actual ingest.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  main()
    .catch((error: unknown) => {
      console.error(describeFailure(error));
      process.exitCode = 1;
    })
    // Close the pool so the process exits (postgres.js keeps sockets open otherwise) — matters in CI.
    .finally(closeDb);
}
