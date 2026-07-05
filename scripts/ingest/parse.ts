/**
 * Parse a CAO source file (PDF or plain text) into normalized plain text.
 *
 * This is the ingestion source seam. Today it reads local files; a later object-storage
 * source (Scaleway/OVH S3, see PRODUCT_SPEC) can be added behind the same function without
 * touching chunking or embedding.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { extractText, getDocumentProxy } from "unpdf";

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

export async function parseFile(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    const buffer = await readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return normalizeText(text);
  }

  if (extension === ".txt" || extension === ".md") {
    return normalizeText(await readFile(filePath, "utf8"));
  }

  throw new Error(
    `Unsupported file type "${extension}" for ${filePath} ` +
      `(supported: ${SUPPORTED_EXTENSIONS.join(", ")}).`,
  );
}
