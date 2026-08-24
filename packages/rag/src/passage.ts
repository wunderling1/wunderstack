import { and, asc, chunks, documents, eq, isNotNull, listActiveFunds, withFundSchema } from "@wunderstack/db";
import { z } from "zod";

export interface CorpusKey {
  fund: string;
  agentKey: string;
}

/**
 * Distinct (fund, agent_key) pairs present in the corpus (used by the isolation eval gate).
 * One query per fund schema — never a UNION across schemas (ADR invariant).
 */
export async function listCorpora(): Promise<CorpusKey[]> {
  const funds = await listActiveFunds();
  const keys: CorpusKey[] = [];
  for (const fund of funds) {
    const rows = await withFundSchema(fund.key, (tx) =>
      tx
        .selectDistinct({ fund: documents.fund, agentKey: documents.agentKey })
        .from(documents)
        .orderBy(asc(documents.fund), asc(documents.agentKey)),
    );
    keys.push(...rows);
  }
  keys.sort((a, b) => a.fund.localeCompare(b.fund) || a.agentKey.localeCompare(b.agentKey));
  return keys;
}

export const structuralRefsInputSchema = z.object({
  fund: z.string().min(1),
  agentKey: z.string().min(1),
});

export interface StructuralRefs {
  articles: string[];
  chapters: string[];
}

/**
 * Distinct article and chapter labels in one fund+agent corpus. Used by the G3-fund reachability
 * check: presence of an expected ref is a structural fact, not an embedding ranking. One schema,
 * scoped by fund and agent_key — never a UNION across funds.
 */
export async function listStructuralRefs(input: { fund: string; agentKey: string }): Promise<StructuralRefs> {
  const { fund, agentKey } = structuralRefsInputSchema.parse(input);
  const corpusScope = and(eq(documents.fund, fund), eq(documents.agentKey, agentKey));

  return withFundSchema(fund, async (db) => {
    const articleRows = await db
      .selectDistinct({ article: chunks.article })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(and(corpusScope, isNotNull(chunks.article)));
    const chapterRows = await db
      .selectDistinct({ chapter: chunks.chapter })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(and(corpusScope, isNotNull(chunks.chapter)));

    const articles = articleRows
      .map((row) => row.article)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b));
    const chapters = chapterRows
      .map((row) => row.chapter)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b));
    return { articles, chapters };
  });
}

/**
 * Fetch the full passage a citation points at, so the UI can expand "toon volledige passage".
 *
 * Before structure-aware article units are complete (Fase 10), we approximate the parent article by
 * merging the neighbouring chunks of the SAME document that share the citation's article — or, when
 * the chunk has no article, a small ordinal window around it. Every query is scoped by `fund` and
 * `agentKey` for corpus isolation (one session = one corpus), matching the retrieval seam.
 */

export const passageInputSchema = z.object({
  chunkId: z.string().uuid(),
  /** Fund key — required for corpus isolation (never fetch across funds). */
  fund: z.string().min(1),
  /** Corpus agent key — required; no default. */
  agentKey: z.string().min(1),
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
  agentKey: string;
  version: string;
}

/** How many neighbouring chunks to include on each side when no article boundary exists. */
const ORDINAL_WINDOW = 2;

export async function fetchParentPassage(input: PassageInput): Promise<PassageResult | null> {
  const { chunkId, fund, agentKey } = passageInputSchema.parse(input);
  const corpusScope = and(eq(documents.fund, fund), eq(documents.agentKey, agentKey));

  return withFundSchema(fund, async (db) => {
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
      agentKey: documents.agentKey,
      version: documents.version,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(chunks.id, chunkId), corpusScope))
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
    agentKey: anchor.agentKey,
    version: anchor.version,
  };

  if (anchor.article) {
    // Real article unit: all chunks of this document sharing the article, in order.
    const rows = await db
      .select({ content: chunks.content, chunkType: chunks.chunkType, metadata: chunks.metadata })
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
    .select({
      ordinal: chunks.ordinal,
      content: chunks.content,
      chunkType: chunks.chunkType,
      metadata: chunks.metadata,
    })
    .from(chunks)
    .where(eq(chunks.documentId, anchor.documentId))
    .orderBy(asc(chunks.ordinal));

  const window = rows.filter((row) => Math.abs(row.ordinal - anchor.ordinal) <= ORDINAL_WINDOW);
  return {
    ...base,
    text: joinPassage(window),
    approximate: true,
  };
  });
}

interface PassageChunkRow {
  content: string;
  chunkType: string;
  metadata: Record<string, unknown>;
}

/** Minimum shared length before we treat a suffix/prefix match as real chunk overlap (not coincidence). */
const MIN_DEDUP_OVERLAP = 16;

/** The section heading stored on a chunk during structure-aware chunking, if any. */
function chunkHeading(row: PassageChunkRow): string | null {
  const heading = row.metadata.heading;
  return typeof heading === "string" && heading.length > 0 ? heading : null;
}

/** Drop a leading `heading\n` prefix — chunking prepends the section heading to every sub-chunk. */
function stripRepeatedHeading(content: string, heading: string): string {
  if (content === heading) return "";
  const prefix = `${heading}\n`;
  return content.startsWith(prefix) ? content.slice(prefix.length) : content;
}

/**
 * Append `next` to `acc`, removing the overlap that structure-aware chunking carries between
 * consecutive chunks (the tail of one chunk is repeated at the head of the next). We match on the
 * already-normalized text, taking the longest shared boundary so the same passage is not shown twice.
 */
function appendWithoutOverlap(acc: string, next: string): string {
  const max = Math.min(acc.length, next.length);
  for (let k = max; k >= MIN_DEDUP_OVERLAP; k--) {
    if (acc.endsWith(next.slice(0, k))) {
      const remainder = next.slice(k).replace(/^\s+/, "");
      return remainder.length > 0 ? `${acc}\n\n${remainder}` : acc;
    }
  }
  return `${acc}\n\n${next}`;
}

/**
 * Join passage chunks into one readable text. Structure-aware chunking repeats the section heading on
 * every sub-chunk (option 2) and carries an overlap tail into the next chunk (option 1); both would
 * show duplicated text if concatenated naively. So we strip a heading that repeats the previous
 * chunk's, then merge on the longest shared boundary. Prose is normalized per paragraph; table layout
 * is preserved (see `normalizePassageText`).
 */
function joinPassage(rows: PassageChunkRow[]): string {
  let merged = "";
  let previousHeading: string | null = null;

  for (const row of rows) {
    const heading = chunkHeading(row);
    const raw = heading !== null && heading === previousHeading
      ? stripRepeatedHeading(row.content, heading)
      : row.content;
    previousHeading = heading;

    const text = normalizePassageText(raw, row.chunkType);
    if (text.length === 0) continue;

    merged = merged.length === 0 ? text : appendWithoutOverlap(merged, text);
  }

  return merged;
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
