/**
 * Structure-aware chunking for arbocatalogus text.
 *
 * Splits on hoofdstuk / risico / maatregel / werkplek headings. Tables (grenswaarden, PBM) stay
 * whole. `sourceRef` is a human-readable label ("Hoofdstuk 1 — Tillen en fysieke belasting");
 * structural detail lives in chunk metadata.
 */

import { packSection, type Chunk, type ChunkOptions } from "./chunk.js";
import { segmentText, serializeTable } from "./parse.js";

const DEFAULT_TARGET_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 200;

interface Section {
  heading: string | null;
  body: string;
  sectionType: string | null;
}

function isArboHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 160) return false;
  if (/^hoofdstuk\b/i.test(trimmed)) return true;
  if (/^(risico|maatregel|werkplek|branche)\b/i.test(trimmed)) return true;
  if (/^#{1,3}\s+/.test(trimmed)) return true;
  // Numbered catalog sections as in the OOMT EV arbocatalogus: "1.2. Risicobeschrijving",
  // "2.6. Persoonlijke beschermingsmiddelen (PBM's)". TOC lines that end in a page number are skipped.
  if (/\s+\d+$/.test(trimmed)) return false;
  // Numbered sentences that introduce a list ("2. Jongeren … mogen:") are body, not a section title.
  if (/[:;]$/.test(trimmed)) return false;
  if (/^\d+\.\d+(?:\.\d+)*\.?\s+\S/.test(trimmed)) return true;
  // Top-level "1. Elektrische Voertuigen" is a short title. Longer "1. Stroom door het lichaam …"
  // lines are numbered list items inside a section — keep them in the parent (target ≤40 chars).
  if (/^\d+\.\s+[A-ZÀ-ÖØ-Þ]/.test(trimmed) && trimmed.length <= 40) return true;
  return false;
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
  const sections: Section[] = [];
  let heading: string | null = null;
  let sectionType: string | null = null;
  let body: string[] = [];

  const flush = (): void => {
    const joined = body.join("\n").trim();
    if (joined.length > 0 || heading !== null) {
      sections.push({ heading, body: joined, sectionType });
    }
    body = [];
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (isArboHeading(trimmed)) {
      flush();
      heading = trimmed.replace(/^#{1,3}\s+/, "");
      sectionType = sectionTypeFor(heading);
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

  for (const [sectionIndex, section] of sectionize(text).entries()) {
    const heading = section.heading;
    const sectionType = section.sectionType;
    if (sectionType === "chapter" && heading) {
      currentChapter = heading;
    }

    const push = (content: string, chunkType: "text" | "table", partIndex: number): void => {
      const trimmed = content.trim();
      if (trimmed.length === 0) return;
      const sourceRef = currentChapter ?? heading;
      result.push({
        ordinal: ordinal++,
        content: trimmed,
        // Numbered EV sections are not "Hoofdstuk N"; still stamp the section heading so retrieval
        // evals can match expectedChapter (e.g. "1.2. Risicobeschrijving").
        chapter: currentChapter ?? heading,
        article: null,
        lid: null,
        sourceRef,
        chunkType,
        metadata: {
          heading,
          sectionIndex,
          partIndex,
          sectionType,
          ...(currentChapter ? { chapter: currentChapter } : {}),
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
