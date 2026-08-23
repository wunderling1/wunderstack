import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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

/**
 * Case categories:
 * - `in_scope`  — answerable from prose; scored on faithfulness + citation correctness.
 * - `refusal`   — must refuse against near-miss distractor context (`distractorPassageIds`).
 * - `table`     — answerable via a table lookup (salary/scale rows).
 * - `derived`   — a calculation-bait question (pro-rata / deeltijd, e.g. vakantie-uren naar rato).
 *                 The safe answer states the grounded inputs and the "naar rato"-rule; it must NOT
 *                 assert a self-computed total. Any invented result is caught by the hard-hallucination
 *                 scorer (a derived number is not in the corpus), which is the eval mirror of the E13
 *                 production runtime guard.
 */
export const goldenCaseCategorySchema = z.enum(["in_scope", "refusal", "table", "derived"]);
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
 * TWO-LAYER GOLDEN SET (E12). The set is split into two physical layers, loaded here:
 *
 *   BASE layer — golden-set.base.jsonl (+ golden-passages.jsonl). Corpus-agnostic behavioral cases
 *     that run on the committed FIXTURES, no DB required: prompt/clarify contract (Gate A), in-memory
 *     retrieval recall + rerank (Gate B), multi-turn condensation (Gate B2) and answer quality on
 *     golden context (Gate C). This layer runs on every PR and its results must be reproducible from
 *     the repo alone. `goldenCases`/`goldenPassages` below are the base layer (unchanged from pre-E12,
 *     just renamed) so the base gates behave exactly as before.
 *
 *   FUND layer — golden-set.<fund>.jsonl. Fund-specific CORRECTNESS cases that run against the REAL
 *     ingested corpus of that fund via the E11 integration path (retrieveContext: rewrite → pgvector
 *     → rerank → assemble), matched on article/lid — NOT against fixtures. That is the whole point of
 *     the fund layer: it proves the pipeline surfaces the right CAO article on the actual corpus. It
 *     needs a DB, so it is nightly-only (skips on PRs, required on the nightly). Each fund set carries
 *     its OWN corpusVersion (FUND_SET_META) and is reported separately (base-scores vs fund-scores) in
 *     eval-report.json — closing the audit's "two-layer split exists only as a console label".
 *
 * Curation policy (E10, unchanged): the fixture files are the single source of truth and are curated
 * BY HAND. The base set grows through the co-creation process (docs/golden-set-cocreation.md), still
 * committed by hand; any base fixture edit must bump GOLDEN_CORPUS_VERSION (the fixture-hash guard in
 * Gate A fails a change that skips the bump).
 */

/**
 * BASE corpus snapshot the base layer is pinned against. Gate B recall is only comparable within one
 * snapshot: bump this deliberately when the base corpus (golden-passages.jsonl / golden-set.base.jsonl)
 * changes, so a new CAO text does not silently fail retrieval gates tuned on the old corpus. Expected
 * sources are identified by article/lid (stable CAO structure), never by chunk id, so a
 * structure-aware re-chunk within the same snapshot must not move this version.
 *
 * v3: the base layer is the real CAO Elektrotechnische Detailhandel 2023. Passages are verbatim
 * article text from the source PDF; cases are expert-reviewed questions incl.
 * conditional/date-disambiguation traps (review log: fixtures/golden-set.REVIEW.md). Article anchors
 * follow the CAO's own N.M numbering (e.g. "6.2").
 *
 * v4 (E13): adds `derived` calculation-bait cases (vakantie-uren pro-rata: fulltime 190u → deeltijd
 * naar rato at 24u/12u, incl. the "26 × 12 = 312"-style fabrication reproduced from a real
 * conversation). No passages changed — only golden-set.base.jsonl grew — but any base fixture edit
 * must bump this version, so the retrieval baseline is re-recorded at v4 (see baseline.ts).
 *
 * v5 (2026-08-22): expands base refusal fixtures from 3 → 10 near-misses so under-refusal count
 * gates are not dominated by N=3 noise. Re-record baseline with EVAL_WRITE_BASELINE=1.
 */
export const GOLDEN_CORPUS_VERSION = "5";

/** Base layer file (was golden-set.jsonl before the E12 physical split; content is unchanged). */
const BASE_CASES_FILE = "golden-set.base.jsonl";
const PASSAGES_FILE = "golden-passages.jsonl";

const passagesRaw = readFixture(PASSAGES_FILE);
const casesRaw = readFixture(BASE_CASES_FILE);

export const goldenPassages = parseJsonl(passagesRaw, goldenPassageSchema);
export const goldenCases = parseJsonl(casesRaw, goldenCaseSchema);

/**
 * Content hash over BOTH base fixture files (raw bytes). Recorded in the baseline (see baseline.ts);
 * the eval fails when this changes while GOLDEN_CORPUS_VERSION stays the same — i.e. someone edited
 * the base golden set without a deliberate version bump, which would silently invalidate the
 * baseline. The NUL separator keeps the two files unambiguous (no boundary collision). Renaming
 * golden-set.jsonl → golden-set.base.jsonl (E12) does not change this hash: it is over file CONTENT,
 * not names, so the recorded baseline stays valid and the base layer runs unchanged.
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
      agentKey: "cao",
      schemaName: "fund_eval",
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

// ---------------------------------------------------------------------------------------------------
// FUND LAYER (E12) — fund-specific correctness cases, scored against the real corpus via integration.
// ---------------------------------------------------------------------------------------------------

/**
 * Fund cases are matched on the CAO STRUCTURE (article/lid) that the real pipeline returns, so unlike
 * base cases they carry no fixture passage ids and no distractor lists. An answerable fund case must
 * name its `expectedArticle` (the integration gate scores recall on article/lid); a refusal fund case
 * names none — it is a minScore probe (its answer is out of the fund corpus, so the floor must return
 * zero hits and the agent refuses without calling the LLM).
 */
export const goldenFundCaseSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    history: z.array(goldenCaseHistoryMessageSchema).max(6).optional(),
    expectedArticle: z.string().optional(),
    expectedLid: z.string().optional(),
    /** Arbo catalog cases match on chapter heading instead of CAO article/lid. */
    expectedChapter: z.string().optional(),
    referenceAnswer: z.string(),
    category: goldenCaseCategorySchema,
  })
  .superRefine((data, ctx) => {
    if (data.category === "refusal") return;
    if (data.referenceAnswer.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "answerable fund cases must define a non-empty referenceAnswer",
        path: ["referenceAnswer"],
      });
    }
    if (!data.expectedArticle && !data.expectedChapter) {
      ctx.addIssue({
        code: "custom",
        message: "answerable fund cases must define expectedArticle or expectedChapter",
        path: ["expectedArticle"],
      });
    }
  });

export type GoldenFundCase = z.infer<typeof goldenFundCaseSchema>;

/**
 * Per-fund-set metadata, keyed by the filename token (golden-set.<key>.jsonl). Kept in code (like
 * GOLDEN_CORPUS_VERSION) so each set has ONE typed source of truth for its snapshot version and its
 * integration target fund. A fund set file with no entry here fails loud at load — registering a new
 * fund is a deliberate act, never an accidental glob match.
 *
 * `fund` is the `retrieveContext` fund the cases are scored against. For ETD this is the reserved
 * fund the verbatim ETD article passages are ingested into (scripts/ingest/fixtures.ts,
 * EVAL_FIXTURE_FUND); a production ETD deployment would ingest the full CAO PDF under its own fund id
 * and only this value changes. `corpusVersion` is that fund's own snapshot tag (independent of the
 * base GOLDEN_CORPUS_VERSION), so a fund can re-embed without touching the base baseline.
 */
export interface FundSetMeta {
  fund: string;
  corpusVersion: string;
  /** Retrieval agent key — defaults to cao for legacy fund sets. */
  agentKey?: string;
}

const FUND_SET_META: Record<string, FundSetMeta> = {
  // ETD — CAO Elektrotechnische Detailhandel 2023. Scored against the ingested ETD passages
  // (fund "eval-fixtures"); review log: fixtures/golden-set.REVIEW.md (fund layer section).
  etd: { fund: "eval-fixtures", corpusVersion: "etd-1" },
  // Demo — the fictional "CAO Fictief" (Fase 5, tenant zero). Scored against the ingested demo corpus
  // (fund "demo", from scripts/ingest/demo-corpus). Runs on the nightly integration gate once that
  // corpus is ingested into the gate DB; base gates are unaffected (base fixture hash unchanged).
  demo: { fund: "demo", corpusVersion: "demo-1" },
  // ETD-full — the SAME CAO as `etd` above, but the complete 62-page PDF as the production ingest
  // stores it, under its own fund. Where `etd` scores hand-curated verbatim passages, this set scores
  // what the pipeline actually produced from the source document, so it is the only fund set that can
  // catch an ingest regression. Starter set, built from the template in
  // docs/eval/golden-sets/TEMPLATE-starter.md; not yet reviewed by a fund.
  "etd-full": { fund: "elektronische-detailhandel", corpusVersion: "etd-full-1" },
  // Arbo — OOMT sample arbocatalogus (scripts/ingest/arbo-oomt/arbo_catalogus_oomt.pdf).
  "arbo.oomt": { fund: "oomt", corpusVersion: "arbo-oomt-1", agentKey: "arbo" },
};

export interface GoldenFundSet {
  /** Filename token (golden-set.<key>.jsonl), e.g. "etd" or "arbo.oomt". */
  key: string;
  /** `retrieveContext` fund the cases are scored against. */
  fund: string;
  /** Catalog agent key for retrieval isolation. */
  agentKey: string;
  /** This fund set's own corpus snapshot version, independent of GOLDEN_CORPUS_VERSION. */
  corpusVersion: string;
  /** Fixture file name. */
  file: string;
  cases: GoldenFundCase[];
  /** SHA-256 over the set file's raw bytes (traceability in the run artefact). */
  fixtureHash: string;
}

const FUND_SET_FILE_RE = /^golden-set\.(.+)\.jsonl$/;

/**
 * Discover the fund layers: every golden-set.<key>.jsonl in the fixtures dir except the base set.
 * Deterministic order (sorted by key) so the run artefact is stable. Each discovered file must have a
 * FUND_SET_META entry or the load throws.
 */
function loadFundSets(): GoldenFundSet[] {
  const sets: GoldenFundSet[] = [];
  for (const file of readdirSync(fixturesDir).sort((a, b) => a.localeCompare(b))) {
    const match = FUND_SET_FILE_RE.exec(file);
    const key = match?.[1];
    if (!key || key === "base") {
      continue;
    }
    const meta = FUND_SET_META[key];
    if (!meta) {
      throw new Error(
        `Fund set fixture "${file}" has no FUND_SET_META entry (key "${key}"). ` +
          "Register the fund (target fund + corpusVersion) in golden-set.ts before adding the file.",
      );
    }
    const raw = readFixture(file);
    sets.push({
      key,
      fund: meta.fund,
      agentKey: meta.agentKey ?? "cao",
      corpusVersion: meta.corpusVersion,
      file,
      cases: parseJsonl(raw, goldenFundCaseSchema),
      fixtureHash: createHash("sha256").update(raw).digest("hex"),
    });
  }
  // Reverse guard: a META entry without a fixture must fail loud (same severity as fixture without
  // META). Discovery is file-driven; without this check an orphan META key is silently never scored.
  for (const key of Object.keys(FUND_SET_META)) {
    if (!sets.some((set) => set.key === key)) {
      throw new Error(
        `FUND_SET_META key "${key}" has no fixture file golden-set.${key}.jsonl. ` +
          "Add the fixture (see docs/eval/golden-sets/) or remove the META entry.",
      );
    }
  }
  return sets;
}

export const goldenFundSets: GoldenFundSet[] = loadFundSets();
