/**
 * Embedding bake-off runner (Fase 3, decision gate).
 *
 * Embeds the labeled CAO passages + questions (from @wunderstack/shared) with each candidate model,
 * scores retrieval quality with hit-rate / recall@k / MRR, prints a table, and writes
 * results.md. The winner (among sovereign EU candidates only) is picked on measured recall,
 * with sovereignty as a hard constraint — never "on feeling" (see .cursor/rules/400-data-rag.mdc).
 *
 * Run: pnpm --filter @wunderstack/bake-off bake-off   (loads repo-root .env automatically)
 */

import { writeFile } from "node:fs/promises";

import { DEFAULT_EMBEDDING_VERSION, embed } from "@wunderstack/ai";
import { caoLabeledPassages as passages, caoLabeledQueries as queries } from "@wunderstack/shared";
import { z } from "zod";

interface Candidate {
  /** Label shown in the results table. */
  key: string;
  /** Provider-side model id. */
  model: string;
  /**
   * Requested output dimension. Left undefined here: Scaleway's Generative APIs currently
   * only accept a model's *maximum* dimension and do NOT support Matryoshka trimming
   * (e.g. to 2000). We therefore embed at native dimension and record it from the response.
   */
  dimensions?: number;
  provider: "scaleway" | "openai-reference";
  /**
   * true = EU-sovereign, eligible to WIN the bake-off and be used in production.
   * false = non-EU reference, included only to MEASURE the quality gap. Never a winner,
   * never in the request path. Opt-in via BAKEOFF_INCLUDE_US_REFERENCE=1 (see below).
   */
  sovereign: boolean;
}

/** k values we report recall/hit-rate for. */
const K_VALUES = [1, 3, 5] as const;
/** Primary metric used to pick the winner: does the correct passage land in the top-k the
 *  agent would actually receive as context. Tie-break on MRR, then hit@1. */
const PRIMARY_K = 5;

/** The sovereign (Scaleway/EU) candidates from .cursor/rules/100-stack.mdc. */
const SOVEREIGN_CANDIDATES: Candidate[] = [
  {
    key: "qwen3-embedding-8b",
    model: "qwen3-embedding-8b",
    provider: "scaleway",
    sovereign: true,
  },
  {
    key: "bge-multilingual-gemma2",
    model: "bge-multilingual-gemma2",
    provider: "scaleway",
    sovereign: true,
  },
];

/**
 * OPTIONAL non-EU reference, gated behind an explicit opt-in. This exists purely to measure
 * the quality gap against a well-known US model. It is NEVER selected as the winner and NEVER
 * used in the product request path — that would be a sovereignty breach (000-core.mdc).
 */
function referenceCandidates(): Candidate[] {
  if (process.env.BAKEOFF_INCLUDE_US_REFERENCE !== "1") return [];
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "BAKEOFF_INCLUDE_US_REFERENCE=1 but OPENAI_API_KEY is not set — skipping US reference.",
    );
    return [];
  }
  return [
    {
      key: "text-embedding-3-large (US reference, measure-only)",
      model: "text-embedding-3-large",
      provider: "openai-reference",
      sovereign: false,
    },
  ];
}

const embeddingResponseSchema = z.object({
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })).min(1),
});

const BATCH_SIZE = 32;

async function embedBatch(candidate: Candidate, texts: string[]): Promise<number[][]> {
  if (candidate.provider === "scaleway") {
    const result = await embed({
      texts,
      model: candidate.model,
      dimensions: candidate.dimensions,
      version: DEFAULT_EMBEDDING_VERSION,
    });
    return result.embeddings;
  }
  // Non-EU reference path — measurement only, opt-in, never the product path.
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({ model: candidate.model, input: texts }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI reference request failed (${String(response.status)}).`);
  }
  const parsed = embeddingResponseSchema.parse(await response.json());
  return [...parsed.data].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
}

async function embedAll(candidate: Candidate, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await embedBatch(candidate, texts.slice(i, i + BATCH_SIZE))));
  }
  return vectors;
}

/** In-place L2-normalization so cosine similarity reduces to a dot product. */
function normalize(vectors: number[][]): number[][] {
  return vectors.map((vector) => {
    let sumSquares = 0;
    for (const value of vector) sumSquares += value * value;
    const magnitude = Math.sqrt(sumSquares);
    if (magnitude === 0) return vector;
    return vector.map((value) => value / magnitude);
  });
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

interface Metrics {
  /** hit/recall @ k, keyed by k. */
  recallAtK: Record<number, number>;
  mrr: number;
}

function evaluate(passageVectors: number[][], queryVectors: number[][]): Metrics {
  const recallHits: Record<number, number> = {};
  for (const k of K_VALUES) recallHits[k] = 0;
  let reciprocalRankSum = 0;

  queries.forEach((query, queryIndex) => {
    const queryVector = queryVectors[queryIndex] as number[];
    const ranked = passages
      .map((passage, passageIndex) => ({
        id: passage.id,
        score: dot(queryVector, passageVectors[passageIndex] as number[]),
      }))
      .sort((a, b) => b.score - a.score);

    const relevant = new Set(query.relevantPassageIds);
    const rank = ranked.findIndex((entry) => relevant.has(entry.id)) + 1; // 1-based; 0 => not found
    if (rank > 0) {
      reciprocalRankSum += 1 / rank;
      for (const k of K_VALUES) if (rank <= k) recallHits[k] = (recallHits[k] ?? 0) + 1;
    }
  });

  const recallAtK: Record<number, number> = {};
  for (const k of K_VALUES) recallAtK[k] = (recallHits[k] ?? 0) / queries.length;
  return { recallAtK, mrr: reciprocalRankSum / queries.length };
}

interface CandidateResult {
  candidate: Candidate;
  dim: number;
  metrics: Metrics;
}

async function scoreCandidate(candidate: Candidate): Promise<CandidateResult> {
  const passageVectors = normalize(await embedAll(candidate, passages.map((p) => p.content)));
  const queryVectors = normalize(await embedAll(candidate, queries.map((q) => q.question)));
  const dim = passageVectors[0]?.length ?? 0;
  return { candidate, dim, metrics: evaluate(passageVectors, queryVectors) };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function pickWinner(results: CandidateResult[]): CandidateResult | undefined {
  const eligible = results.filter((result) => result.candidate.sovereign);
  return [...eligible].sort((a, b) => {
    const primary =
      (b.metrics.recallAtK[PRIMARY_K] ?? 0) - (a.metrics.recallAtK[PRIMARY_K] ?? 0);
    if (primary !== 0) return primary;
    const byMrr = b.metrics.mrr - a.metrics.mrr;
    if (byMrr !== 0) return byMrr;
    return (b.metrics.recallAtK[1] ?? 0) - (a.metrics.recallAtK[1] ?? 0);
  })[0];
}

function renderResults(results: CandidateResult[], winner: CandidateResult | undefined): string {
  const header = ["Model", "dim", "provider", "sovereign", "hit@1", "recall@3", "recall@5", "MRR"];
  const rows = results.map((result) => [
    result.candidate.key,
    String(result.dim),
    result.candidate.provider,
    result.candidate.sovereign ? "yes (EU)" : "no (reference)",
    pct(result.metrics.recallAtK[1] ?? 0),
    pct(result.metrics.recallAtK[3] ?? 0),
    pct(result.metrics.recallAtK[5] ?? 0),
    result.metrics.mrr.toFixed(3),
  ]);
  const table = [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");

  const winnerBlock = winner
    ? [
        `**Winner (sovereign): \`${winner.candidate.model}\` @ ${String(winner.dim)} dim.**`,
        "",
        "Pinned in `packages/shared/src/config/embedding.ts`:",
        "",
        "```ts",
        "export const EMBEDDING_CONFIG = {",
        `  model: "${winner.candidate.model}",`,
        `  dim: ${String(winner.dim)},`,
        `  version: "${DEFAULT_EMBEDDING_VERSION}",`,
        "} as const;",
        "```",
      ].join("\n")
    : "No sovereign candidate produced a result — cannot pick a winner.";

  return `# Embedding bake-off — results

_Generated by \`scripts/bake-off/run.ts\` on ${new Date().toISOString()}._

## Method

Each candidate embeds ${String(passages.length)} labeled Dutch CAO passages and
${String(queries.length)} paraphrased end-user questions. Retrieval quality is scored with
cosine similarity (L2-normalized dot product):

- **hit@1 / recall@k** — is the correct passage in the top-k results?
- **MRR** — mean reciprocal rank of the correct passage.

The winner is chosen on **recall@${String(PRIMARY_K)}** (the top-k the agent actually receives as
context), tie-broken by MRR then hit@1. **Sovereignty is a hard constraint:** only EU
(Scaleway) candidates are eligible to win. Any non-EU model is a measurement-only reference,
never selected and never used in the request path (see \`.cursor/rules/000-core.mdc\`).

## Dataset caveat

The corpus in \`@wunderstack/shared\` (\`src/evals/cao-labeled-set.ts\`) is a representative,
authentic-style **seed** — not a specific fund's CAO. Before treating this result as final for a
fund, replace/extend the passages with that fund's real CAO text and re-run. The measured winner is
only as representative as the corpus it ran on.

## Results

${table}

## Decision

${winnerBlock}

## Dimension & index implication (for Fase 4)

Scaleway's Generative APIs return each embedding at the model's **maximum** dimension and do
not support trimming to a smaller size (no Matryoshka). Both sovereign candidates exceed
pgvector's 2000-dimension limit for \`hnsw\`/\`ivfflat\` indexes (\`bge-multilingual-gemma2\` = 3584,
\`qwen3-embedding-8b\` = native). Consequence for the \`chunks.embedding vector(<dim>)\` column in
Fase 4: use a **\`flat\`** index (exact search, no ANN index) or add a dimensionality-reduction
step. This supersedes the outdated "@ 2000 dim" note in \`.cursor/rules/100-stack.mdc\`.
`;
}

async function main(): Promise<void> {
  const candidates = [...SOVEREIGN_CANDIDATES, ...referenceCandidates()];
  console.log(
    `Running bake-off: ${String(candidates.length)} candidate(s), ` +
      `${String(passages.length)} passages, ${String(queries.length)} queries.\n`,
  );

  const results: CandidateResult[] = [];
  for (const candidate of candidates) {
    console.log(`Embedding with ${candidate.key} ...`);
    results.push(await scoreCandidate(candidate));
  }

  const winner = pickWinner(results);
  const markdown = renderResults(results, winner);
  await writeFile(new URL("./results.md", import.meta.url), markdown, "utf8");

  console.log(`\n${markdown}`);
  console.log("Wrote results.md.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
