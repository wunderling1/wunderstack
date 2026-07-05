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

export const goldenCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expectedPassageIds: z.array(z.string()),
  expectedArticle: z.string().optional(),
  expectedLid: z.string().optional(),
  referenceAnswer: z.string().min(1),
  category: goldenCaseCategorySchema,
});

export type GoldenPassage = z.infer<typeof goldenPassageSchema>;
export type GoldenCase = z.infer<typeof goldenCaseSchema>;
export type GoldenCaseCategory = z.infer<typeof goldenCaseCategorySchema>;

export const goldenPassages = readJsonl("golden-passages.jsonl", goldenPassageSchema);
export const goldenCases = readJsonl("golden-set.jsonl", goldenCaseSchema);

export function passageById(id: string): GoldenPassage | undefined {
  return goldenPassages.find((passage) => passage.id === id);
}

export function passagesForCase(testCase: GoldenCase): GoldenPassage[] {
  return testCase.expectedPassageIds
    .map((id) => passageById(id))
    .filter((passage): passage is GoldenPassage => passage !== undefined);
}
