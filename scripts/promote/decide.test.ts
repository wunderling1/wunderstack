import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FundGateRecord } from "@wunderstack/agents/evals/fund-ledger";

import { parseLastIngest, parseReportTimestamp } from "./check";
import { decide, sameCommit, type PromoteRequest, type StructureReportRef } from "./decide";

const COMMIT = "28b1911c0ffee1234567890abcdefabcdef01234";

function record(overrides: Partial<FundGateRecord> = {}): FundGateRecord {
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
    generatedAt: "2026-07-30T20:32:11.776Z",
    runArtefact: "packages/agents/eval-report.json",
    ...overrides,
  };
}

const report: StructureReportRef = {
  path: "docs/eval/ingest/INGEST-elektronische-detailhandel-2026-07-30-na-parsefix.md",
  generatedAt: "2026-07-30T19:14:23.297Z",
  lastIngestAt: "2026-07-30T19:14:20Z",
};

function request(overrides: Partial<PromoteRequest> = {}): PromoteRequest {
  return {
    fund: "etd-full",
    tag: "v0.3.0",
    requestedCommit: COMMIT,
    records: [record()],
    structureReports: [report],
    ...overrides,
  };
}

describe("decide", () => {
  it("gives GO when the gate passed, the commit matches and the corpus predates the run", () => {
    const verdict = decide(request());
    assert.equal(verdict.go, true);
    assert.deepEqual(verdict.reasons, []);
    assert.equal(verdict.record?.setKey, "etd-full");
    assert.equal(verdict.structureReport?.generatedAt, report.generatedAt);
  });

  it("blocks when the ledger has nothing for the fund", () => {
    const verdict = decide(request({ fund: "onbekend-fonds" }));
    assert.equal(verdict.go, false);
    assert.equal(verdict.record, undefined);
    assert.match(verdict.reasons[0] ?? "", /Geen G3-fund-resultaat/);
  });

  it("blocks on a failed gate and names the failed checks", () => {
    const verdict = decide(
      request({
        records: [record({ status: "failed", failedChecks: ['fund "demo" refusal-guard: >= 1 probes'] })],
      }),
    );
    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /"failed"/);
    assert.match(verdict.reasons.join(" "), /refusal-guard/);
  });

  it("blocks a skipped gate — a gate that could not run is not a green", () => {
    const verdict = decide(request({ records: [record({ status: "skipped" })] }));
    assert.equal(verdict.go, false);
  });

  it("blocks when the result cannot say which commit it is green about", () => {
    const verdict = decide(request({ records: [record({ commitSha: null })] }));
    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /geen commit/);
  });

  it("blocks when the green belongs to another commit", () => {
    const verdict = decide(request({ requestedCommit: "9999999999999999999999999999999999999999" }));
    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /hoort bij commit/);
  });

  it("accepts an unresolvable tag without inventing a commit match", () => {
    // git could not resolve the tag; the other conditions still decide, and the commit is not compared.
    const verdict = decide(request({ requestedCommit: null }));
    assert.equal(verdict.go, true);
  });

  it("blocks when no structure report exists for the fund", () => {
    const verdict = decide(request({ structureReports: [] }));
    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /structuurrapport/);
  });

  it("blocks when the corpus was re-ingested after the gate run", () => {
    const verdict = decide(
      request({
        structureReports: [
          { ...report, generatedAt: "2026-07-31T08:00:05.000Z", lastIngestAt: "2026-07-31T08:00:00Z" },
        ],
      }),
    );
    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /geïngest ná de gate-run/);
  });

  it("allows a read-only report written after the run, as long as the corpus did not move", () => {
    // Measuring an unchanged corpus again is legitimate; only a later *ingest* invalidates the green.
    const verdict = decide(
      request({ structureReports: [{ ...report, generatedAt: "2026-07-31T09:00:00.000Z" }] }),
    );
    assert.equal(verdict.go, true);
  });

  it("blocks a report that lists no stored documents", () => {
    const verdict = decide(request({ structureReports: [{ ...report, lastIngestAt: null }] }));
    assert.equal(verdict.go, false);
    assert.match(verdict.reasons.join(" "), /geen opgeslagen documenten/);
  });

  it("judges the newest run, not the first one it finds", () => {
    const verdict = decide(
      request({
        records: [
          record({ status: "passed", generatedAt: "2026-07-29T10:00:00.000Z" }),
          record({ status: "failed", failedChecks: ["guard"], generatedAt: "2026-07-30T20:32:11.776Z" }),
        ],
      }),
    );
    assert.equal(verdict.go, false);
    assert.equal(verdict.record?.generatedAt, "2026-07-30T20:32:11.776Z");
  });

  it("accepts the database fund name as well as the golden-set key", () => {
    const verdict = decide(request({ fund: "elektronische-detailhandel" }));
    assert.equal(verdict.go, true);
  });

  it("collects every blocking reason, not just the first", () => {
    const verdict = decide(request({ records: [record({ status: "failed", commitSha: null })], structureReports: [] }));
    assert.equal(verdict.reasons.length, 3);
  });
});

describe("sameCommit", () => {
  it("tolerates abbreviation on either side", () => {
    assert.equal(sameCommit(COMMIT, COMMIT.slice(0, 7)), true);
    assert.equal(sameCommit(COMMIT.slice(0, 12), COMMIT), true);
  });

  it("refuses a prefix too short to identify anything", () => {
    assert.equal(sameCommit(COMMIT, "28b19"), false);
  });

  it("rejects a different commit", () => {
    assert.equal(sameCommit(COMMIT, "9999999999"), false);
  });
});

describe("parseReportTimestamp", () => {
  it("reads the ISO timestamp out of a real report header", () => {
    const markdown = [
      "# Ingest-structuurrapport — `elektronische-detailhandel` (na-parsefix)",
      "",
      "> **Gegenereerd:** 2026-07-30T19:14:23.297Z · **Bron:** read-only meting op de opgeslagen chunks",
      "> **Status:** visibility, **geen gate**",
    ].join("\n");
    assert.equal(parseReportTimestamp(markdown), "2026-07-30T19:14:23.297Z");
  });

  it("returns null when the header is missing", () => {
    assert.equal(parseReportTimestamp("# Zomaar een document\n\nGeen kop.\n"), null);
  });
});

describe("parseLastIngest", () => {
  const table = [
    "| Bron | Versie | Laatste ingest | Chunks |",
    "|---|---|---|---|",
    "| `etd/cao.pdf` | cao-etd-2023 | 2026-07-30 19:14:20 | 245 |",
    "| `etd/bijlage.pdf` | cao-etd-2023 | 2026-07-28 08:00:00 | 12 |",
  ].join("\n");

  it("takes the most recent ingest and reads it as UTC", () => {
    // The report writes UTC without a zone marker; parsing it as local time would shift the instant
    // by the machine's offset and could hide a re-ingest that happened after the gate run.
    assert.equal(parseLastIngest(table), "2026-07-30T19:14:20Z");
  });

  it("returns null when the report lists no documents", () => {
    assert.equal(parseLastIngest("| Bron | Versie | Laatste ingest | Chunks |\n|---|---|---|---|\n"), null);
  });
});
