/**
 * Compare exact (flat) retrieval on public vs a provisioned fund schema.
 * Same query vector, same candidateK, minScore=0. No rewrite, no rerank, no sibling expansion.
 *
 *   pnpm --filter @wunderstack/db-scripts compare-retrieval -- --fund elektronische-detailhandel
 *
 * Writes docs/architecture/NOTE-retrieval-copy-<fund>.md
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { goldenFundSets } from "@wunderstack/agents/evals/golden-set";
import {
  assertFundKey,
  closeDb,
  fundSchemaName,
  funds,
  eq,
  getDb,
} from "@wunderstack/db";
import { embedQuery, retrieveFromVector, type RetrievedChunk } from "@wunderstack/rag";
import { requireRerankConfig } from "@wunderstack/shared";

const DEFAULT_FUND = "elektronische-detailhandel";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface QuestionResult {
  id: string;
  agentKey: string;
  question: string;
  publicIds: string[];
  schemaIds: string[];
  setEqual: boolean;
  orderEqual: boolean;
  maxAbsScoreDelta: number;
}

function idsOf(hits: RetrievedChunk[]): string[] {
  return hits.map((hit) => hit.chunkId);
}

function assertReportedSchema(hits: RetrievedChunk[], expected: string, label: string): void {
  const wrong = hits.filter((hit) => hit.source.schemaName !== expected);
  if (wrong.length > 0) {
    throw new Error(
      `${label}: ${String(wrong.length)} hit(s) reported schemaName !== ${expected} (copy-identity evidence)`,
    );
  }
}

function maxAbsScoreDelta(publicHits: RetrievedChunk[], schemaHits: RetrievedChunk[]): number {
  const schemaById = new Map(schemaHits.map((hit) => [hit.chunkId, hit.score]));
  let max = 0;
  for (const hit of publicHits) {
    const other = schemaById.get(hit.chunkId);
    if (other === undefined) {
      continue;
    }
    max = Math.max(max, Math.abs(hit.score - other));
  }
  return max;
}

function renderReport(args: {
  fundKey: string;
  schemaName: string;
  candidateK: number;
  minScore: number;
  goldenKeys: string[];
  results: QuestionResult[];
}): string {
  const mismatches = args.results.filter((row) => !row.setEqual || !row.orderEqual);
  const identity = mismatches.length === 0;
  const lines: string[] = [
    `# NOTE — Retrieval-kopie \`${args.fundKey}\``,
    "",
    `Datum: 21 augustus 2026`,
    `Schema: \`${args.schemaName}\` (kopie; \`public\` ongemoeid)`,
    `Tak: B — exact (flat) search, geen HNSW/ivfflat, geen sibling-expansie, geen rerank.`,
    "",
    "## Methode",
    "",
    `- Zelfde query-vector per vraag (één embed, twee searches).`,
    `- \`retrieveFromVector\` met \`minScore=${String(args.minScore)}\`, \`candidateK=${String(args.candidateK)}\` (pgvector LIMIT, niet post-rerank topK).`,
    `- Geen \`retrieveContext\` (dat herschrijft, rerankt en sibling-expandeert).`,
    `- Index ongewijzigd: btree op \`(fund, agent_key)\` / document_id; embeddings 4096-dim exact cosine.`,
    `- Golden sets: ${args.goldenKeys.map((key) => `\`${key}\``).join(", ")}.`,
    "",
    "## Uitkomst",
    "",
    identity
      ? `**Identiteit bevestigd.** ${String(args.results.length)} vragen: chunk-id-set en volgorde gelijk tussen \`public\` en \`${args.schemaName}\`.`
      : `**Verschil.** ${String(mismatches.length)} / ${String(args.results.length)} vragen wijken af. Details hieronder.`,
    "",
    "| case | agent | set equal | order equal | max \\|Δscore\\| | public k | schema k |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const row of args.results) {
    lines.push(
      `| \`${row.id}\` | \`${row.agentKey}\` | ${row.setEqual ? "yes" : "NO"} | ${row.orderEqual ? "yes" : "NO"} | ${row.maxAbsScoreDelta.toFixed(6)} | ${String(row.publicIds.length)} | ${String(row.schemaIds.length)} |`,
    );
  }

  if (mismatches.length > 0) {
    lines.push("", "## Mismatches", "");
    for (const row of mismatches) {
      lines.push(`### ${row.id}`);
      lines.push("");
      lines.push(`Question: ${row.question}`);
      lines.push("");
      lines.push(`- public: ${row.publicIds.join(", ") || "(empty)"}`);
      lines.push(`- schema: ${row.schemaIds.join(", ") || "(empty)"}`);
      lines.push("");
    }
  }

    lines.push("", "## Wat dit niet is", "");
  lines.push(
    "- Geen fail-closed SET ROLE-test (tak B; CREATE ROLE bestaat niet op de addon).",
    "- Geen claim dat `search_path` een security boundary is.",
    "- Geen sibling-expansie in deze meting (ADR: niet in dezelfde PR als de kopieermeting).",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { fund: { type: "string", default: DEFAULT_FUND } },
    strict: true,
    allowPositionals: true,
  });
  const fundKey = assertFundKey(values.fund ?? DEFAULT_FUND);
  const schemaName = fundSchemaName(fundKey);
  const config = requireRerankConfig();
  const candidateK = config.candidateK;
  const minScore = 0;

  const [fund] = await getDb().select().from(funds).where(eq(funds.key, fundKey)).limit(1);
  if (!fund) {
    throw new Error(`Fund ${fundKey} is not in control.funds.`);
  }

  const sets = goldenFundSets.filter((set) => set.fund === fundKey);
  if (sets.length === 0) {
    throw new Error(
      `No golden fund set for fund ${fundKey}. Provision a fund that already has a golden set (etd-full / arbo.oomt).`,
    );
  }

  const results: QuestionResult[] = [];
  for (const set of sets) {
    for (const fundCase of set.cases) {
      const queryVector = await embedQuery(fundCase.question);
      const scoped = { fund: fundKey, agentKey: set.agentKey, minScore, candidateK };
      const publicHits = (await retrieveFromVector(queryVector, { ...scoped, searchPath: "public" })).chunks;
      const schemaHits = (await retrieveFromVector(queryVector, { ...scoped, searchPath: schemaName })).chunks;
      assertReportedSchema(publicHits, "public", fundCase.id);
      assertReportedSchema(schemaHits, schemaName, fundCase.id);
      const publicIds = idsOf(publicHits);
      const schemaIds = idsOf(schemaHits);
      const publicSet = new Set(publicIds);
      const schemaSet = new Set(schemaIds);
      const setEqual =
        publicSet.size === schemaSet.size && [...publicSet].every((id) => schemaSet.has(id));
      const orderEqual = publicIds.length === schemaIds.length && publicIds.every((id, i) => id === schemaIds[i]);
      results.push({
        id: fundCase.id,
        agentKey: set.agentKey,
        question: fundCase.question,
        publicIds,
        schemaIds,
        setEqual,
        orderEqual,
        maxAbsScoreDelta: maxAbsScoreDelta(publicHits, schemaHits),
      });
      const mark = setEqual && orderEqual ? "ok" : "DIFF";
      console.log(`[${mark}] ${fundCase.id} public=${String(publicIds.length)} schema=${String(schemaIds.length)}`);
    }
  }

  const markdown = renderReport({
    fundKey,
    schemaName,
    candidateK,
    minScore,
    goldenKeys: sets.map((set) => set.key),
    results,
  });
  const outPath = join(repoRoot, "docs", "architecture", `NOTE-retrieval-copy-${fundKey}.md`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  console.log(`Wrote ${outPath}`);

  const failed = results.some((row) => !row.setEqual || !row.orderEqual);
  if (failed) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
