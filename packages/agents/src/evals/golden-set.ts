import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function readJsonl<T>(filename: string, schema: z.ZodType<T>): T[] {
  const raw = readFileSync(join(fixturesDir, filename), "utf8").trim();
  if (raw.length === 0) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => schema.parse(JSON.parse(line)));
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
 */
export const GOLDEN_CORPUS_VERSION = "1";

export const goldenPassages = readJsonl("golden-passages.jsonl", goldenPassageSchema);
export const goldenCases = readJsonl("golden-set.jsonl", goldenCaseSchema);

export function passageById(id: string): GoldenPassage | undefined {
  return goldenPassages.find((passage) => passage.id === id);
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
