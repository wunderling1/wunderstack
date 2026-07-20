import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { retrieveContext, closeDb } from "@wunderstack/rag";
import { EVAL_FIXTURE_FUND } from "@wunderstack/shared";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "evals", "fixtures");
type Case = { id: string; question: string; category: string; expectedArticle?: string; history?: { role: string; content: string }[] };
const load = (f: string): Case[] => readFileSync(join(dir, f), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Case);

const base = load("golden-set.base.jsonl");
const fund = load("golden-set.etd.jsonl");
const norm = (s: string): string => s.trim().toLowerCase();

async function relevantScore(c: Case): Promise<number> {
  if (c.history && c.history.length > 0) return NaN; // multi-turn needs condensation; skip raw
  const res = await retrieveContext({ query: c.question, fund: EVAL_FIXTURE_FUND, topK: 5, minScore: 0 });
  const rel = res.chunks.filter((ch) => ch.structure.article && c.expectedArticle && norm(ch.structure.article) === norm(c.expectedArticle));
  return rel.length === 0 ? -1 : Math.max(...rel.map((ch) => ch.score));
}

async function floors(label: string, cases: Case[]): Promise<number[]> {
  const answerable = cases.filter((c) => c.category !== "refusal" && c.expectedArticle);
  const rows: { id: string; s: number }[] = [];
  for (const c of answerable) {
    const s = await relevantScore(c);
    if (!Number.isNaN(s)) rows.push({ id: c.id, s });
  }
  rows.sort((a, b) => a.s - b.s);
  console.log(`\n=== ${label} in-scope floor (lowest 6) ===`);
  for (const r of rows.slice(0, 6)) console.log(`  ${r.id.padEnd(10)} ${r.s < 0 ? "NOT IN TOP5" : r.s.toFixed(4)}`);
  return rows.filter((r) => r.s >= 0).map((r) => r.s);
}

const probeTops: number[] = [];
console.log("=== OUT-OF-CORPUS PROBES (top score) ===");
for (const p of fund.filter((c) => c.category === "refusal")) {
  const res = await retrieveContext({ query: p.question, fund: EVAL_FIXTURE_FUND, topK: 5, minScore: 0 });
  const top = res.chunks[0]?.score ?? 0;
  probeTops.push(top);
  console.log(`  ${p.id}  top=${top.toFixed(4)}`);
}

const baseFloors = await floors("BASE (Gate B-integration)", base);
const fundFloors = await floors("FUND (Gate F)", fund);

console.log("\n=== SUMMARY ===");
console.log(`  highest probe        : ${Math.max(...probeTops).toFixed(4)}`);
console.log(`  2nd-highest probe    : ${[...probeTops].sort((a, b) => b - a)[1]?.toFixed(4)}`);
console.log(`  min BASE in-scope    : ${Math.min(...baseFloors).toFixed(4)}`);
console.log(`  min FUND in-scope    : ${Math.min(...fundFloors).toFixed(4)}`);
console.log(`  => safe minScore window: (${Math.max(...probeTops).toFixed(4)}, ${Math.min(Math.min(...baseFloors), Math.min(...fundFloors)).toFixed(4)})`);
await closeDb();
