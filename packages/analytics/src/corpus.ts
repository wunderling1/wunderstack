import { chunks, desc, documents, eq, sql, withFundSchema } from "@wunderstack/db";

export interface CorpusDocRow {
  title: string;
  sourceUri: string;
  fund: string;
  version: string;
  ingestedAt: Date;
  chunkCount: number;
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
  const rows = await withFundSchema(tenantId, (db) =>
    db
      .select({
        title: documents.title,
        sourceUri: documents.sourceUri,
        fund: documents.fund,
        version: documents.version,
        ingestedAt: documents.ingestedAt,
        chunkCount: sql<number>`count(${chunks.id})`,
      })
      .from(documents)
      .leftJoin(chunks, eq(chunks.documentId, documents.id))
      .where(agentKey === undefined ? undefined : eq(documents.agentKey, agentKey))
      .groupBy(documents.id)
      .orderBy(desc(documents.ingestedAt)),
  );

  return rows.map((row) => ({
    title: row.title,
    sourceUri: row.sourceUri,
    fund: row.fund,
    version: row.version,
    ingestedAt: row.ingestedAt,
    chunkCount: Number(row.chunkCount ?? 0),
  }));
}
