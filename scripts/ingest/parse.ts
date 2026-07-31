/**
 * Parse a CAO source file (PDF or plain text) into normalized plain text.
 *
 * This is the ingestion source seam. Today it reads local files; a later object-storage
 * source (Scaleway/OVH S3, see PRODUCT_SPEC) can be added behind the same function without
 * touching chunking or embedding.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { extractTextItems, getDocumentProxy, type StructuredTextItem } from "unpdf";

export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

/**
 * Light normalization that preserves document structure (headings, blank-line paragraph
 * breaks) so structure-aware chunking has something to work with. It only unifies line
 * endings, strips trailing spaces, and collapses runs of blank lines.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Table detection + serialization (Fase 10).
 *
 * CAO salary scales (functiegroep/trede) and similar tabular data get mangled by prose chunking:
 * rows lose their alignment and "wat verdient functiegroep X, trede Y" becomes unanswerable. We
 * detect a run of table-like lines and keep it whole as a `table` chunk with a readable, one-fact-
 * per-line serialization the embedder and the LLM can both use.
 */

/** A line is table-like if it pairs a label with a value (colon, 2+ spaces, tab, or a €/number). */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 160) return false;
  // "Trede 1: € 2.450", "Functiegroep II    € 14,20", tab-separated columns, or "... 2.450".
  if (/[:\t]/.test(trimmed) && /[\d€]/.test(trimmed)) return true;
  if (/\s{2,}/.test(trimmed) && /(?:€|\b\d[\d.,]*\b)/.test(trimmed)) return true;
  return false;
}

const MIN_TABLE_ROWS = 3;

/**
 * Serialize a block of raw table lines into a readable, row-per-line form. An optional caption
 * (the line just above the table, e.g. "Salarisschaal functiegroep I ...") is prefixed to each
 * row's context so a single retrieved row still carries which table it belongs to.
 */
export function serializeTable(lines: string[], caption?: string): string {
  const rows = lines
    .map((line) => line.trim().replace(/\s{2,}/g, ": ").replace(/\s*:\s*/g, ": ").trim())
    .filter((line) => line.length > 0);
  const header = caption?.trim();
  return header && header.length > 0 ? `${header}\n${rows.join("\n")}` : rows.join("\n");
}

/**
 * Split text into segments, flagging contiguous table-like runs. Prose segments keep their text
 * verbatim; table segments carry the detected caption + raw lines. Callers (chunk.ts) decide how
 * to chunk each segment.
 */
export interface TextSegment {
  kind: "text" | "table";
  content: string;
  /** For a table segment: the caption line detected just above the rows, if any. */
  caption?: string;
}

export function segmentText(text: string): TextSegment[] {
  const lines = text.split("\n");
  const segments: TextSegment[] = [];
  let prose: string[] = [];
  let table: string[] = [];

  const flushProse = (): void => {
    if (prose.length > 0) {
      const content = prose.join("\n").trim();
      if (content.length > 0) segments.push({ kind: "text", content });
      prose = [];
    }
  };

  const flushTable = (): void => {
    if (table.length >= MIN_TABLE_ROWS) {
      // The caption is the last non-empty prose line before the table (if any).
      let caption: string | undefined;
      for (let i = prose.length - 1; i >= 0; i--) {
        const candidate = prose[i]?.trim();
        if (candidate && candidate.length > 0) {
          caption = candidate;
          prose = prose.slice(0, i);
          break;
        }
      }
      flushProse();
      segments.push({ kind: "table", content: table.join("\n"), ...(caption ? { caption } : {}) });
    } else {
      // Too short to be a real table — treat as prose.
      prose.push(...table);
    }
    table = [];
  };

  for (const line of lines) {
    if (isTableRow(line)) {
      table.push(line);
    } else {
      if (table.length > 0) flushTable();
      prose.push(line);
    }
  }
  if (table.length > 0) flushTable();
  flushProse();

  return segments;
}

/**
 * PDF line reconstruction (2026-07-30, intervention C1).
 *
 * `extractText({ mergePages: true })` returns the page text with the layout flattened: line breaks
 * are gone, page footers land mid-sentence, and every structure pattern downstream keys on the START
 * OF A LINE. The measured result on a real CAO was 0 of 107 chunks with an anchor and 0 table chunks
 * (docs/eval/ingest/INGEST-elektronische-detailhandel-2026-07-30.md).
 *
 * `extractTextItems` gives the same text with geometry per fragment (x, y, width, fontSize), which is
 * enough to put the lines back: fragments sharing a y are one visual line, and the horizontal gap
 * between fragments says whether they are neighbouring words or separate table columns.
 */

/** Fragments within this many PDF points of each other vertically are one visual line. */
const LINE_Y_TOLERANCE = 2;

/**
 * Horizontal gap thresholds, in em (relative to the fragment's own font size) so they hold across
 * font sizes. Measured on cao_elektronische_detailhandel.pdf: gaps inside prose lines never exceed
 * 1.03em (p50 0.84em over 3 pages), while gaps between salary-table columns start above 1.1em with a
 * median of 2.27em. A column gap becomes TWO spaces because that is what the table detector below
 * keys on — the layout signal is preserved rather than re-invented.
 */
const WORD_GAP_EM = 0.15;
const COLUMN_GAP_EM = 1.2;

/** A running header/footer is a short line that reappears on at least this share of the pages. */
const RUNNING_LINE_PAGE_SHARE = 0.5;
const RUNNING_LINE_MAX_LENGTH = 120;

/** How many lines at each edge of a page can be a bare page number. */
const PAGE_EDGE_LINES = 3;

/** Group one page's fragments into visual lines, top to bottom, with gap-aware spacing. */
export function itemsToLines(pageItems: readonly StructuredTextItem[]): string[] {
  // Whitespace-only fragments carry no text and would collapse the measured gap to zero, hiding the
  // column layout. The gap between the surrounding fragments is the honest signal.
  const meaningful = pageItems.filter((item) => item.str.trim().length > 0);
  const byTop = [...meaningful].sort((a, b) => b.y - a.y);

  const rows: StructuredTextItem[][] = [];
  let current: StructuredTextItem[] = [];
  let anchorY: number | null = null;
  for (const item of byTop) {
    if (anchorY === null || Math.abs(item.y - anchorY) <= LINE_Y_TOLERANCE) {
      anchorY ??= item.y;
      current.push(item);
      continue;
    }
    rows.push(current);
    current = [item];
    anchorY = item.y;
  }
  if (current.length > 0) rows.push(current);

  return rows
    .map((row) => {
      const leftToRight = [...row].sort((a, b) => a.x - b.x);
      let line = "";
      let rightEdge: number | null = null;
      for (const item of leftToRight) {
        if (rightEdge !== null) {
          const em = item.fontSize > 0 ? item.fontSize : 11;
          const gap = (item.x - rightEdge) / em;
          if (gap >= COLUMN_GAP_EM) line += "  ";
          else if (gap >= WORD_GAP_EM && !line.endsWith(" ")) line += " ";
        }
        line += item.str;
        rightEdge = item.x + item.width;
      }
      return line.trim();
    })
    .filter((line) => line.length > 0);
}

const BARE_PAGE_NUMBER = /^\d{1,4}$/;
const LABELLED_PAGE_NUMBER = /^(?:pagina|page|blad)\s+\d+(?:\s+(?:van|of)\s+\d+)?$/i;

/**
 * Drop running headers/footers and page numbers. Both would otherwise land mid-sentence in the
 * joined text and break the line a heading needs to sit on.
 *
 * A line qualifies as running furniture by REPETITION (short and present on at least half the pages)
 * rather than by position, so this needs no assumption about the page template. Bare page numbers do
 * not repeat, so they are matched by shape and only at the very top or bottom of a page — never in
 * the middle, where a lone number is likely a table cell or a clause marker.
 */
export function dropRunningLines(pages: readonly string[][]): string[][] {
  const pageCount = pages.length;
  const appearances = new Map<string, number>();
  for (const lines of pages) {
    for (const line of new Set(lines)) {
      appearances.set(line, (appearances.get(line) ?? 0) + 1);
    }
  }

  const minPages = Math.max(2, Math.ceil(pageCount * RUNNING_LINE_PAGE_SHARE));
  const running = new Set(
    [...appearances.entries()]
      .filter(([line, count]) => count >= minPages && line.length <= RUNNING_LINE_MAX_LENGTH)
      .map(([line]) => line),
  );

  return pages.map((lines) => {
    // The band scales with the page so a short page does not count as edge from end to end.
    const band = Math.min(PAGE_EDGE_LINES, Math.max(1, Math.floor(lines.length / 3)));
    return lines.filter((line, index) => {
      if (running.has(line)) return false;
      const atEdge = index < band || index >= lines.length - band;
      if (atEdge && (BARE_PAGE_NUMBER.test(line) || LABELLED_PAGE_NUMBER.test(line))) return false;
      return true;
    });
  });
}

/** Reconstructed page text, joined with a blank line so paragraph splitting sees a page break. */
export function pdfItemsToText(pages: readonly StructuredTextItem[][]): string {
  const lines = dropRunningLines(pages.map((pageItems) => itemsToLines(pageItems)));
  return lines
    .filter((page) => page.length > 0)
    .map((page) => page.join("\n"))
    .join("\n\n");
}

/**
 * Pages a PDF holds but yields no text for. pdf.js swallows per-page extraction errors, so such a
 * page contributes nothing and the corpus is quietly incomplete. Measured on
 * cao_elektronische_detailhandel.pdf: 3 of 62 pages. Reported rather than repaired — recovering the
 * text needs a different extraction route (OCR or another engine) and that is a separate decision.
 */
export function findEmptyPages(pages: readonly StructuredTextItem[][]): number[] {
  return pages
    .map((pageItems, index) => ({ page: index + 1, hasText: pageItems.some((item) => item.str.trim().length > 0) }))
    .filter((page) => !page.hasText)
    .map((page) => page.page);
}

export async function parseFile(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    const buffer = await readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { items } = await extractTextItems(pdf);
    const empty = findEmptyPages(items);
    if (empty.length > 0) {
      console.warn(
        `  warning: ${String(empty.length)} of ${String(items.length)} pages yielded no extractable text ` +
          `(pages ${empty.join(", ")}). That content is NOT in the corpus.`,
      );
    }
    return normalizeText(pdfItemsToText(items));
  }

  if (extension === ".txt" || extension === ".md") {
    return normalizeText(await readFile(filePath, "utf8"));
  }

  throw new Error(
    `Unsupported file type "${extension}" for ${filePath} ` +
      `(supported: ${SUPPORTED_EXTENSIONS.join(", ")}).`,
  );
}
