/**
 * End-to-end cover for the reading half of the check: real files on disk, through the real parsers,
 * into the real decision. The GO path in particular needs this — the live ledger cannot demonstrate a
 * GO until a run carries a commit, and evidence must not be faked into the committed ledger to prove
 * that the happy path works.
 */

import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import type { FundGateRecord } from "@wunderstack/agents/evals/fund-ledger";

import { findStructureReports, loadLedger } from "./check.js";
import { decide } from "./decide.js";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const RUN_AT = "2026-07-30T20:32:11.776Z";

const created: string[] = [];

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "promote-check-"));
  created.push(dir);
  return dir;
}

function passedRecord(overrides: Partial<FundGateRecord> = {}): FundGateRecord {
  return {
    schemaVersion: 1,
    kind: "g3-fund",
    setKey: "etd-full",
    fund: "elektronische-detailhandel",
    agentKey: "cao",
    corpusVersion: "etd-full-1",
    status: "passed",
    failedChecks: [],
    commitSha: COMMIT,
    generatedAt: RUN_AT,
    runArtefact: "packages/agents/eval-report.json",
    ...overrides,
  };
}

/** A structure report in the shape `scripts/ingest/report.ts` writes. */
function structureReport(generatedAt: string, lastIngest: string): string {
  return [
    "# Ingest-structuurrapport — `elektronische-detailhandel`",
    "",
    `> **Gegenereerd:** ${generatedAt} · **Bron:** read-only meting op de opgeslagen chunks`,
    "",
    "## Documenten in dit fonds",
    "",
    "| Bron | Versie | Laatste ingest | Chunks |",
    "|---|---|---|---|",
    `| \`etd/cao.pdf\` | cao-etd-2023 | ${lastIngest} | 245 |`,
    "",
  ].join("\n");
}

after(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("check, end to end over real files", () => {
  it("gives GO when a green run, its commit and an older ingest all line up", async () => {
    const dir = await workspace();
    const ledgerPath = join(dir, "g3-fund.jsonl");
    await writeFile(ledgerPath, `${JSON.stringify(passedRecord())}\n`, "utf8");
    await writeFile(
      join(dir, "INGEST-elektronische-detailhandel-2026-07-30-na-parsefix.md"),
      structureReport("2026-07-30T19:14:23.297Z", "2026-07-30 19:14:20"),
      "utf8",
    );

    const { records, rejected } = await loadLedger(ledgerPath);
    assert.deepEqual(rejected, []);
    const verdict = decide({
      fund: "etd-full",
      tag: "v0.3.0",
      requestedCommit: COMMIT,
      records,
      structureReports: await findStructureReports("elektronische-detailhandel", dir),
    });

    assert.deepEqual(verdict.reasons, []);
    assert.equal(verdict.go, true);
  });

  it("blocks when the corpus was re-ingested after the green run", async () => {
    const dir = await workspace();
    const ledgerPath = join(dir, "g3-fund.jsonl");
    await writeFile(ledgerPath, `${JSON.stringify(passedRecord())}\n`, "utf8");
    await writeFile(
      join(dir, "INGEST-elektronische-detailhandel-2026-07-31.md"),
      structureReport("2026-07-31T09:00:00.000Z", "2026-07-31 08:59:00"),
      "utf8",
    );

    const { records } = await loadLedger(ledgerPath);
    const verdict = decide({
      fund: "etd-full",
      tag: "v0.3.0",
      requestedCommit: COMMIT,
      records,
      structureReports: await findStructureReports("elektronische-detailhandel", dir),
    });

    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /geïngest ná de gate-run/);
  });

  it("reads a pre-arbo ledger line (no agentKey) as cao, not as a reject", async () => {
    const dir = await workspace();
    const ledgerPath = join(dir, "g3-fund.jsonl");
    const legacy: Record<string, unknown> = { ...passedRecord() };
    delete legacy.agentKey;
    await writeFile(ledgerPath, `${JSON.stringify(legacy)}\n`, "utf8");

    const { records, rejected } = await loadLedger(ledgerPath);
    assert.deepEqual(rejected, []);
    assert.equal(records[0]?.agentKey, "cao");
  });

  it("refuses a malformed or future-version ledger line instead of reading it as evidence", async () => {
    const dir = await workspace();
    const ledgerPath = join(dir, "g3-fund.jsonl");
    await writeFile(
      ledgerPath,
      [
        "{ dit is geen json",
        JSON.stringify({ ...passedRecord(), schemaVersion: 99 }),
        JSON.stringify({ kind: "g3-fund", setKey: "x" }),
        JSON.stringify(passedRecord()),
        "",
      ].join("\n"),
      "utf8",
    );

    const { records, rejected } = await loadLedger(ledgerPath);
    assert.equal(records.length, 1);
    assert.equal(rejected.length, 3);
    assert.match(rejected.join(" "), /geen geldige JSON/);
    assert.match(rejected.join(" "), /schemaVersion 99/);
  });

  it("does not pick up reports of a fund whose name starts the same", async () => {
    const dir = await workspace();
    await writeFile(
      join(dir, "INGEST-demo-corpus-2026-07-30.md"),
      structureReport("2026-07-30T19:00:00.000Z", "2026-07-30 18:00:00"),
      "utf8",
    );
    assert.deepEqual(await findStructureReports("demo", dir), []);
  });

  it("reads an empty ledger as no evidence, not as approval", async () => {
    const dir = await workspace();
    const { records, rejected } = await loadLedger(join(dir, "afwezig.jsonl"));
    assert.deepEqual(records, []);
    assert.deepEqual(rejected, []);
    const verdict = decide({
      fund: "etd-full",
      tag: "v0.3.0",
      requestedCommit: COMMIT,
      records,
      structureReports: [],
    });
    assert.equal(verdict.go, false);
  });
});
