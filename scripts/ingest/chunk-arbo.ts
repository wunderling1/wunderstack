/**
 * Structure-aware chunking for arbocatalogus text.
 *
 * Splits on hoofdstuk / risico / maatregel / werkplek headings and on numbered catalog sections.
 * Tables (grenswaarden, PBM) stay whole. `sourceRef` is a human-readable label
 * ("Hoofdstuk 1 — Tillen en fysieke belasting"); structural detail lives in chunk metadata.
 *
 * HEADING LEVELS (2026-08-23). A flat "is this a heading" test cannot chunk this corpus. In the OOMT
 * EV-arbocatalogus the arbeidshygiënische strategie is repeated inside nearly every section:
 *
 *     1. Wegnemen bron
 *     2. Afscherming bron
 *     3. Organisatorische maatregelen
 *     4. Persoonlijke beschermingsmiddelen
 *
 * Those lines are lexically identical to a genuine top-level chapter ("1. Elektrische Voertuigen",
 * "2. Oplossingen"). Treating them as headings stamped most of the catalogue with the label of a list
 * item instead of its own "N.M." section: section 2.3 kept 238 characters while the 2.190 characters
 * that answer its questions landed under "3. De ev-werkverantwoordelijke (ev-WV)". Every fund case
 * matching on `expectedChapter` then missed at every k — a retrieval failure that was not one
 * (G3-fund arbo.oomt: recall exactly 0.500 at k=1/3/5).
 *
 * So headings now carry a level, and a bare "N." is a CHAPTER only when both hold:
 *   - N is the next chapter number (chapters are numbered monotonically and entered once), and
 *   - the next "N.M" heading in the document actually has prefix N — it really has sub-sections.
 * Both clauses are needed: "2. Verbranding door de vlamboog" (a risk list item inside 1.2) satisfies
 * the first, and "2. De ev-vakbekwaam persoon (ev-VP)" (a list item inside 2.3) satisfies the second.
 *
 * The chapter stamp then prefers the innermost structural anchor — `currentSection ?? currentChapter
 * ?? heading` — so a list item that still slips through can never overwrite the section it sits in.
 */

import { packSection, type Chunk, type ChunkOptions } from "./chunk";
import { segmentText, serializeTable } from "./parse";

const DEFAULT_TARGET_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 200;

/** Longest line still considered for heading status. */
const MAX_HEADING_CHARS = 160;
/** A bare "N. Titel" must be short to be a title at all; longer numbered lines are list sentences. */
const MAX_BARE_CHAPTER_CHARS = 40;

/** "2.3. Aanwijsbeleid …" / "1.2.1 Iets" — capture group 1 is the chapter prefix. */
const SECTION_RE = /^(\d+)\.(\d+)(?:\.\d+)*\.?\s+\S/;
/** "1. Elektrische Voertuigen" — a chapter candidate, validated against the rules above. */
const BARE_CHAPTER_RE = /^(\d+)\.\s+[A-ZÀ-ÖØ-Þ]/;
/** "Hoofdstuk 3 — Tillen": an explicit chapter, optionally numbered. */
const HOOFDSTUK_RE = /^hoofdstuk\b\s*(\d+)?/i;

/**
 * `chapter` — opens a new top-level chapter and clears the current section.
 * `section`  — an "N.M." catalog section; this is what fund cases match `expectedChapter` on.
 * `other`    — a heading that anchors its own chunks (risico/maatregel/markdown) but changes no level.
 * `body`     — not a heading.
 */
export type HeadingKind = "chapter" | "section" | "other" | "body";

interface Section {
  heading: string | null;
  body: string;
  sectionType: string | null;
  kind: HeadingKind;
}

function isTocLine(trimmed: string): boolean {
  return /\s+\d+$/.test(trimmed);
}

/** A numbered sentence that introduces a list ("2. Jongeren … mogen:") is body, not a title. */
function isListSentence(trimmed: string): boolean {
  return /[:;]$/.test(trimmed);
}

/**
 * Classify every line once. Two passes, because the bare-"N." decision has to look FORWARD to the
 * next "N.M" heading — that lookahead is the only thing separating a chapter from a list item.
 */
export function classifyLines(lines: string[]): HeadingKind[] {
  const trimmed = lines.map((line) => line.trim());

  // Pass 1 — which lines are "N.M" sections, and what chapter prefix do they carry.
  const sectionPrefix = trimmed.map((line) => {
    if (line.length === 0 || line.length > MAX_HEADING_CHARS) return null;
    if (isTocLine(line) || isListSentence(line)) return null;
    const match = SECTION_RE.exec(line);
    return match ? Number(match[1]) : null;
  });

  // For each line: the prefix of the first "N.M" heading strictly after it.
  const nextSectionPrefix: (number | null)[] = new Array<number | null>(trimmed.length).fill(null);
  let carry: number | null = null;
  for (let index = trimmed.length - 1; index >= 0; index--) {
    nextSectionPrefix[index] = carry;
    const prefix = sectionPrefix[index];
    if (prefix !== null && prefix !== undefined) carry = prefix;
  }

  // Pass 2 — assign a level. Rule ORDER mirrors the original isArboHeading: the explicit heading
  // words win before the TOC / colon rejections, so that behaviour is unchanged.
  const kinds: HeadingKind[] = [];
  let chapterNumber: number | null = null;
  let openSectionPrefix: number | null = null;

  for (const [index, line] of trimmed.entries()) {
    if (line.length === 0 || line.length > MAX_HEADING_CHARS) {
      kinds.push("body");
      continue;
    }

    const hoofdstuk = HOOFDSTUK_RE.exec(line);
    if (hoofdstuk) {
      const number = hoofdstuk[1];
      if (number !== undefined) chapterNumber = Number(number);
      kinds.push("chapter");
      continue;
    }
    if (/^(risico|maatregel|werkplek|branche)\b/i.test(line) || /^#{1,3}\s+/.test(line)) {
      kinds.push("other");
      continue;
    }
    if (isTocLine(line) || isListSentence(line)) {
      kinds.push("body");
      continue;
    }
    const prefix = sectionPrefix[index];
    if (prefix !== null && prefix !== undefined) {
      openSectionPrefix = prefix;
      kinds.push("section");
      continue;
    }

    const bare = BARE_CHAPTER_RE.exec(line);
    if (bare && line.length <= MAX_BARE_CHAPTER_CHARS) {
      const number = Number(bare[1]);
      const expected = (chapterNumber ?? 0) + 1;
      // Three clauses, each earning its place against a real line from the OOMT catalogue:
      //   - monotonic       : "1. Wegnemen bron" inside chapter 2 is not chapter 3.
      //   - has sub-sections: "2. Verbranding door de vlamboog" inside 1.2 is followed by 1.3, not 2.1.
      //   - not already open: "1. Stroom door het lichaam" inside 1.2 cannot open chapter 1 — being
      //                       inside section 1.2 means chapter 1 is open already.
      const alreadyOpen = openSectionPrefix === number;
      if (number === expected && nextSectionPrefix[index] === number && !alreadyOpen) {
        chapterNumber = number;
        openSectionPrefix = null;
        kinds.push("chapter");
        continue;
      }
    }

    kinds.push("body");
  }

  return kinds;
}

function sectionTypeFor(heading: string): string | null {
  const lower = heading.toLowerCase();
  if (lower.startsWith("hoofdstuk")) return "chapter";
  if (lower.startsWith("risico")) return "risk";
  if (lower.startsWith("maatregel")) return "measure";
  if (lower.startsWith("werkplek")) return "workplace";
  if (lower.startsWith("branche")) return "sector";
  return null;
}

function sectionize(text: string): Section[] {
  const lines = text.split("\n");
  const kinds = classifyLines(lines);
  const sections: Section[] = [];
  let heading: string | null = null;
  let sectionType: string | null = null;
  let kind: HeadingKind = "body";
  let body: string[] = [];

  const flush = (): void => {
    const joined = body.join("\n").trim();
    if (joined.length > 0 || heading !== null) {
      sections.push({ heading, body: joined, sectionType, kind });
    }
    body = [];
  };

  for (const [index, line] of lines.entries()) {
    const lineKind = kinds[index] ?? "body";
    if (lineKind !== "body") {
      flush();
      heading = line.trim().replace(/^#{1,3}\s+/, "");
      sectionType = sectionTypeFor(heading);
      kind = lineKind;
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

function withHeading(heading: string | null, content: string): string {
  if (!heading) return content;
  return `${heading}\n${content}`;
}

export function chunkArbo(text: string, options: ChunkOptions = {}): Chunk[] {
  const target = options.targetChars ?? DEFAULT_TARGET_CHARS;
  const overlap = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const result: Chunk[] = [];
  let ordinal = 0;
  let currentChapter: string | null = null;
  let currentSection: string | null = null;

  for (const [sectionIndex, section] of sectionize(text).entries()) {
    const heading = section.heading;
    const sectionType = section.sectionType;
    if (section.kind === "chapter" && heading) {
      currentChapter = heading;
      // A new chapter closes whatever section was open inside the previous one.
      currentSection = null;
    }
    if (section.kind === "section" && heading) {
      currentSection = heading;
    }

    // Innermost anchor first: the "N.M" section a chunk sits in beats the chapter above it, and both
    // beat the chunk's own heading. A stray list item can therefore no longer relabel its section.
    const anchor = currentSection ?? currentChapter ?? heading;

    const push = (content: string, chunkType: "text" | "table", partIndex: number): void => {
      const trimmed = content.trim();
      if (trimmed.length === 0) return;
      result.push({
        ordinal: ordinal++,
        content: trimmed,
        // Numbered EV sections are not "Hoofdstuk N"; the section heading is stamped here so
        // retrieval evals can match expectedChapter (e.g. "1.2. Risicobeschrijving").
        chapter: anchor,
        article: null,
        lid: null,
        sourceRef: anchor,
        chunkType,
        metadata: {
          heading,
          sectionIndex,
          partIndex,
          sectionType,
          ...(anchor ? { chapter: anchor } : {}),
          ...(sectionType ? { sectionType } : {}),
        },
      });
    };

    const segments = segmentText(section.body);
    if (segments.length === 0 && heading !== null) {
      push(heading, "text", 0);
      continue;
    }

    let partIndex = 0;
    for (const segment of segments) {
      if (segment.kind === "table") {
        const serialized = serializeTable(segment.content.split("\n"), segment.caption);
        push(withHeading(heading, serialized), "table", partIndex++);
        continue;
      }
      for (const piece of packSection(segment.content, target, overlap)) {
        push(withHeading(heading, piece), "text", partIndex++);
      }
    }
  }

  return result;
}
