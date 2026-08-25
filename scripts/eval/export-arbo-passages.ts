/**
 * Export arbo golden passages from the gate/production DB for the G2-answer fixture route.
 *
 * Reads `golden-set.arbo.oomt.jsonl` (fund layer: expectedChapter), looks up matching chunks in
 * fund `oomt` / agent `arbo`, and writes:
 *   - packages/agents/src/evals/fixtures/golden-passages.arbo.oomt.jsonl
 *   - packages/agents/src/evals/fixtures/golden-set.arbo.oomt.g2.jsonl  (base-schema cases)
 *
 * No normalisation of chunk content — the verbatim quote-check must verify against DB bytes.
 * Re-run after every corpus_version bump (a corpus update is a release).
 *
 * Usage: pnpm --filter @wunderstack/eval-scripts export-arbo-passages
 * Needs DATABASE_URL (repo-root .env).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { and, asc, chunks, closeDb, documents, eq, withFundSchema } from "@wunderstack/db";
import { z } from "zod";

const FUND = "oomt";
const AGENT_KEY = "arbo";
/** Must match FUND_SET_META["arbo.oomt"].corpusVersion — bump both together. */
const CORPUS_VERSION = "arbo-oomt-2";

const fundCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expectedChapter: z.string().optional(),
  referenceAnswer: z.string(),
  category: z.enum(["in_scope", "refusal", "table", "derived"]),
});

type FundCase = z.infer<typeof fundCaseSchema>;

interface ExportedPassage {
  id: string;
  source: string;
  content: string;
  chapter?: string;
  chunkType: "text" | "table";
  sourceRef?: string;
  corpusVersion: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesDir = join(root, "packages", "agents", "src", "evals", "fixtures");
const fundSetPath = join(fixturesDir, "golden-set.arbo.oomt.jsonl");
const passagesOutPath = join(fixturesDir, "golden-passages.arbo.oomt.jsonl");
const g2CasesOutPath = join(fixturesDir, "golden-set.arbo.oomt.g2.jsonl");

function parseJsonl<T>(raw: string, schema: z.ZodType<T>): T[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split("\n").map((line) => schema.parse(JSON.parse(line)));
}

function slugChapter(chapter: string): string {
  return chapter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Near-miss distractors for refusal cases: related catalog chapters that do NOT answer the
 * out-of-scope question. Chosen so the model must refuse despite plausible context.
 */
const REFUSAL_DISTRACTOR_CHAPTERS: Record<string, string[]> = {
  "arbo-oomt-ref-01": ["2.6. Persoonlijke beschermingsmiddelen (PBM’s)", "1.2. Risicobeschrijving"],
  "arbo-oomt-ref-02": ["2.1. Spanningsloos maken HV-systeem in stappen", "2.5. Richtlijnen BHV inzake calamiteiten met e-voertuigen"],
  "arbo-oomt-ref-03": ["2.3. Aanwijsbeleid e-voertuigen (EV- VOP, ev-VP, ev-WV) - Voorlichting en instructie", "2.6. Persoonlijke beschermingsmiddelen (PBM’s)"],
};

async function chunksForChapter(chapter: string): Promise<
  Array<{ id: string; content: string; chapter: string | null; sourceRef: string | null; chunkType: string; title: string; version: string }>
> {
  return withFundSchema(FUND, async (db) => {
    const rows = await db
      .select({
        id: chunks.id,
        content: chunks.content,
        chapter: chunks.chapter,
        sourceRef: chunks.sourceRef,
        chunkType: chunks.chunkType,
        title: documents.title,
        version: documents.version,
      })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(
        and(
          eq(documents.fund, FUND),
          eq(documents.agentKey, AGENT_KEY),
          eq(chunks.chapter, chapter),
        ),
      )
      .orderBy(asc(chunks.ordinal));
    return rows;
  });
}

function toPassage(
  row: { id: string; content: string; chapter: string | null; sourceRef: string | null; chunkType: string; title: string },
  stableId: string,
): ExportedPassage {
  const chunkType = row.chunkType === "table" ? "table" : "text";
  return {
    id: stableId,
    source: row.title,
    content: row.content,
    ...(row.chapter ? { chapter: row.chapter } : {}),
    chunkType,
    ...(row.sourceRef ? { sourceRef: row.sourceRef } : {}),
    corpusVersion: CORPUS_VERSION,
  };
}

async function main(): Promise<void> {
  const cases = parseJsonl(readFileSync(fundSetPath, "utf8"), fundCaseSchema);
  const passageByStableId = new Map<string, ExportedPassage>();
  const chapterToPassageIds = new Map<string, string[]>();
  const missing: Array<{ caseId: string; chapter: string; reason: string }> = [];

  const chaptersNeeded = new Set<string>();
  for (const testCase of cases) {
    if (testCase.expectedChapter) chaptersNeeded.add(testCase.expectedChapter);
  }
  for (const distractors of Object.values(REFUSAL_DISTRACTOR_CHAPTERS)) {
    for (const chapter of distractors) chaptersNeeded.add(chapter);
  }

  for (const chapter of [...chaptersNeeded].sort()) {
    const rows = await chunksForChapter(chapter);
    if (rows.length === 0) {
      console.warn(`No chunks for chapter: ${JSON.stringify(chapter)}`);
      continue;
    }
    // Prefer the longest chunk for the chapter as the G2 grounding passage (covers the section).
    const best = [...rows].sort((a, b) => b.content.length - a.content.length)[0];
    if (!best) continue;
    const stableId = `arbo-${slugChapter(chapter)}`;
    const passage = toPassage(best, stableId);
    passageByStableId.set(stableId, passage);
    chapterToPassageIds.set(chapter, [stableId]);
    console.log(`  ${stableId}: ${rows.length} chunk(s), using ${String(best.content.length)} chars, dbVersion=${best.version}`);
  }

  for (const testCase of cases) {
    if (testCase.category === "refusal") continue;
    const chapter = testCase.expectedChapter;
    if (!chapter) {
      missing.push({ caseId: testCase.id, chapter: "(none)", reason: "answerable case without expectedChapter" });
      continue;
    }
    if (!chapterToPassageIds.has(chapter)) {
      missing.push({ caseId: testCase.id, chapter, reason: "no DB chunk for expectedChapter" });
    }
  }

  const passages = [...passageByStableId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const passagesBody = passages.map((passage) => JSON.stringify(passage)).join("\n");
  writeFileSync(passagesOutPath, `${passagesBody}\n`, "utf8");

  const g2Cases = cases.map((testCase) => {
    if (testCase.category === "refusal") {
      const distractorChapters = REFUSAL_DISTRACTOR_CHAPTERS[testCase.id] ?? [];
      const distractorPassageIds = distractorChapters.flatMap(
        (chapter) => chapterToPassageIds.get(chapter) ?? [],
      );
      if (distractorPassageIds.length === 0) {
        missing.push({
          caseId: testCase.id,
          chapter: distractorChapters.join(" | ") || "(none)",
          reason: "refusal case has no resolvable distractor passages",
        });
      }
      return {
        id: testCase.id,
        question: testCase.question,
        expectedPassageIds: [] as string[],
        distractorPassageIds,
        referenceAnswer: testCase.referenceAnswer,
        category: "refusal" as const,
      };
    }
    const ids = testCase.expectedChapter
      ? (chapterToPassageIds.get(testCase.expectedChapter) ?? [])
      : [];
    return {
      id: testCase.id,
      question: testCase.question,
      expectedPassageIds: ids,
      referenceAnswer: testCase.referenceAnswer,
      category: testCase.category,
      ...(testCase.expectedChapter ? { expectedChapter: testCase.expectedChapter } : {}),
    };
  });

  writeFileSync(g2CasesOutPath, `${g2Cases.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

  const passagesWritten = readFileSync(passagesOutPath, "utf8");
  const casesWritten = readFileSync(g2CasesOutPath, "utf8");
  const contentHash = createHash("sha256")
    .update(passagesWritten)
    .update("\0")
    .update(casesWritten)
    .digest("hex");
  const metaPath = join(fixturesDir, "golden-passages.arbo.oomt.meta.json");
  writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        corpusVersion: CORPUS_VERSION,
        fund: FUND,
        agentKey: AGENT_KEY,
        exportedAt: new Date().toISOString(),
        passageCount: passages.length,
        caseCount: g2Cases.length,
        contentHash,
        runbook: "Re-run after every corpus_version bump: pnpm --filter @wunderstack/eval-scripts export-arbo-passages",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`\nWrote ${String(passages.length)} passages → ${passagesOutPath}`);
  console.log(`Wrote ${String(g2Cases.length)} G2 cases → ${g2CasesOutPath}`);
  console.log(`content hash (passages+cases): ${contentHash.slice(0, 16)}…`);
  if (missing.length > 0) {
    console.log("\nCases without a resolvable passage (informational):");
    for (const row of missing) {
      console.log(`  ${row.caseId}: ${row.reason} — ${row.chapter}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
