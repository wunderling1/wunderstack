/**
 * Structure-aware chunking for CAO text.
 *
 * CAO documents are strongly structured (Artikel / Hoofdstuk / numbered clauses). We first
 * split on those headings so a chunk rarely straddles two articles, then pack paragraphs up
 * to a target size with a small overlap. Each chunk keeps its heading (both prepended to the
 * content, so the chunk is self-describing for embedding + source attribution, and in
 * metadata). Size/overlap are tunable and validated later via the eval suite (Fase 8).
 */

export interface Chunk {
  ordinal: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ChunkOptions {
  /** Soft upper bound on characters per chunk (before the heading is prepended). */
  targetChars?: number;
  /** Characters of tail context carried into the next chunk within a section. */
  overlapChars?: number;
}

const DEFAULT_TARGET_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 200;

interface Section {
  heading: string | null;
  body: string;
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  if (/^(artikel|hoofdstuk|bijlage|paragraaf)\b/i.test(trimmed)) return true;
  // Numbered clause headings like "1", "1.2", "3.4.1 Titel".
  if (/^\d+(\.\d+)*[.)]?(\s+\S+)?$/.test(trimmed) && trimmed.length <= 80) return true;
  return false;
}

function sectionize(text: string): Section[] {
  const sections: Section[] = [];
  let heading: string | null = null;
  let body: string[] = [];

  const flush = (): void => {
    const joined = body.join("\n").trim();
    if (joined.length > 0 || heading !== null) sections.push({ heading, body: joined });
    body = [];
  };

  for (const line of text.split("\n")) {
    if (isHeading(line)) {
      flush();
      heading = line.trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Break a paragraph larger than target into sentence-aligned pieces (hard-splitting if a
 *  single sentence is itself too long). */
function splitLongParagraph(paragraph: string, target: number): string[] {
  if (paragraph.length <= target) return [paragraph];
  const pieces: string[] = [];
  let buffer = "";
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    if (buffer.length > 0 && buffer.length + 1 + sentence.length > target) {
      pieces.push(buffer);
      buffer = "";
    }
    buffer = buffer.length > 0 ? `${buffer} ${sentence}` : sentence;
    while (buffer.length > target) {
      pieces.push(buffer.slice(0, target));
      buffer = buffer.slice(target);
    }
  }
  if (buffer.length > 0) pieces.push(buffer);
  return pieces;
}

/** Last `overlap` characters of `text`, trimmed to a word boundary. */
function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return overlap <= 0 ? "" : text;
  const slice = text.slice(-overlap);
  const spaceIndex = slice.indexOf(" ");
  return spaceIndex > 0 ? slice.slice(spaceIndex + 1) : slice;
}

function packSection(body: string, target: number, overlap: number): string[] {
  const pieces = splitParagraphs(body).flatMap((paragraph) =>
    splitLongParagraph(paragraph, target),
  );
  const chunks: string[] = [];
  let buffer = "";

  for (const piece of pieces) {
    const candidate = buffer.length > 0 ? `${buffer}\n\n${piece}` : piece;
    if (buffer.length > 0 && candidate.length > target) {
      chunks.push(buffer);
      const tail = overlapTail(buffer, overlap);
      buffer = tail.length > 0 ? `${tail}\n\n${piece}` : piece;
    } else {
      buffer = candidate;
    }
  }
  if (buffer.trim().length > 0) chunks.push(buffer);
  return chunks;
}

export function chunk(text: string, options: ChunkOptions = {}): Chunk[] {
  const target = options.targetChars ?? DEFAULT_TARGET_CHARS;
  const overlap = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const result: Chunk[] = [];
  let ordinal = 0;

  sectionize(text).forEach((section, sectionIndex) => {
    const bodies = packSection(section.body, target, overlap);
    // A heading with no body still carries information; keep it as its own chunk.
    if (bodies.length === 0 && section.heading !== null) bodies.push("");

    bodies.forEach((body, partIndex) => {
      const content =
        section.heading !== null && body.length > 0
          ? `${section.heading}\n${body}`
          : section.heading ?? body;
      result.push({
        ordinal: ordinal++,
        content,
        metadata: { heading: section.heading, sectionIndex, partIndex },
      });
    });
  });

  return result;
}
