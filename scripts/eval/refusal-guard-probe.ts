/**
 * Refusal-guard probe (MEASURE, do not fix).
 *
 * Open question: the fund-layer refusal-guard (`fundLayerChecks` in cao.eval.ts) uses the golden
 * `refusal` cases as out-of-corpus minScore probes and requires them to return ZERO hits. It is green
 * on `eval-fixtures` and red on both funds with a really ingested corpus. Is that a threshold that
 * needs calibrating, or a guard asking for something its own probes cannot deliver?
 *
 * The base-layer guard already answers that on paper (cao.eval.ts:158-165): the golden refusal cases
 * "by design (E3) carry in-corpus near-miss distractors, which DO clear the floor", which is why that
 * layer uses three dedicated nonsense queries instead. This script measures it on the real corpora.
 *
 * Read-only and cheap: the guard's outcome is decided entirely by the similarity floor inside
 * `retrieve` (retrieve.ts:175 filters on score >= minScore, before rerank), and rerank can only trim
 * that list, never extend it. So `retrieve` at minScore 0 shows the full picture without a single
 * rerank round-trip — one query embedding + one pgvector read per probe.
 *
 * Per fund it reports three groups: the golden refusal cases (near-miss), the three dedicated
 * out-of-corpus queries mirrored from the base layer, and the answerable cases (to establish the
 * in-corpus score band). The question the report answers: does one threshold separate near-miss from
 * real hits, and do dedicated nonsense probes return zero on a rich corpus?
 *
 * Output: scripts/eval/refusal-guard-report.md (regenerated on each run).
 *
 * Usage: pnpm --filter @wunderstack/eval-scripts refusal-guard-probe [--pair <set>:<fund> ...]
 * Needs DATABASE_URL + SCALEWAY_API_KEY (read from repo-root .env automatically).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { closeDb, retrieve, rewriteQuery, type RetrievedChunk } from "@wunderstack/rag";
import { requireRerankConfig } from "@wunderstack/shared";
import { z } from "zod";

/** Production request default from caoQuestionSchema (packages/agents/src/types.ts). */
const PRODUCTION_MIN_SCORE = 0.48;

/**
 * Mirrors MIN_SCORE_PROBES (cao.eval.ts:166) verbatim. Duplicated on purpose: this script must show
 * what the base layer's probes do on a fund corpus, and importing the eval module would drag the
 * agents package (and its keys) into a read-only diagnostic.
 */
const OUT_OF_CORPUS_PROBES = [
  "Hoeveel zonuren waren er gemiddeld in Valencia afgelopen zomer?",
  "Wat is het recept voor een klassieke tarte tatin met karamel?",
  "Welke schroefdraadmaat hoort bij een M8-bout in de ruimtevaart?",
] as const;

/** Mirrors FUND_SET_META (packages/agents/src/evals/golden-set.ts); override with --pair. */
const DEFAULT_PAIRS = ["demo:demo", "etd-full:elektronische-detailhandel", "etd:eval-fixtures"] as const;

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "packages", "agents", "src", "evals", "fixtures");
const reportPath = join(here, "refusal-guard-report.md");

// Minimal shape — this diagnostic only needs the question, its category and whether it is multi-turn.
// The golden set stays the single source of truth; read it directly, like rerank-ablation.ts does.
const caseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  category: z.string().optional(),
  history: z.array(z.unknown()).optional(),
});
type GoldenCase = z.infer<typeof caseSchema>;

function readCases(setKey: string): GoldenCase[] {
  const raw = readFileSync(join(fixturesDir, `golden-set.${setKey}.jsonl`), "utf8").trim();
  if (raw.length === 0) return [];
  return raw.split("\n").map((line) => caseSchema.parse(JSON.parse(line)));
}

type ProbeKind = "near-miss" | "out-of-corpus" | "answerable";

interface ProbeResult {
  kind: ProbeKind;
  id: string;
  question: string;
  /** Hits at the production floor — this is exactly what the guard counts. */
  hitsAtFloor: number;
  topScore: number;
  topAnchor: string;
  topSnippet: string;
}

function anchorOf(chunk: RetrievedChunk | undefined): string {
  if (!chunk) return "—";
  return chunk.structure.sourceRef ?? chunk.structure.article ?? `#${String(chunk.ordinal)}`;
}

function snippetOf(chunk: RetrievedChunk | undefined): string {
  if (!chunk) return "—";
  return `${chunk.content.replace(/\s+/g, " ").slice(0, 70).trim()}…`;
}

async function probe(kind: ProbeKind, id: string, question: string, fund: string): Promise<ProbeResult> {
  const config = requireRerankConfig();
  const { rewritten } = rewriteQuery(question);
  // minScore 0 returns the whole candidate pool with scores, so one read shows both what the guard
  // sees today (hits >= the floor) and what any other floor would see.
  const pool = await retrieve({ query: rewritten, fund, agentKey: "cao", candidateK: config.candidateK, minScore: 0 });
  return {
    kind,
    id,
    question,
    hitsAtFloor: pool.filter((chunk) => chunk.score >= PRODUCTION_MIN_SCORE).length,
    topScore: pool[0]?.score ?? 0,
    topAnchor: anchorOf(pool[0]),
    topSnippet: snippetOf(pool[0]),
  };
}

interface FundOutcome {
  setKey: string;
  fund: string;
  results: ProbeResult[];
}

function byKind(outcome: FundOutcome, kind: ProbeKind): ProbeResult[] {
  return outcome.results.filter((result) => result.kind === kind);
}

function verdictFor(outcome: FundOutcome): string {
  const nearMiss = byKind(outcome, "near-miss");
  const outOfCorpus = byKind(outcome, "out-of-corpus");
  const answerable = byKind(outcome, "answerable");

  // The guard as implemented: one slot of slack, but at least one probe must be empty.
  const requiredEmpty = nearMiss.length === 0 ? 0 : Math.max(1, nearMiss.length - 1);
  const emptyNearMiss = nearMiss.filter((result) => result.hitsAtFloor === 0).length;
  const emptyOutOfCorpus = outOfCorpus.filter((result) => result.hitsAtFloor === 0).length;

  const maxNearMiss = Math.max(0, ...nearMiss.map((result) => result.topScore));
  const minAnswerable = answerable.length === 0 ? 0 : Math.min(...answerable.map((result) => result.topScore));
  const separable = answerable.length > 0 && nearMiss.length > 0 && maxNearMiss < minAnswerable;

  const lines = [
    `- Guard as implemented: **${emptyNearMiss}/${String(nearMiss.length)} near-miss probes empty** ` +
      `(needs ${String(requiredEmpty)}) → ${emptyNearMiss >= requiredEmpty ? "PASS" : "**FAIL**"}.`,
    `- Dedicated out-of-corpus probes: **${String(emptyOutOfCorpus)}/${String(outOfCorpus.length)} empty** ` +
      `→ ${emptyOutOfCorpus >= Math.max(1, outOfCorpus.length - 1) ? "would PASS" : "**would FAIL**"}.`,
    `- Highest near-miss score ${maxNearMiss.toFixed(3)} vs. lowest answerable top-1 score ` +
      `${minAnswerable.toFixed(3)} → ${separable ? "**separable** by a floor in between" : "**not separable**: no floor keeps the near-miss out while letting the real hits through"}.`,
  ];
  return lines.join("\n");
}

function maxScore(results: readonly ProbeResult[]): number {
  return results.length === 0 ? 0 : Math.max(...results.map((result) => result.topScore));
}

function minScoreOf(results: readonly ProbeResult[]): number {
  return results.length === 0 ? 0 : Math.min(...results.map((result) => result.topScore));
}

function buildReport(outcomes: FundOutcome[]): string {
  const config = requireRerankConfig();
  const lines: string[] = [
    "# Refusal-guard probe — measured, not fixed",
    "",
    `> Generated by \`scripts/eval/refusal-guard-probe.ts\` on ${new Date().toISOString()}.`,
    `> Read-only. Production floor \`minScore = ${String(PRODUCTION_MIN_SCORE)}\`, ` +
      `candidateK = ${String(config.candidateK)}. Scores are pgvector cosine similarity **before** rerank —`,
    "> which is where the guard is decided, since rerank can only trim the list.",
    "",
    "`hits` = chunks at or above the production floor: the number the guard compares against zero.",
    "`best` = best similarity in the whole candidate pool, which may sit below the floor.",
    "",
    "## Summary",
    "",
    "| Fund set | near-miss max | answerable min | out-of-corpus max | Guard today | Dedicated probes | One floor separates? |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const outcome of outcomes) {
    const nearMiss = byKind(outcome, "near-miss");
    const answerable = byKind(outcome, "answerable");
    const outOfCorpus = byKind(outcome, "out-of-corpus");
    const emptyNearMiss = nearMiss.filter((result) => result.hitsAtFloor === 0).length;
    const requiredEmpty = nearMiss.length === 0 ? 0 : Math.max(1, nearMiss.length - 1);
    const emptyOutOfCorpus = outOfCorpus.filter((result) => result.hitsAtFloor === 0).length;
    const separable = answerable.length > 0 && nearMiss.length > 0 && maxScore(nearMiss) < minScoreOf(answerable);
    lines.push(
      `| \`${outcome.setKey}\` | ${maxScore(nearMiss).toFixed(3)} | ${minScoreOf(answerable).toFixed(3)} | ` +
        `${maxScore(outOfCorpus).toFixed(3)} | ` +
        `${emptyNearMiss >= requiredEmpty ? "pass" : "**FAIL**"} (${String(emptyNearMiss)}/${String(nearMiss.length)} empty) | ` +
        `${emptyOutOfCorpus}/${String(outOfCorpus.length)} empty | ${separable ? "yes" : "**no**"} |`,
    );
  }
  lines.push("");

  for (const outcome of outcomes) {
    lines.push(`## Fund set \`${outcome.setKey}\` → fund \`${outcome.fund}\``);
    lines.push("");
    lines.push(verdictFor(outcome));
    lines.push("");
    lines.push("| Group | Case | hits | best | Best candidate (may be below the floor) | Question |");
    lines.push("|---|---|---|---|---|---|");
    for (const result of outcome.results) {
      lines.push(
        `| ${result.kind} | ${result.id} | ${result.hitsAtFloor === 0 ? "**0**" : String(result.hitsAtFloor)} | ` +
          `${result.topScore.toFixed(3)} | ${result.topAnchor} — ${result.topSnippet} | ${result.question} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function parsePair(pair: string): { setKey: string; fund: string } {
  const [setKey, fund] = pair.split(":");
  if (setKey === undefined || fund === undefined || setKey === "" || fund === "") {
    throw new Error(`--pair expects "<set>:<fund>", got "${pair}"`);
  }
  return { setKey, fund };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { pair: { type: "string", multiple: true } } });
  const pairs = (values.pair ?? [...DEFAULT_PAIRS]).map(parsePair);

  const outcomes: FundOutcome[] = [];
  for (const { setKey, fund } of pairs) {
    const cases = readCases(setKey);
    const nearMiss = cases.filter((testCase) => testCase.category === "refusal");
    // Single-turn only: a multi-turn case needs LLM condensation before retrieval, and this
    // diagnostic deliberately makes no model calls.
    const answerable = cases.filter(
      (testCase) => testCase.category !== "refusal" && (testCase.history?.length ?? 0) === 0,
    );
    console.log(
      `\nFund set "${setKey}" → fund "${fund}": ${String(nearMiss.length)} near-miss, ` +
        `${String(OUT_OF_CORPUS_PROBES.length)} out-of-corpus, ${String(answerable.length)} answerable probe(s).`,
    );

    const results: ProbeResult[] = [];
    for (const testCase of nearMiss) {
      results.push(await probe("near-miss", testCase.id, testCase.question, fund));
    }
    for (const [index, question] of OUT_OF_CORPUS_PROBES.entries()) {
      results.push(await probe("out-of-corpus", `oob-${String(index + 1)}`, question, fund));
    }
    for (const testCase of answerable) {
      results.push(await probe("answerable", testCase.id, testCase.question, fund));
    }

    for (const result of results) {
      console.log(
        `  ${result.kind.padEnd(13)} ${result.id.padEnd(10)} hits=${String(result.hitsAtFloor)} ` +
          `top=${result.topScore.toFixed(3)}`,
      );
    }
    outcomes.push({ setKey, fund, results });
  }

  writeFileSync(reportPath, buildReport(outcomes), "utf8");
  console.log(`\nWrote ${reportPath}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
