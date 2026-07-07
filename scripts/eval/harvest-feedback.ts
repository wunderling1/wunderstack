import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@wunderstack/shared";
import { z } from "zod";

/**
 * Harvest negative user feedback from Langfuse into reviewable candidate cases for the golden set
 * (Fase 12, closing the loop: use → data → eval → better agent).
 *
 * Manual utility (not CI): it reads "user-feedback" scores via the Langfuse public API, keeps the
 * thumbs-down ones (value 0), fetches each trace for the question + answer, and writes a JSONL of
 * candidate cases. A human reviews and curates these into `packages/agents/src/evals/fixtures/
 * golden-set.jsonl` — feedback never enters the eval automatically.
 *
 *   pnpm --filter @wunderstack/eval-scripts harvest-feedback
 *
 * Requires LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (and LANGFUSE_BASE_URL for self-hosted).
 */

const SCORE_NAME = "user-feedback";
const PAGE_LIMIT = 100;

const scoreSchema = z.object({
  id: z.string(),
  traceId: z.string().nullish(),
  name: z.string(),
  value: z.number().nullish(),
  comment: z.string().nullish(),
  timestamp: z.string().nullish(),
});

const scoresResponseSchema = z.object({
  data: z.array(scoreSchema),
  meta: z.object({ page: z.number(), totalPages: z.number() }),
});

interface Candidate {
  status: "needs_review";
  sourceTraceId: string;
  question: string | null;
  answer: string | null;
  reason: string | null;
  timestamp: string | null;
}

function authHeader(): string {
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    console.error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set to harvest feedback.");
    process.exit(1);
  }
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
}

function baseUrl(): string {
  return (env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com").replace(/\/+$/, "");
}

async function getJson(path: string, auth: string): Promise<unknown> {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { authorization: auth, "content-type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${String(response.status)} ${await response.text().catch(() => "")}`);
  }
  return response.json();
}

/** Recursively find the first string value under any of the given keys (traces vary in shape). */
function findString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== "object") {
    return null;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(k) && typeof v === "string" && v.trim().length > 0) {
      return v;
    }
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findString(v, keys, depth + 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

async function fetchDownvotedScores(auth: string): Promise<z.infer<typeof scoreSchema>[]> {
  const downvoted: z.infer<typeof scoreSchema>[] = [];
  let page = 1;
  for (;;) {
    const raw = await getJson(
      `/api/public/v2/scores?name=${encodeURIComponent(SCORE_NAME)}&page=${String(page)}&limit=${String(PAGE_LIMIT)}`,
      auth,
    );
    const parsed = scoresResponseSchema.parse(raw);
    for (const score of parsed.data) {
      if (score.traceId && (score.value ?? 1) <= 0) {
        downvoted.push(score);
      }
    }
    if (parsed.meta.page >= parsed.meta.totalPages || parsed.data.length === 0) {
      break;
    }
    page += 1;
  }
  return downvoted;
}

async function toCandidate(
  score: z.infer<typeof scoreSchema>,
  auth: string,
): Promise<Candidate> {
  const traceId = score.traceId as string;
  let question: string | null = null;
  let answer: string | null = null;
  try {
    const trace = await getJson(`/api/public/traces/${encodeURIComponent(traceId)}`, auth);
    question = findString(trace, ["question", "input", "query"]);
    answer = findString((trace as { output?: unknown }).output, ["answer", "text", "output"]);
  } catch (error) {
    console.warn(`  could not fetch trace ${traceId}:`, error instanceof Error ? error.message : error);
  }
  return {
    status: "needs_review",
    sourceTraceId: traceId,
    question,
    answer,
    reason: score.comment ?? null,
    timestamp: score.timestamp ?? null,
  };
}

async function main(): Promise<void> {
  const auth = authHeader();
  console.log(`Harvesting "${SCORE_NAME}" thumbs-down scores from ${baseUrl()} …`);

  const downvoted = await fetchDownvotedScores(auth);
  console.log(`Found ${String(downvoted.length)} thumbs-down score(s).`);

  const candidates: Candidate[] = [];
  for (const score of downvoted) {
    candidates.push(await toCandidate(score, auth));
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "candidates");
  await mkdir(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outPath = join(outDir, `harvested-${date}.jsonl`);
  const body = candidates.map((c) => JSON.stringify(c)).join("\n");
  await writeFile(outPath, body.length > 0 ? `${body}\n` : "", "utf8");

  console.log(`Wrote ${String(candidates.length)} candidate case(s) to ${outPath}`);
  console.log("Review these by hand before adding any to golden-set.jsonl.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
