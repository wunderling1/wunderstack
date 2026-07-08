import { and, asc, chunks, documents, eq, getDb } from "@wunderstack/db";
import { z } from "zod";

/** Distinct fund keys present in the corpus (used by the corpus-isolation eval gate). */
export async function listFunds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ fund: documents.fund })
    .from(documents)
    .orderBy(asc(documents.fund));
  return rows.map((row) => row.fund);
}

/**
 * Fetch the full passage a citation points at, so the UI can expand "toon volledige passage".
 *
 * Before structure-aware article units are complete (Fase 10), we approximate the parent article by
 * merging the neighbouring chunks of the SAME document that share the citation's article — or, when
 * the chunk has no article, a small ordinal window around it. Every query is scoped by `fund` for
 * corpus isolation (one session = one corpus), matching the retrieval seam.
 */

export const passageInputSchema = z.object({
  chunkId: z.string().uuid(),
  /** Fund key — required for corpus isolation (never fetch across funds). */
  fund: z.string().min(1),
});

export type PassageInput = z.input<typeof passageInputSchema>;

export interface PassageResult {
  /** The merged passage text (article unit, or ordinal window as an approximation). */
  text: string;
  /** True when the text is an ordinal-window approximation (no article boundary available). */
  approximate: boolean;
  article: string | null;
  chapter: string | null;
  sourceRef: string | null;
  title: string;
  sourceUri: string;
  fund: string;
  version: string;
}

/** How many neighbouring chunks to include on each side when no article boundary exists. */
const ORDINAL_WINDOW = 2;

export async function fetchParentPassage(input: PassageInput): Promise<PassageResult | null> {
  const { chunkId, fund } = passageInputSchema.parse(input);
  const db = getDb();

  const anchorRows = await db
    .select({
      documentId: chunks.documentId,
      ordinal: chunks.ordinal,
      article: chunks.article,
      chapter: chunks.chapter,
      sourceRef: chunks.sourceRef,
      title: documents.title,
      sourceUri: documents.sourceUri,
      fund: documents.fund,
      version: documents.version,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(chunks.id, chunkId), eq(documents.fund, fund)))
    .limit(1);

  const anchor = anchorRows[0];
  if (!anchor) {
    return null;
  }

  const base = {
    article: anchor.article,
    chapter: anchor.chapter,
    sourceRef: anchor.sourceRef,
    title: anchor.title,
    sourceUri: anchor.sourceUri,
    fund: anchor.fund,
    version: anchor.version,
  };

  if (anchor.article) {
    // Real article unit: all chunks of this document sharing the article, in order.
    const rows = await db
      .select({ content: chunks.content, chunkType: chunks.chunkType })
      .from(chunks)
      .where(and(eq(chunks.documentId, anchor.documentId), eq(chunks.article, anchor.article)))
      .orderBy(asc(chunks.ordinal));
    return {
      ...base,
      text: joinPassage(rows),
      approximate: false,
    };
  }

  // Approximation: an ordinal window around the anchor within the same document.
  const rows = await db
    .select({ ordinal: chunks.ordinal, content: chunks.content, chunkType: chunks.chunkType })
    .from(chunks)
    .where(eq(chunks.documentId, anchor.documentId))
    .orderBy(asc(chunks.ordinal));

  const window = rows.filter((row) => Math.abs(row.ordinal - anchor.ordinal) <= ORDINAL_WINDOW);
  return {
    ...base,
    text: joinPassage(window),
    approximate: true,
  };
}

/** Join passage chunks into readable paragraphs, normalizing prose but preserving table layout. */
function joinPassage(rows: { content: string; chunkType: string }[]): string {
  return rows
    .map((row) => normalizePassageText(row.content, row.chunkType))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/**
 * Prose chunks are often hard-wrapped in the source (a newline mid-sentence). Collapse those single
 * newlines to spaces per paragraph so a sentence is not broken visually, while keeping intentional
 * paragraph breaks (blank lines). Table chunks are kept verbatim — their newlines ARE the layout.
 */
export function normalizePassageText(content: string, chunkType: string): string {
  if (chunkType === "table") {
    return content.replace(/[ \t]+$/gm, "").trim();
  }
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n");
}
