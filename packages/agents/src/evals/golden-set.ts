import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RetrievedChunk } from "@wunderstack/rag";
import { z } from "zod";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** Raw bytes of a fixture file (used both for parsing and for the content hash below). */
function readFixture(filename: string): string {
  return readFileSync(join(fixturesDir, filename), "utf8");
}

function parseJsonl<T>(raw: string, schema: z.ZodType<T>): T[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split("\n").map((line) => schema.parse(JSON.parse(line)));
}

export const goldenPassageSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  content: z.string().min(1),
  article: z.string().optional(),
  lid: z.string().optional(),
  chunkType: z.enum(["text", "table"]).default("text"),
});

export const goldenCaseCategorySchema = z.enum(["in_scope", "refusal", "table"]);
export const goldenCaseHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const goldenCaseSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    history: z.array(goldenCaseHistoryMessageSchema).max(6).optional(),
    expectedPassageIds: z.array(z.string()),
    /**
     * Near-miss "distractor" passages (related topic, but WITHOUT the answer) fed as context to a
     * refusal case, so the model must refuse despite plausible-looking context — the hardest refusal
     * scenario. Required non-empty for `category === "refusal"` (see refinement below); a refusal
     * case with no distractors would test nothing, so it is rejected at load time. Ignored for
     * answerable cases, which use `expectedPassageIds`.
     */
    distractorPassageIds: z.array(z.string()).optional(),
    expectedArticle: z.string().optional(),
    expectedLid: z.string().optional(),
    referenceAnswer: z.string().min(1),
    category: goldenCaseCategorySchema,
  })
  .superRefine((data, ctx) => {
    if (data.category === "refusal" && (data.distractorPassageIds?.length ?? 0) === 0) {
      ctx.addIssue({
        code: "custom",
        message: "refusal cases must define at least one distractorPassageId (near-miss context)",
        path: ["distractorPassageIds"],
      });
    }
  });

export type GoldenPassage = z.infer<typeof goldenPassageSchema>;
export type GoldenCase = z.infer<typeof goldenCaseSchema>;
export type GoldenCaseCategory = z.infer<typeof goldenCaseCategorySchema>;

/**
 * Corpus snapshot the golden set is pinned against. Gate B recall is only comparable within one
 * snapshot: bump this deliberately when the underlying CAO corpus (golden-passages.jsonl) changes,
 * so a new CAO text does not silently fail retrieval gates that were tuned on the old corpus.
 * Expected sources are identified by article/lid (stable CAO structure), never by chunk id, so a
 * structure-aware re-chunk within the same snapshot must not move this version.
 *
 * Curation policy (E10): the two fixture files are the single source of truth and are curated BY
 * HAND — the old generator (build-golden-fixtures.ts) was removed because a script that can
 * overwrite the fixtures is a silent-corruption risk with no benefit. Any fixture edit must bump
 * this version (the eval's fixture-hash guard fails a change that skips the bump). From E12 the set
 * grows through the co-creation process, still committed by hand.
 *
 * v3 (E12): replaced the fictional "CAO Voorbeeldsector" seed with the real CAO Elektrotechnische
 * Detailhandel 2023 (fund ETD). Passages are verbatim article text from the source PDF; cases are
 * expert-reviewed OOMT-branche questions incl. conditional/date-disambiguation traps (review log:
 * fixtures/golden-set.REVIEW.md). Article anchors follow the CAO's own N.M numbering (e.g. "6.2").
 */
export const GOLDEN_CORPUS_VERSION = "3";

const passagesRaw = readFixture("golden-passages.jsonl");
const casesRaw = readFixture("golden-set.jsonl");

export const goldenPassages = parseJsonl(passagesRaw, goldenPassageSchema);
export const goldenCases = parseJsonl(casesRaw, goldenCaseSchema);

/**
 * Content hash over BOTH fixture files (raw bytes). Recorded in the baseline (see baseline.ts);
 * the eval fails when this changes while GOLDEN_CORPUS_VERSION stays the same — i.e. someone edited
 * the golden set without a deliberate version bump, which would silently invalidate the baseline.
 * The NUL separator keeps the two files unambiguous (no boundary collision).
 */
export const GOLDEN_FIXTURE_HASH = createHash("sha256")
  .update(passagesRaw)
  .update("\0")
  .update(casesRaw)
  .digest("hex");

// Built once at module load so lookups are O(1) instead of a linear scan per call.
const passageMap = new Map(goldenPassages.map((passage) => [passage.id, passage] as const));

export function passageById(id: string): GoldenPassage | undefined {
  return passageMap.get(id);
}

export function passagesForCase(testCase: GoldenCase): GoldenPassage[] {
  // Refusal cases are fed their near-miss distractor context (related topic, no answer) so the
  // model must refuse despite plausible context; answerable cases use their expected passages.
  const ids =
    testCase.category === "refusal"
      ? (testCase.distractorPassageIds ?? [])
      : testCase.expectedPassageIds;
  return ids
    .map((id) => passageById(id))
    .filter((passage): passage is GoldenPassage => passage !== undefined);
}

/** Anchor shown in context, mirroring production sourceRef: "Artikel 3" / "Bijlage 1". */
function sourceRefFor(passage: GoldenPassage): string | null {
  if (!passage.article) return null;
  return /^bijlage/i.test(passage.article) ? passage.article : `Artikel ${passage.article}`;
}

/** Map a fixture passage to the production hit shape so Gate C can use assemble(). */
export function passageToHit(passage: GoldenPassage): RetrievedChunk {
  return {
    chunkId: passage.id,
    ordinal: 0,
    content: passage.content,
    score: 1,
    source: {
      documentId: "",
      title: passage.source,
      sourceUri: "",
      fund: "eval",
      version: GOLDEN_CORPUS_VERSION,
    },
    structure: {
      chapter: null,
      article: passage.article ?? null,
      lid: passage.lid ?? null,
      sourceRef: sourceRefFor(passage),
      chunkType: passage.chunkType,
    },
    metadata: {},
  };
}
