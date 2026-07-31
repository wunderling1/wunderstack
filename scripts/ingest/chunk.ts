/**
 * Structure-aware chunking for CAO text (Fase 10).
 *
 * CAO documents are strongly structured (Hoofdstuk / Artikel / lid) and full of salary tables.
 * We (1) split on those headings so a chunk rarely straddles two articles, (2) track the running
 * chapter/article/lid so every chunk carries its structural anchor + a human-readable
 * `sourceRef` ("Artikel 5, lid 2") — citations for free — and (3) keep salary/scale tables whole
 * as `table` chunks so "wat verdient functiegroep X, trede Y" stays answerable.
 */

import { segmentText, serializeTable } from "./parse.js";

export type ChunkType = "text" | "table";

export interface Chunk {
  ordinal: number;
  content: string;
  /** Chapter number/label (e.g. "3" or "III"), null above chapter level. */
  chapter: string | null;
  /** Article number ("5", "6a") or a bijlage label ("Bijlage 1"), null otherwise. */
  article: string | null;
  /** Lid (clause) number within the article, null at article level. */
  lid: string | null;
  /** Human-readable citation anchor ("Artikel 5, lid 2"), null when no structure was detected. */
  sourceRef: string | null;
  chunkType: ChunkType;
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
  // Section-number headings carrying a real, multi-word title ("1.1. Van toepassing",
  // "4.3 Arbeidsduurverkorting (ADV)") — the numbering style of CAOs that do not write "Artikel N".
  // The rule above stops at a single trailing word, so these were invisible and the whole CAO
  // collapsed into one unanchored section (measured 2026-07-30, intervention C1).
  //
  // Requires the N.M form, so a bare clause marker ("1.") keeps falling through to splitLeden. A
  // column run (two or more spaces, which is how the PDF parse marks table columns) disqualifies the
  // line, so a salary row that opens with a number ("15 jaar  580,30  609,32") is not mistaken for
  // an article heading and tables stay whole.
  if (/^\d+(?:\.\d+)+[.)]?\s+\p{L}/u.test(trimmed) && !/\s{2,}/.test(trimmed) && trimmed.length <= 80) {
    return true;
  }
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

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.:)]+$/, "");
}

function extractChapter(heading: string): string | null {
  const match = /^hoofdstuk\s+(\S+)/i.exec(heading);
  return match?.[1] ? stripTrailingPunctuation(match[1]) : null;
}

function extractArticle(heading: string): string | null {
  const match = /^artikel\s+(\d+[a-z]?)/i.exec(heading);
  return match?.[1] ? stripTrailingPunctuation(match[1]) : null;
}

/**
 * Section-number article headings ("4.1.", "6.2 Salaristabellen", "5.14 Mantelzorg") used by CAOs
 * that number articles as chapter.article instead of the "Artikel N" style. Requires at least one
 * dot so a bare clause marker ("1.", "2)") is NOT misread as an article — those stay leden and are
 * handled by splitLeden / extractHeadingLid.
 */
function extractSectionArticle(heading: string): string | null {
  const match = /^(\d+\.\d+(?:\.\d+)*)[.)]?(?=\s|$)/.exec(heading.trim());
  return match?.[1] ?? null;
}

function extractBijlage(heading: string): string | null {
  const match = /^bijlage\s+(\S+)/i.exec(heading);
  return match?.[1] ? `Bijlage ${stripTrailingPunctuation(match[1])}` : null;
}

function extractHeadingLid(heading: string): string | null {
  const match = /^(\d+[a-z]?)(?:[.)]|\s|$)/.exec(heading.trim());
  return match?.[1] ? stripTrailingPunctuation(match[1]) : null;
}

function buildSourceRef(chapter: string | null, article: string | null, lid: string | null): string | null {
  if (article) {
    if (/^bijlage/i.test(article)) return article;
    const base = `Artikel ${article}`;
    return lid ? `${base}, lid ${lid}` : base;
  }
  if (chapter) return `Hoofdstuk ${chapter}`;
  return null;
}

/** Split an article body into per-lid groups on line-leading clause markers ("1. ", "2) "). */
function splitLeden(body: string): { lid: string | null; text: string }[] {
  const groups: { lid: string | null; text: string }[] = [];
  let lid: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) groups.push({ lid, text });
    buffer = [];
  };

  for (const line of body.split("\n")) {
    const match = /^(\d+[a-z]?)[.)]\s+\S/.exec(line.trim());
    if (match?.[1]) {
      flush();
      lid = stripTrailingPunctuation(match[1]);
    }
    buffer.push(line);
  }
  flush();

  return groups.length > 0 ? groups : [{ lid: null, text: body }];
}

function withHeading(heading: string | null, body: string): string {
  if (heading !== null && body.length > 0) return `${heading}\n${body}`;
  return heading ?? body;
}

export function chunk(text: string, options: ChunkOptions = {}): Chunk[] {
  const target = options.targetChars ?? DEFAULT_TARGET_CHARS;
  const overlap = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const result: Chunk[] = [];
  let ordinal = 0;
  let currentChapter: string | null = null;
  let currentArticle: string | null = null;

  for (const [sectionIndex, section] of sectionize(text).entries()) {
    const heading = section.heading;
    let sectionLid: string | null = null;

    if (heading !== null) {
      const chapter = extractChapter(heading);
      const article = extractArticle(heading);
      const bijlage = extractBijlage(heading);
      // Only look for an N.M section-article when none of the explicit heading types matched.
      const sectionArticle =
        chapter === null && article === null && bijlage === null ? extractSectionArticle(heading) : null;
      if (chapter !== null) {
        currentChapter = chapter;
        currentArticle = null;
      }
      if (article !== null) currentArticle = article;
      if (bijlage !== null) {
        currentArticle = bijlage;
        currentChapter = null;
      }
      if (sectionArticle !== null) {
        currentArticle = sectionArticle;
        // The part before the first dot is the chapter (e.g. "6.2" lives in Hoofdstuk 6).
        currentChapter = sectionArticle.split(".")[0] ?? currentChapter;
      }
      if (chapter === null && article === null && bijlage === null && sectionArticle === null && currentArticle !== null) {
        sectionLid = extractHeadingLid(heading);
      }
    }

    const push = (content: string, chunkType: ChunkType, lid: string | null, partIndex: number): void => {
      if (content.trim().length === 0) return;
      const sourceRef = buildSourceRef(currentChapter, currentArticle, lid);
      result.push({
        ordinal: ordinal++,
        content,
        chapter: currentChapter,
        article: currentArticle,
        lid,
        sourceRef,
        chunkType,
        metadata: {
          heading,
          sectionIndex,
          partIndex,
          chunkType,
          ...(currentChapter ? { chapter: currentChapter } : {}),
          ...(currentArticle ? { article: currentArticle } : {}),
          ...(lid ? { lid } : {}),
          ...(sourceRef ? { sourceRef } : {}),
        },
      });
    };

    const segments = segmentText(section.body);

    // A heading with no body still carries information; keep it as its own chunk.
    if (segments.length === 0 && heading !== null) {
      push(heading, "text", sectionLid, 0);
      continue;
    }

    let partIndex = 0;
    for (const segment of segments) {
      if (segment.kind === "table") {
        const serialized = serializeTable(segment.content.split("\n"), segment.caption);
        push(withHeading(heading, serialized), "table", sectionLid, partIndex++);
        continue;
      }
      for (const group of splitLeden(segment.content)) {
        const lid = group.lid ?? sectionLid;
        for (const body of packSection(group.text, target, overlap)) {
          push(withHeading(heading, body), "text", lid, partIndex++);
        }
      }
    }
  }

  return result;
}
