import { chunks, desc, documents, eq, getDb, inArray, interactionEvents, sql } from "@wunderstack/db";

export interface CorpusDocRow {
  title: string;
  fund: string;
  version: string;
  ingestedAt: Date;
  chunkCount: number;
}

/**
 * Read-only corpus overview for a tenant's fund(s). Derives the fund(s) from the tenant's own events
 * (1-to-1 tenant↔fund in v1) and lists the ingested CAO documents with their chunk counts. The
 * dashboard never writes to the corpus — v1 is a read-only panel.
 */
export async function getCorpusOverview(tenantId: string): Promise<CorpusDocRow[]> {
  const db = getDb();
  const fundRows = await db
    .selectDistinct({ fund: interactionEvents.fund })
    .from(interactionEvents)
    .where(eq(interactionEvents.tenantId, tenantId));
  const funds = fundRows.map((row) => row.fund);
  if (funds.length === 0) return [];

  const rows = await db
    .select({
      title: documents.title,
      fund: documents.fund,
      version: documents.version,
      ingestedAt: documents.ingestedAt,
      chunkCount: sql<number>`count(${chunks.id})`,
    })
    .from(documents)
    .leftJoin(chunks, eq(chunks.documentId, documents.id))
    .where(inArray(documents.fund, funds))
    .groupBy(documents.id)
    .orderBy(desc(documents.ingestedAt));

  return rows.map((row) => ({
    title: row.title,
    fund: row.fund,
    version: row.version,
    ingestedAt: row.ingestedAt,
    chunkCount: Number(row.chunkCount ?? 0),
  }));
}
