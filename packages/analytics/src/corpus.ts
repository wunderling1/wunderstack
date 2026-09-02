import { createHash } from "node:crypto";

import { chunks, desc, documents, eq, sql, withFundSchema, type Database } from "@wunderstack/db";

export interface CorpusDocRow {
  title: string;
  sourceUri: string;
  fund: string;
  /** Which agent's corpus this document belongs to — cao and arbo do not share a version. */
  agentKey: string;
  version: string;
  /** sha256 of the parsed source text; part of the corpus fingerprint. */
  contentHash: string;
  ingestedAt: Date;
  chunkCount: number;
}

export const CORPUS_FINGERPRINT_LENGTH = 12;

/**
 * One value for the corpus an agent stands on (DECISION-dashboard-indeling.md, A5).
 *
 * A document version is not a corpus version: with more than one document, picking one of them
 * says nothing about the rest. This covers the whole set, so it moves when a document is added,
 * re-versioned or re-ingested with changed content — and only then. Sorted on `sourceUri` so the
 * value does not depend on query order.
 *
 * Returns null for an empty corpus: there is nothing to approve, which is not the same as a
 * fingerprint of nothing.
 */
export function corpusFingerprint(docs: CorpusDocRow[]): string | null {
  if (docs.length === 0) return null;
  const agentKey = docs[0]?.agentKey ?? "";
  const material = [
    agentKey,
    ...[...docs]
      .sort((a, b) => a.sourceUri.localeCompare(b.sourceUri))
      .map((doc) => `${doc.sourceUri}\n${doc.version}\n${doc.contentHash}`),
  ].join("\n\n");
  return createHash("sha256").update(material).digest("hex");
}

/** Short label for UI — full hash is stored on new pins. */
export function corpusFingerprintDisplay(fingerprint: string): string {
  return fingerprint.slice(0, CORPUS_FINGERPRINT_LENGTH);
}

/** Legacy 12-char pins still match the full hash prefix. */
export function corpusFingerprintMatchesPinned(
  fingerprint: string | null,
  pinnedReleaseTag: string | null,
): boolean {
  if (fingerprint === null || pinnedReleaseTag === null) return false;
  if (pinnedReleaseTag === fingerprint) return true;
  if (
    pinnedReleaseTag.length === CORPUS_FINGERPRINT_LENGTH &&
    fingerprint.startsWith(pinnedReleaseTag)
  ) {
    return true;
  }
  return false;
}

/**
 * Read-only corpus overview for a tenant's fund. D15: tenant id is 1-to-1 with the fund key,
 * so this queries that one schema. Never joins across fund schemas.
 * When `agentKey` is set, only that agent's documents (CAO vs arbocatalogus).
 */
export async function getCorpusOverview(
  tenantId: string,
  agentKey?: string,
): Promise<CorpusDocRow[]> {
  return withFundSchema(tenantId, (db) => loadCorpusOverview(db, agentKey));
}

/** The same read, against a caller's open fund-schema transaction. */
export async function loadCorpusOverview(
  db: Database,
  agentKey?: string,
): Promise<CorpusDocRow[]> {
  const rows = await db
    .select({
      title: documents.title,
      sourceUri: documents.sourceUri,
      fund: documents.fund,
      agentKey: documents.agentKey,
      version: documents.version,
      contentHash: documents.contentHash,
      ingestedAt: documents.ingestedAt,
      chunkCount: sql<number>`count(${chunks.id})`,
    })
    .from(documents)
    .leftJoin(chunks, eq(chunks.documentId, documents.id))
    .where(agentKey === undefined ? undefined : eq(documents.agentKey, agentKey))
    .groupBy(documents.id)
    .orderBy(desc(documents.ingestedAt));

  return rows.map((row) => ({
    title: row.title,
    sourceUri: row.sourceUri,
    fund: row.fund,
    agentKey: row.agentKey,
    version: row.version,
    contentHash: row.contentHash,
    ingestedAt: row.ingestedAt,
    chunkCount: Number(row.chunkCount ?? 0),
  }));
}
