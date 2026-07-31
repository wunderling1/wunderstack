/**
 * Ingest structure report — visibility, not a gate.
 *
 * The diagnosis of 2026-07-30 (docs/eval/diagnosis-fund-article-metadata-2026-07-30.md) found that a
 * real CAO PDF goes through the production ingest and comes out with zero structural anchors: no
 * `article`, no `source_ref`, no table chunks — and that no gate watches that layer. This report is
 * the missing instrument. It runs at the end of every ingest and can also be pointed read-only at an
 * already-ingested fund, so a baseline can be measured without paying for a re-embed.
 *
 * It deliberately sets NO thresholds and never fails a run (open decision B4): thresholds only come
 * after calibration, and then only move up. The one hard coupling lives in the promotion check.
 *
 * Usage (read-only, existing fund):
 *   pnpm --filter @wunderstack/ingest report --fund demo
 *   pnpm --filter @wunderstack/ingest report --fund demo --label before   # suffix the filename
 *   pnpm --filter @wunderstack/ingest report --fund demo --no-write       # console only
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { asc, chunks as chunksTable, closeDb, documents, eq, getDb } from "@wunderstack/db";

import { describeFailure } from "./diagnostics.js";

const REPORT_DIR = ["docs", "eval", "ingest"];

/** Repo root, derived from this file's location (scripts/ingest/report.ts). */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The minimum a chunk must expose to be measured. Both a freshly produced `Chunk` (chunk.ts) and a
 * database row satisfy it, so the metrics are computed by exactly one code path either way.
 */
export interface ReportChunk {
  content: string;
  article: string | null;
  sourceRef: string | null;
  chunkType: string;
}

/**
 * Structure patterns MIRRORED from the chunker (chunk.ts: isHeading:45, extractArticle:143,
 * extractSectionArticle:154). Duplicated on purpose: chunk.ts is frozen for this work, so the report
 * may not reach into it and may not change it. `report.test.ts` runs real text through the real
 * `chunk()` and asserts the mirror still agrees, so drift fails a gate instead of quietly skewing
 * the numbers.
 */
const HEADING_KEYWORD = /^(artikel|hoofdstuk|bijlage|paragraaf)\b/i;
const NUMBERED_HEADING = /^\d+(\.\d+)*[.)]?(\s+\S+)?$/;
const TITLED_SECTION_HEADING = /^\d+(?:\.\d+)+[.)]?\s+\p{L}/u;
const ARTICLE_HEADING = /^artikel\s+\d+[a-z]?/i;
const SECTION_HEADING = /^\d+\.\d+(?:\.\d+)*[.)]?(?=\s|$)/;
/** `extractBijlage` also produces an `article` value ("Bijlage 1"), so it counts as anchorable. */
const BIJLAGE_HEADING = /^bijlage\s+\S/i;

/** Mirror of chunk.ts `isHeading`: the gate every structural extractor sits behind. */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  if (HEADING_KEYWORD.test(trimmed)) return true;
  if (NUMBERED_HEADING.test(trimmed) && trimmed.length <= 80) return true;
  return TITLED_SECTION_HEADING.test(trimmed) && !/\s{2,}/.test(trimmed) && trimmed.length <= 80;
}

function lines(content: string): string[] {
  return content.split("\n");
}

/** Any line that starts with "Artikel N", heading-shaped or not. The raw "structure is in the text" signal. */
function hasArticleHeadingText(content: string): boolean {
  return lines(content).some((line) => ARTICLE_HEADING.test(line.trim()));
}

/** Any line that starts with an N.M section number, heading-shaped or not. */
function hasSectionHeadingText(content: string): boolean {
  return lines(content).some((line) => SECTION_HEADING.test(line.trim()));
}

/**
 * Whether the frozen chunker would actually have anchored this chunk: the heading line must pass
 * `isHeading` first. A long prose line that happens to start with "1.3. Gedeeltelijk …" reads as
 * structure to the eye but is invisible to the chunker — that gap is the point of measuring both.
 */
export function isAnchorableByChunker(content: string): boolean {
  return lines(content).some((line) => {
    const trimmed = line.trim();
    if (!isHeadingLine(trimmed)) return false;
    return ARTICLE_HEADING.test(trimmed) || SECTION_HEADING.test(trimmed) || BIJLAGE_HEADING.test(trimmed);
  });
}

const LIST_MARKER = /^[•▪◦·*\-–—]/;
const OPENS_MID_SENTENCE = /^[.,;:!?)\]}…»”’"']/;

/**
 * Mid-sentence start (decision D4): the chunk opens with a lowercase letter or a punctuation mark.
 * List markers and digits are excluded — a chunk starting at "• Schriftelijke bevestiging" or at a
 * clause number "3." is a legitimate boundary, not a severed sentence. Signal only, never a threshold.
 */
export function startsMidSentence(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  const first = [...trimmed][0];
  if (first === undefined) return false;
  if (LIST_MARKER.test(first) || /^\d/.test(first)) return false;
  return /^\p{Ll}/u.test(first) || OPENS_MID_SENTENCE.test(first);
}

/**
 * Inline "artikel" cross-references: occurrences that are NOT the first thing on their line, i.e. a
 * reference like "(artikel 3.1, tweede punt)" rather than a heading. Context for the cross-reference
 * golden-set case: such a mention must never become the citation anchor for the surrounding fact.
 */
function countInlineArticleRefs(content: string): number {
  let count = 0;
  for (const line of lines(content)) {
    const indent = line.length - line.trimStart().length;
    for (const match of line.matchAll(/artikel/gi)) {
      if (match.index > indent) count++;
    }
  }
  return count;
}

export interface StructureMetrics {
  chunkCount: number;
  textChunks: number;
  tableChunks: number;
  withArticle: number;
  withSourceRef: number;
  /** Chunks whose text contains a line-leading "Artikel N" (regardless of whether it got anchored). */
  articleHeadingInText: number;
  /** Same, for the N.M section-number article style. */
  sectionHeadingInText: number;
  /** Line-leading "Artikel N" present but `article` is null — structure that exists and was lost. */
  unanchoredArticleHeadings: number;
  /** Line-leading N.M present but `article` is null. */
  unanchoredSectionHeadings: number;
  /** Chunks the frozen chunker would have anchored (heading-shaped line) but did not. */
  anchorableButUnanchored: number;
  midSentenceStarts: number;
  /** Total inline "artikel" mentions across all chunks. */
  inlineArticleRefs: number;
  /** Chunks containing at least one inline "artikel" mention. */
  chunksWithInlineArticleRef: number;
}

export function computeStructureMetrics(chunks: readonly ReportChunk[]): StructureMetrics {
  const metrics: StructureMetrics = {
    chunkCount: chunks.length,
    textChunks: 0,
    tableChunks: 0,
    withArticle: 0,
    withSourceRef: 0,
    articleHeadingInText: 0,
    sectionHeadingInText: 0,
    unanchoredArticleHeadings: 0,
    unanchoredSectionHeadings: 0,
    anchorableButUnanchored: 0,
    midSentenceStarts: 0,
    inlineArticleRefs: 0,
    chunksWithInlineArticleRef: 0,
  };

  for (const piece of chunks) {
    if (piece.chunkType === "table") metrics.tableChunks++;
    else metrics.textChunks++;

    const anchored = piece.article !== null && piece.article.length > 0;
    if (anchored) metrics.withArticle++;
    if (piece.sourceRef !== null && piece.sourceRef.length > 0) metrics.withSourceRef++;

    const hasArticleText = hasArticleHeadingText(piece.content);
    const hasSectionText = hasSectionHeadingText(piece.content);
    if (hasArticleText) metrics.articleHeadingInText++;
    if (hasSectionText) metrics.sectionHeadingInText++;
    if (!anchored) {
      if (hasArticleText) metrics.unanchoredArticleHeadings++;
      if (hasSectionText) metrics.unanchoredSectionHeadings++;
      if (isAnchorableByChunker(piece.content)) metrics.anchorableButUnanchored++;
    }

    if (startsMidSentence(piece.content)) metrics.midSentenceStarts++;

    const inline = countInlineArticleRefs(piece.content);
    metrics.inlineArticleRefs += inline;
    if (inline > 0) metrics.chunksWithInlineArticleRef++;
  }

  return metrics;
}

export interface ReportDocument {
  sourceUri: string;
  version: string;
  ingestedAt: string | null;
  chunkCount: number;
}

export type ReportSource = "database" | "in-memory";

export interface StructureReport {
  fund: string;
  generatedAt: string;
  /** "database" = read back from what was actually stored; "in-memory" = a dry-run's chunk output. */
  source: ReportSource;
  label?: string;
  metrics: StructureMetrics;
  documents: ReportDocument[];
}

/** Read every stored chunk of a fund, plus its document rows, for a read-only measurement. */
export async function loadFundChunks(
  fund: string,
): Promise<{ chunks: ReportChunk[]; documents: ReportDocument[] }> {
  const db = getDb();

  const docRows = await db
    .select({
      id: documents.id,
      sourceUri: documents.sourceUri,
      version: documents.version,
      ingestedAt: documents.ingestedAt,
    })
    .from(documents)
    .where(eq(documents.fund, fund))
    .orderBy(asc(documents.sourceUri));

  const chunkRows = await db
    .select({
      documentId: chunksTable.documentId,
      content: chunksTable.content,
      article: chunksTable.article,
      sourceRef: chunksTable.sourceRef,
      chunkType: chunksTable.chunkType,
    })
    .from(chunksTable)
    .innerJoin(documents, eq(chunksTable.documentId, documents.id))
    .where(eq(documents.fund, fund))
    .orderBy(asc(chunksTable.ordinal));

  const perDocument = new Map<string, number>();
  for (const row of chunkRows) {
    perDocument.set(row.documentId, (perDocument.get(row.documentId) ?? 0) + 1);
  }

  return {
    chunks: chunkRows.map((row) => ({
      content: row.content,
      article: row.article,
      sourceRef: row.sourceRef,
      chunkType: row.chunkType,
    })),
    documents: docRows.map((row) => ({
      sourceUri: row.sourceUri,
      version: row.version,
      ingestedAt: row.ingestedAt instanceof Date ? row.ingestedAt.toISOString() : null,
      chunkCount: perDocument.get(row.id) ?? 0,
    })),
  };
}

export function buildReport(input: {
  fund: string;
  source: ReportSource;
  label?: string;
  chunks: readonly ReportChunk[];
  documents?: ReportDocument[];
  now?: Date;
}): StructureReport {
  return {
    fund: input.fund,
    generatedAt: (input.now ?? new Date()).toISOString(),
    source: input.source,
    ...(input.label ? { label: input.label } : {}),
    metrics: computeStructureMetrics(input.chunks),
    documents: input.documents ?? [],
  };
}

function pct(part: number, total: number): string {
  if (total === 0) return "n/a";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function share(part: number, total: number): string {
  return `${String(part)}/${String(total)} (${pct(part, total)})`;
}

export function formatConsoleSummary(report: StructureReport): string {
  const m = report.metrics;
  const rows: [string, string][] = [
    ["chunks", `${String(m.chunkCount)} (${String(m.textChunks)} text, ${String(m.tableChunks)} table)`],
    ["article coverage", share(m.withArticle, m.chunkCount)],
    ["source_ref coverage", share(m.withSourceRef, m.chunkCount)],
    ["unanchored 'Artikel N'", String(m.unanchoredArticleHeadings)],
    ["unanchored 'N.M'", String(m.unanchoredSectionHeadings)],
    ["anchorable but unanchored", String(m.anchorableButUnanchored)],
    ["mid-sentence starts", share(m.midSentenceStarts, m.chunkCount)],
    ["inline 'artikel' refs", `${String(m.inlineArticleRefs)} in ${String(m.chunksWithInlineArticleRef)} chunks`],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  const body = rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join("\n");
  return `Ingest structure report — fund "${report.fund}" (${report.source}, visibility only)\n${body}`;
}

export function renderMarkdown(report: StructureReport): string {
  const m = report.metrics;
  const date = report.generatedAt.slice(0, 10);
  const sourceLabel =
    report.source === "database" ? "read-only meting op de opgeslagen chunks" : "dry-run, chunks in geheugen";

  const documentRows =
    report.documents.length > 0
      ? report.documents
          .map(
            (doc) =>
              `| \`${doc.sourceUri}\` | ${doc.version} | ${doc.ingestedAt?.slice(0, 19).replace("T", " ") ?? "—"} | ${String(doc.chunkCount)} |`,
          )
          .join("\n")
      : "| — | — | — | — |";

  return `# Ingest-structuurrapport — \`${report.fund}\`${report.label ? ` (${report.label})` : ""}

> **Gegenereerd:** ${report.generatedAt} · **Bron:** ${sourceLabel}
> **Status:** visibility, **geen gate** — dit rapport zet geen drempels en laat geen run falen
> (open besluit B4). Alle cijfers zijn **[gemeten]**.
> **Instrument:** \`scripts/ingest/report.ts\`

## Documenten in dit fonds

| Bron | Versie | Laatste ingest | Chunks |
|---|---|---|---|
${documentRows}

## Structuurdekking

| Maat | Waarde |
|---|---|
| Chunks totaal | ${String(m.chunkCount)} |
| Chunk-types | ${String(m.textChunks)} text · ${String(m.tableChunks)} table |
| Met \`article\` | ${share(m.withArticle, m.chunkCount)} |
| Met \`source_ref\` | ${share(m.withSourceRef, m.chunkCount)} |

## Verloren structuur

Chunks waarin de structuur wél in de tekst staat, maar niet als anker is vastgelegd. Dit is het
signaal uit §2 van de diagnose: staat er een regel-leidende \`Artikel N\` in de chunk terwijl
\`article\` leeg is, dan is er structuur weggegooid die er wel was.

| Maat | Waarde |
|---|---|
| Regel-leidende \`Artikel N\` in de tekst | ${String(m.articleHeadingInText)} |
| Regel-leidende \`N.M\` in de tekst | ${String(m.sectionHeadingInText)} |
| Regel-leidende \`Artikel N\` **zonder** \`article\` | ${String(m.unanchoredArticleHeadings)} |
| Regel-leidende \`N.M\` **zonder** \`article\` | ${String(m.unanchoredSectionHeadings)} |
| Door de chunker ankerbaar, toch niet geankerd | ${String(m.anchorableButUnanchored)} |

De laatste regel is de strengste lezing: die eist dat de regel ook door \`isHeading\` heen komt
(≤120 tekens, kop-vormig). Ligt hij lager dan de twee regels erboven, dan staat de structuur
mid-proza en zou de chunker hem ook op een schone regel niet hebben gezien.

## Chunkkwaliteit

| Maat | Waarde |
|---|---|
| Begint mid-zin (D4) | ${share(m.midSentenceStarts, m.chunkCount)} |
| Inline \`artikel\`-kruisverwijzingen | ${String(m.inlineArticleRefs)} in ${String(m.chunksWithInlineArticleRef)} chunks |

Mid-zin-start is een heuristiek, geen drempel: chunk-starts met een kleine letter of een leesteken,
met lijst-items en cijfers uitgezonderd. Inline kruisverwijzingen zijn context, geen defect — ze
tellen mee omdat een citaat nooit aan een kruisverwezen artikel geankerd mag worden.

---

*Rapportdatum ${date}. Reproduceren:* \`pnpm --filter @wunderstack/ingest report --fund ${report.fund}\`
`;
}

/** Never overwrite an existing report: evidence from an earlier run on the same day must survive. */
async function uniqueReportPath(fund: string, date: string, label?: string): Promise<string> {
  const dir = join(repoRoot, ...REPORT_DIR);
  await mkdir(dir, { recursive: true });
  const base = `INGEST-${fund}-${date}${label ? `-${label}` : ""}`;
  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = join(dir, `${base}${suffix === 0 ? "" : `-${String(suffix + 1)}`}.md`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error(`Could not find a free report filename for ${base}.`);
}

export async function writeReport(report: StructureReport): Promise<string> {
  const path = await uniqueReportPath(report.fund, report.generatedAt.slice(0, 10), report.label);
  await writeFile(path, renderMarkdown(report), "utf8");
  return relative(repoRoot, path);
}

/**
 * Report on a just-finished ingest run. Called at the end of run.ts. Reads back from the database so
 * the report reflects what is actually stored (including documents from earlier runs of the same
 * fund); a dry-run has nothing stored, so it measures the in-memory chunk output instead.
 */
export async function reportAfterIngest(options: {
  fund: string;
  dryRun: boolean;
  chunks: readonly ReportChunk[];
  label?: string;
  write?: boolean;
}): Promise<StructureReport> {
  const labelled = options.label ? { label: options.label } : {};
  const report = options.dryRun
    ? buildReport({ fund: options.fund, source: "in-memory", chunks: options.chunks, ...labelled })
    : await loadFundChunks(options.fund).then((loaded) =>
        buildReport({
          fund: options.fund,
          source: "database",
          chunks: loaded.chunks,
          documents: loaded.documents,
          ...labelled,
        }),
      );

  console.log(`\n${formatConsoleSummary(report)}`);
  // A dry-run stored nothing, so it may not leave behind a document that reads like a measurement of
  // stored data. It reports to the console and writes no file.
  if (options.write !== false && !options.dryRun) {
    const path = await writeReport(report);
    console.log(`  report written to ${path}`);
  }
  return report;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      fund: { type: "string" },
      label: { type: "string" },
      "no-write": { type: "boolean", default: false },
    },
  });

  const fund = values.fund;
  if (fund === undefined || fund.length === 0) {
    throw new Error("Missing --fund <fund>. Example: report --fund demo");
  }

  const loaded = await loadFundChunks(fund);
  if (loaded.chunks.length === 0) {
    throw new Error(
      `No chunks found for fund "${fund}". Nothing ingested under that fund, or the name is misspelled.`,
    );
  }

  const report = buildReport({
    fund,
    source: "database",
    chunks: loaded.chunks,
    documents: loaded.documents,
    ...(values.label ? { label: values.label } : {}),
  });

  console.log(formatConsoleSummary(report));
  if (values["no-write"] !== true) {
    const path = await writeReport(report);
    console.log(`  report written to ${path}`);
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  main()
    .catch((error: unknown) => {
      console.error(describeFailure(error));
      process.exitCode = 1;
    })
    .finally(closeDb);
}
