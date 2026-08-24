import { chunks, desc, documents, eq, sql, withFundSchema } from "@wunderstack/db";

export interface CorpusDocRow {
  title: string;
  fund: string;
  version: string;
  ingestedAt: Date;
  chunkCount: number;
}

/**
 * Read-only corpus overview for a tenant's fund. D15: tenant id is 1-to-1 with the fund key,
 * so this queries that one schema. Never joins across fund schemas.
 */
export async function getCorpusOverview(tenantId: string): Promise<CorpusDocRow[]> {
  const rows = await withFundSchema(tenantId, (db) =>
    db
      .select({
        title: documents.title,
        fund: documents.fund,
        version: documents.version,
        ingestedAt: documents.ingestedAt,
        chunkCount: sql<number>`count(${chunks.id})`,
      })
      .from(documents)
      .leftJoin(chunks, eq(chunks.documentId, documents.id))
      .groupBy(documents.id)
      .orderBy(desc(documents.ingestedAt)),
  );

  return rows.map((row) => ({
    title: row.title,
    fund: row.fund,
    version: row.version,
    ingestedAt: row.ingestedAt,
    chunkCount: Number(row.chunkCount ?? 0),
  }));
}
