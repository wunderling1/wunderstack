# Eval Hardening (E0–E13) — Compliance Audit Against Plan

> **⚠️ OUTDATED (2026-07-21).** This audit was written against an earlier working tree; several
> verdicts are stale. Notably E7 (answer baseline) and E13 (runtime hard-fact guard) are now
> **implemented**, and the full eval runs **green** on `fix/eval-gate-enforcement` (run 2026-07-21).
> The E0–E13 labels are historical: the living gate model is the four layers (G1–G4) in
> `docs/eval/GATE-ARCHITECTURE.md`, which maps every E-label in Bijlage A.1. Keep this file as a
> point-in-time audit record; do not treat its verdicts as current state.

> Scope: verify that the eval-hardening work was implemented **as specified** for phases E0–E12,
> plus the two amendments (E0/E8 merge, new phase E13). Method: read of source, CI YAML, fixtures,
> tests, the committed baseline, and git history. Verdicts are on **behaviour** (call path traced
> from `main()`/CI to the claimed effect), not intent. Evidence is quoted with file:line.

## Preliminary: the plan document does not exist in the repo

`PLAN-eval-hardening.md` (E0–E12) is **not present**. The repository contains `PLAN-eval-gates.md`
(which uses a different, **P1–P8** numbering) and the prior report `eval-gate-audit.md`. This audit
therefore verifies the code against the E-phase specification given in the task brief (the amendments
included), and against the P-plan/report where they line up. The absence of the E-numbered plan is
itself a finding: an external reviewer cannot map the shipped commits (`feat(eval): E7–E10 …`,
`feat(eval/rag): align gates with production rerank topK=5 …`) to a written E0–E13 plan of record.

## Preliminary: much of the E-work is in the working tree, not committed

`git status` shows the E11/E12 artefacts are **uncommitted**:

```
 M .github/workflows/ci.yml
 M packages/agents/src/evals/cao.eval.ts
R  packages/agents/src/evals/fixtures/golden-set.jsonl -> …/golden-set.base.jsonl   (E12 rename, staged)
 M packages/agents/src/evals/golden-set.ts
 M packages/agents/src/evals/report-writer.ts
 M packages/shared/src/env.ts
?? docs/golden-set-cocreation.md
?? packages/agents/src/evals/fixtures/golden-set.etd.jsonl   (E12 fund file, untracked)
?? scripts/ingest/fixtures.ts                                 (E11 ingest, untracked)
```

Last commit is `4b87992 feat(eval): E7–E10 eval-gate hardening + v3 golden corpus`. E11/E12 (and
the E0/E8 ci.yml expression) exist only as working-tree changes. Verdicts below audit the **working
tree** (current repo state); the reviewer should note nothing after `4b87992` is on `main` yet.

---

## E0 (+E8) — Enforcement

**DoD: `EVAL_REQUIRE_ALL` evaluates to `'1'` for same-repo PRs, `'0'` for forks.** — **IMPLEMENTED.**
Verbatim (`.github/workflows/ci.yml:78`):

```yaml
EVAL_REQUIRE_ALL: ${{ (github.event_name == 'merge_group' || github.event_name == 'push' || github.event_name == 'schedule' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)) && '1' || '0' }}
```

- Same-repo `pull_request` (`head.repo.full_name == github.repository`) → `'1'` (enforced).
- Fork `pull_request` → `'0'` (skips B/C, no secrets). Correct.
- `push` (to main), `merge_group`, `schedule` → `'1'`.

`REQUIRE_ALL` promotes a missing-key gate to a FAIL (`cao.eval.ts:96`, `reportUnavailable`
`cao.eval.ts:1116-1133`: `required` → `passed:false` and returns `false`). So the pull_request run
is a genuine gate for same-repo PRs, as the amendment requires.

**DoD: anti-gaming — no `continue-on-error` / step `if:` / job split that lets `verify` pass while
the eval is skipped.** — **IMPLEMENTED.** The `Eval (accuracy gate)` step (`ci.yml:65-79`) has **no**
`if:` and **no** `continue-on-error`; a non-zero exit fails `verify`. The only step-level `if:` are
`Ingest golden fixtures` (`if: github.event_name == 'schedule'`, `ci.yml:53` — nightly-only ingest,
does not gate) and `Upload eval report` (`if: always()`). The `verify` job's `if: github.event_name
!= 'workflow_dispatch'` (`ci.yml:20`) only excludes the manual baseline-write path, which runs the
separate `write-baseline` job. No path skips the eval while `verify` reports success.

**DoD: branch protection (required `verify`, up-to-date required, admin bypass disabled).** —
**NOT VERIFIABLE FROM REPO.** `merge_group` remains as an (harmless) trigger (`ci.yml:9`), and
`ci.yml:7-8` and `PLAN-eval-gates.md:192-193` both say branch protection is a repo-settings task not
yet done. Request: `gh api repos/{owner}/{repo}/branches/main/protection` (or a settings screenshot)
showing `verify` as a required status check, "require branches up to date", and "do not allow
administrators to bypass" / no admin bypass.

**Verdict: DONE (code side). Branch-protection is external evidence.**

---

## E1 — Generation config

**DoD: `packages/shared/src/config/generation.ts` exists.** — **IMPLEMENTED.**

```17:20:packages/shared/src/config/generation.ts
export const GENERATION_CONFIG: GenerationConfig = {
  temperature: 0,
  maxTokens: 1024,
};
```

**DoD: imported AND used in BOTH agent (generate + stream) and eval.** — **IMPLEMENTED.**
- Agent generate: `agent.ts:214-217` `modelSettings: { temperature: GENERATION_CONFIG.temperature, maxOutputTokens: GENERATION_CONFIG.maxTokens }`.
- Agent stream: `agent.ts:300-303` same.
- Eval Gate C: `cao.eval.ts:1012-1013` `temperature: GENERATION_CONFIG.temperature, maxTokens: GENERATION_CONFIG.maxTokens`.
- Import sites: `agent.ts:3`, `cao.eval.ts:41`.

This closes the audited eval↔production temperature divergence (eval no longer forces a private
`temperature: 0`; both read the shared constant).

**Anti-gaming: remaining hardcoded `temperature:` in judge/condense.** — **PRESENT, deliberate.**
- Judge: `judge.ts:372` `temperature: 0` (literal, not the shared const). Acceptable — the judge is a
  different model/role; own value is defensible, but it is **not** wired to `GENERATION_CONFIG`.
- Condense: `condense.ts` uses `temperature: 0` (literal) with `maxTokens: 64`. Its own value by
  design (short rewrite). Report only.
- Generator model id is still a separate literal `EVAL_LLM_MODEL = "mistral-small-2603"`
  (`cao.eval.ts:90`) vs production `DEFAULT_LLM_MODEL`; same id, but not a single shared constant.

**DoD: Langfuse trace showing production temperature.** — **NOT VERIFIABLE FROM REPO.** Request a
Langfuse trace of a production `cao` generation showing `temperature = 0` on the model call.

**Verdict: DONE.** (Note: judge/condense keep their own literal `temperature: 0`.)

---

## E2 — Judge parse-retry

**DoD: `parseJudgeOutput` is a pure function; retry feeds the parse error back; exactly ONE retry
then throw.** — **IMPLEMENTED.**
- Pure parser: `parseJudgeOutput` (`judge.ts:46-61`) — regex-extract JSON, `JSON.parse`, Zod
  `judgeResponseSchema.parse`; throws on all three failure modes, no network.
- One targeted retry feeding the error back: `runJudgeWithParseRetry` (`judge.ts:89-107`) calls once,
  on failure appends `{role:"assistant", content:firstRaw}` + a corrective user turn
  (`"Je vorige antwoord was geen geldig JSON: …"`), calls once more; a second failure **throws**
  (`judge.ts:104-105`). Exactly one retry.
- Live on the path: `judgeOnce` (`judge.ts:367-378`) wraps the model call in `runJudgeWithParseRetry`;
  `judgeFaithfulnessAndCompleteness` → `scoreAnswerCase` (non-refusal) → Gate C.

**DoD: unit tests for valid JSON / JSON-in-prose / invalid JSON / Zod violation, wired into CI.** —
**IMPLEMENTED.** `judge.test.ts:8-39` covers clean JSON, JSON embedded in prose, no-JSON, malformed
JSON, and two Zod violations (out-of-range, missing field); `judge.test.ts:41-87` covers the
retry-once and fail-loud paths. Wired: `package.json:15` `"test:unit": "tsx --test 'src/**/*.test.ts'"`,
`turbo.json:10`, and `ci.yml:46-47` `Unit tests: pnpm turbo run test:unit` (runs on every event, no
`if:`). Not orphaned.

**Anti-gaming: no code path defaults a score on parse failure.** — **CONFIRMED.** `parseJudgeOutput`
only ever throws or returns a validated object; `runJudgeWithParseRetry` rethrows on the second
failure. No `catch` returns a default score anywhere in `judge.ts`.

**Verdict: DONE.**

---

## E3 — Refusal cases with distractors

**DoD: `distractorPassageIds` required non-empty for `category === "refusal"`, enforced in Zod.** —
**IMPLEMENTED.**

```58:66:packages/agents/src/evals/golden-set.ts
  .superRefine((data, ctx) => {
    if (data.category === "refusal" && (data.distractorPassageIds?.length ?? 0) === 0) {
      ctx.addIssue({
        code: "custom",
        message: "refusal cases must define at least one distractorPassageId (near-miss context)",
        path: ["distractorPassageIds"],
      });
    }
  });
```

Enforced at load (`parseJsonl` → `schema.parse`). Tests confirm rejection of empty/absent distractors
(`golden-set.test.ts:21-38`).

**DoD: all refusal cases have distractors; count.** — **IMPLEMENTED.** Base set: **3** refusal cases,
all with distractors: `etd-024` (`pensioenfonds`), `etd-025` (`looptijd`,`loonsverhoging`),
`etd-026` (`wet-arbeid-zorg`) (`golden-set.base.jsonl:24-26`). `golden-set.test.ts:47-60` asserts
every refusal has ≥1 distractor resolving to a real passage.

**The critical check: old `NOT_FOUND_MESSAGE`-as-answer constant substitution is gone; refusal cases
flow through the same generation call.** — **IMPLEMENTED.** `answerQualityChecks` runs **every** case
through the real `generateText` on assembled context (`cao.eval.ts:996-1020`); for refusals the
context is the distractor passages (`passagesForCase` returns `distractorPassageIds` for refusals,
`golden-set.ts:138-148`). There is no `NOT_FOUND_MESSAGE` shortcut in the Gate C loop (grep confirms
`NOT_FOUND_MESSAGE` is only used as the refusal-detection reference, `cao.eval.ts:1020`, and in the
prompt contract). This makes under-refusal genuinely measurable.

**DoD: `citationCorrectness = 1` forcing for refusals removed; every scorer runs.** — **MOSTLY.**
The forced `citationCorrectness: 1` in the old refusal branch is removed; `scoreAnswerCase` now calls
the real scorers on refusal cases (`judge.ts:432-451`): `hardHallucination`, `refusalCalibration`,
`citationVerification`, `refused` all run on the generated answer. faithfulness/relevance/completeness
ride on `refusalCalibration` (no LLM judge against a refusal reference). **Caveat:**
`scoreCitationCorrectness` still returns `1` for `category === "refusal"` unconditionally
(`judge.ts:222-224`), so a refusal case that **wrongly answers** still gets a free `1` on
citation-correctness — but it is caught by `underRefusalRate` (`refused === false`) and by
`hardHallucination`. Residual free-pass on one metric; not a structural hole.

**DoD: measured under-refusal rate.** — **NOT VERIFIABLE FROM REPO.** The gate computes
`underRefusalRate` (`judge.ts:536`, threshold ≤ 0.10 `cao.eval.ts:184,933`) but no value is recorded
(no answer baseline; §E7). Request an `eval-report.json` from a green Gate C run (or the PR
description) for the measured rate.

**Verdict: DONE** (with the noted `citationCorrectness=1`-by-category residual).

---

## E4 — Shared `assemble()`

**DoD: `buildContext()` deleted from judge.ts; eval imports production `assemble()`.** —
**IMPLEMENTED.** No `buildContext` remains in `judge.ts`. Instead:

```197:200:packages/agents/src/evals/judge.ts
export function assembleEvalContext(passages: GoldenPassage[]): string {
  return assemble(passages.map(passageToHit), NO_TIMINGS).context;
}
```

`assemble` is imported from `@wunderstack/rag` (`judge.ts:2`), the production assembler
(`packages/rag/src/assemble.ts:42-71`). Gate C context is built via `assembleEvalContext`
(`cao.eval.ts:1001`).

**DoD: snapshot test proving byte-identical context, wired into CI.** — **IMPLEMENTED.**
`assemble.test.ts:33-52` includes a byte-exact snapshot **and** `"matches production assemble on the
same adapted hits"` (`viaEval === assemble(passages.map(passageToHit)).context`). Wired via
`test:unit` (see E2).

**Anti-gaming: does `passageToHit` fabricate a field production populates differently?** — **YES, a
residual one-level-down divergence in `sourceRef`.** The fixture adapter derives:

```150:154:packages/agents/src/evals/golden-set.ts
function sourceRefFor(passage: GoldenPassage): string | null {
  if (!passage.article) return null;
  return /^bijlage/i.test(passage.article) ? passage.article : `Artikel ${passage.article}`;
}
```

i.e. `"Artikel 5.2"` / `"Bijlage 1"`, with **no lid component**. Production ingestion builds
`sourceRef` differently — `scripts/ingest/chunk.ts:172,250` `buildSourceRef(chapter, article, lid)`
produces `"Artikel 5, lid 2"` (chapter/lid-aware). So `assemble()`'s context anchor
(`assemble.ts:65` `(${hit.structure.sourceRef})`) reads `"(Artikel 5.2)"` in the eval but would read
`"(Artikel 5, lid 2)"` for a real chunk carrying a lid. The snapshot test proves eval==production
*on the adapted hits*, but the adapter's `sourceRef` format still diverges from what real ingestion
writes to the DB. Note: the E11 fixture-ingest (`scripts/ingest/fixtures.ts:62-64`) uses the **same**
`sourceRefFor`, so the eval-fixtures fund is internally consistent; the divergence is only against a
real full-CAO ingest via `chunk.ts`.

**Verdict: DONE** (with a documented residual `sourceRef` format divergence vs `chunk.ts` ingestion).

---

## E5 — Rerank visibility

**DoD: Gate B calls production `rerank()` (enabled/skipAboveScore/single-candidate logic), not
`rerankDocuments` directly.** — **IMPLEMENTED.** Gate B imports `rerank` from `@wunderstack/rag`
(`cao.eval.ts:40`) and calls it (`cao.eval.ts:450-454`); `rerank()` (`packages/rag/src/rerank.ts:35-121`)
applies `enabled` (`:44`), single-candidate (`:54`), and `skipAboveScore` (`:64-73`) before calling
`rerankDocuments`. Gate B feeds real cosine scores into the candidate hits (`cao.eval.ts:446-449`
`score: entry.score`), so `skipAboveScore` (0.85) is exercised.

**DoD: swallow-catch gone; the gate fails on rerank errors.** — **IMPLEMENTED.** The old
`try/catch → candidates.slice(0, topK)` in the eval is gone; `rerank()` now returns a `status`
(`"reranked" | "skipped" | "failed"`, `rerank.ts:21,99-120`). Gate B tallies them and asserts:

```538:542:packages/agents/src/evals/cao.eval.ts
    {
      name: "rerank: no silent failures",
      ok: failedCount === 0,
      detail: `${String(failedCount)} failed of ${String(retrievalQueries.length)}`,
    },
```

**DoD: run output includes reranked/skipped/failed; MRR-delta over the reranked subset only.** —
**IMPLEMENTED.** Console line `cao.eval.ts:483-485` prints the three counts; `retrievalReport.rerank`
(`cao.eval.ts:522-528`) records them. `rerankMrrDelta` is computed only over reranked queries
(`rerankedBefore`/`rerankedAfter`/`rerankedQueries`, `cao.eval.ts:457-474`), and the gate `"rerank:
MRR does not regress on reranked queries (delta >= 0)"` (`cao.eval.ts:543-550`) uses it.

**Verdict: DONE.**

---

## E6 — K-alignment

**DoD: pipeline verification of candidateK vs topK before rerank; the fix/documenting comment
present.** — **IMPLEMENTED / ALIGNED.** Production retrieval fetches the **candidateK** pool from
pgvector, not topK:

```110:144:packages/rag/src/retrieve.ts
  const candidateK = input.candidateK ?? config.candidateK;
  ...
    .orderBy(distance)
    .limit(candidateK);
```

`retrieveContext` (`index.ts:22-33`) leaves `candidateK` unset → defaults to `RERANK_CONFIG.candidateK`
(15), then `rerank({..., topK})` trims to topK (5). So the pool is 15 and the model sees 5.

**DoD: quote production `topK` default and gate `PRIMARY_K` / thresholds; aligned or documented.** —
**ALIGNED.**
- Production contract default `topK: 5`, `minScore: 0.35` (`types.ts:26,31`).
- `RERANK_CONFIG`: `candidateK: 15`, `topK: 5` (`config/rerank.ts:36-37`).
- Gate: `PRIMARY_K = 5` (`cao.eval.ts:93`), thresholds keyed on recall@5 (`RETRIEVAL_THRESHOLDS`
  `cao.eval.ts:156-161`), with a comment tying it to production topK (`cao.eval.ts:92,151-155`).
- Gate B-integration uses `PRODUCTION_DEFAULTS = caoQuestionSchema.parse(...)` (`cao.eval.ts:121`),
  i.e. the exact production topK/minScore, so the nightly measures real K.

**Verdict: DONE.**

---

## E7 — Answer baseline

**DoD: `fixtures/baseline.json` contains an `answer` section.** — **NOT IMPLEMENTED.** The committed
baseline has **only** retrieval:

```1:10:packages/agents/src/evals/fixtures/baseline.json
{
  "corpusVersion": "3",
  "fixtureHash": "ef3aa7ad9d7a41172fde4e462d6f73e1d428468c576a5f8c733bfbaa813d015f",
  "retrieval": {
    "hitAt1": 0.9565217391304348,
    "recallAt3": 1,
    "recallAt5": 1,
    "mrr": 0.9782608695652174
  }
}
```

Consequently `answerRegressionChecks` returns `[]` (dead) — `cao.eval.ts:941-945` early-returns when
`baseline.answer` is absent. The infrastructure is fully built (schema `baseline.ts:28-40`; writer
`cao.eval.ts:1025-1041`; `write-baseline` `workflow_dispatch` job with `EVAL_JUDGE_SAMPLES=3`,
`ci.yml:95-118`) but no answer baseline was ever recorded/committed. **Answer regression protection is
therefore not live.**

**DoD: git evidence the answer section was written after E3–E6.** — **N/A (no answer section).** The
retrieval baseline is current for corpus v3 (post-E3/E4/E5/E6, since v3 is the new corpus). Sequencing
of the *answer* section cannot be evaluated because it does not exist. `baseline.json` last changed in
`4b87992` (the E7–E10 commit) but only the retrieval section was written.

**DoD: written with `EVAL_JUDGE_SAMPLES=3`?** — **Unrecorded / moot.** The manual `write-baseline`
job sets `EVAL_JUDGE_SAMPLES=3` (`ci.yml:118`), but since no answer baseline exists there is nothing
to attest. `eval-report.json` would record `config.judgeSamples` (`cao.eval.ts:1145`) but is not
committed.

**DoD: `answerRegressionChecks()` live (non-empty under current baseline).** — **NOT LIVE.** Returns
`[]` (see above).

**Verdict: PARTIAL.** Retrieval baseline present and current; **answer baseline absent → answer
regression checks dead.** This is the most consequential gap after E13.

---

## E9 — Run artifacts

**DoD: `report-writer.ts` exists and is called at the end of `main()` including on failure paths.** —
**IMPLEMENTED.** `report-writer.ts` writes `eval-report.json` (`writeEvalReport` `:144-151`, wrapped
in try/catch so a serialization error never masks the run). It is invoked from a `finally`:

```1262:1266:packages/agents/src/evals/cao.eval.ts
  } finally {
    // Always leave a downloadable artefact — a crashed or failed run is exactly when it matters.
    // If a gate threw, the run did not complete, so it is recorded as not passed.
    writeRunArtefact(completed && allPassed);
  }
```

The `finally` runs **before** the exit-code logic (`cao.eval.ts:1268-1273`), and a thrown gate is
caught by the outer `main().catch` after the artefact is already written (`completed` stays false →
`passed:false`). So a thrown error does **not** skip the artefact.

**DoD: ci.yml `upload-artifact` with `if: always()`.** — **IMPLEMENTED.** `ci.yml:83-89`
`Upload eval report`, `if: always()`, `path: packages/agents/eval-report.json`.

**DoD: Langfuse dataset-run push.** — **NOT IMPLEMENTED.** The artefact is a local JSON file only;
there is no Langfuse dataset/dataset-run push in the eval (grep: `judge`/`langfuse` interplay is
production-only). Matches the plan's "step 2 pending".

**Verdict: DONE for the artefact (write-on-failure + CI upload). Langfuse dataset push not done.**

---

## E10 — Fixture hygiene

**DoD: `build-golden-fixtures.ts` deleted (or read-and-merge).** — **IMPLEMENTED (deleted).** Glob for
`**/build-golden-fixtures.ts` returns 0 files. `golden-set.ts:90-93` documents "the generator was
removed in E10".

**DoD: SHA-256 over both JSONL files, compared against `fixtureHash`, failing on mismatch without a
version bump; trace the failure path.** — **IMPLEMENTED.** Hash:

```128:132:packages/agents/src/evals/golden-set.ts
export const GOLDEN_FIXTURE_HASH = createHash("sha256")
  .update(passagesRaw)
  .update("\0")
  .update(casesRaw)
  .digest("hex");
```

Failure path: `fixtureHashChecks` (`cao.eval.ts:293-309`) compares `baseline.fixtureHash` against
`GOLDEN_FIXTURE_HASH` **when** a baseline for the current version exists; a mismatch is a failing
check → part of Gate A (`cao.eval.ts:1171-1176`) → `report()` returns false → `allPassed=false` →
`process.exitCode = 1`. Live: baseline `fixtureHash` is set and `corpusVersion "3" === GOLDEN_CORPUS_VERSION`.

**DoD: review log of ≥15 cases; `q-proeftijd-onbepaald` corrected; `GOLDEN_CORPUS_VERSION` "2" and
baseline refreshed after.** — **MOSTLY, with a version deviation.**
- Review log: `fixtures/golden-set.REVIEW.md` reviews all **28 base** + **26 fund** cases case-by-case
  (well over 15).
- `q-proeftijd-onbepaald`: the buggy synthetic case was **retired** entirely — v3 replaces the old
  "CAO Voorbeeldsector" set with the real CAO ETD (`golden-set.ts:103-107`, `REVIEW.md:22-32`). The
  proeftijd case is now `etd-004` with a corrected reference answer (`golden-set.base.jsonl:4`,
  reviewed OK at `REVIEW.md:41`). So the error is gone, but by replacement, not in-place correction.
- **Version is `"3"`, not `"2"`** (`golden-set.ts:108`). The plan/amendment says bump to "2"; the
  implementation went to v3 (the synthetic v2 was superseded by the real-CAO v3). Deviation, documented
  in `golden-set.ts`/`REVIEW.md`.
- Baseline refreshed after: **retrieval** section refreshed at v3; **answer** section not (see E7).

**Verdict: DONE** (generator deleted, hash guard live, review log present). Deviation: corpus version
is `3`, not `2`, and the answer baseline was not refreshed.

---

## E11 — Gate B-integration (nightly)

**DoD: ingest fixture-mode (test fund, idempotent).** — **IMPLEMENTED.** `scripts/ingest/fixtures.ts`
ingests the golden passages into the reserved fund `eval-fixtures` (`:31`), idempotent on a sha256 of
the passages file (`:100,113-118`), `--force` to re-embed. Distinct `source_uri`
(`eval-fixtures://golden-passages.jsonl`, `:33`).

**DoD: integration block invokes the real pipeline (`packages/rag`), not a re-implementation.** —
**IMPLEMENTED.** `retrievalIntegrationChecks` calls `retrieveContext(...)` (`cao.eval.ts:644-650`),
the real `rewrite → pgvector → rerank → assemble` pipeline (`packages/rag/src/index.ts:18-44`), with
production topK/minScore.

**DoD: minScore-guard (≥2 refusal questions yielding 0 hits via the real pipeline).** —
**IMPLEMENTED, with a deviation in what serves as the probe.** The guard uses **3 dedicated
out-of-corpus probes** and requires ≥2 empty (`cao.eval.ts:144-149, 654-663, 693-697`), **not** the
golden refusal cases (which by E3 design carry in-corpus distractors that clear the floor — documented
`cao.eval.ts:136-143`). Same intent (refuse-without-LLM), different probe source. The fund layer
mirrors this with the fund refusal cases as probes (`cao.eval.ts:731-742`).

**DoD: ci.yml nightly has `DATABASE_URL`, integration only runs there.** — **IMPLEMENTED.**
`DATABASE_URL: ${{ github.event_name == 'schedule' && secrets.DATABASE_URL || '' }}` (`ci.yml:73`),
`EVAL_REQUIRE_DB: ${{ github.event_name == 'schedule' && '1' || '0' }}` (`ci.yml:74`). The gate runs
only when `env.DATABASE_URL && env.SCALEWAY_API_KEY` (`cao.eval.ts:1209`); otherwise
`reportUnavailable(..., REQUIRE_DB)` — required only nightly. Nightly ingest step (`ci.yml:52-57`).

**DoD: the nightly run itself (does it pass / thresholds met).** — **NOT VERIFIABLE FROM REPO.**
Integration thresholds are marked PROVISIONAL (`cao.eval.ts:123-134`). Request a nightly
`eval-report.json` (`retrievalIntegration` block) to confirm the gate actually runs green against the
staging DB.

**Verdict: DONE (code side).** Deviation: min-score guard uses dedicated out-of-corpus probes, not the
golden refusal cases.

---

## E12 — Golden set split

**DoD: physical split into `golden-set.base.jsonl` + fund files; glob loader with per-set version;
per-layer reporting.** — **IMPLEMENTED.**
- Split: `golden-set.base.jsonl` (staged rename of `golden-set.jsonl`) + `golden-set.etd.jsonl`
  (untracked). Base loaded `golden-set.ts:111-118`.
- Glob loader with per-set version: `loadFundSets` (`golden-set.ts:258-284`) matches
  `golden-set.<key>.jsonl`, requires a `FUND_SET_META` entry (throws otherwise, `:266-272`); each set
  carries its own `corpusVersion` (`FUND_SET_META.etd = { fund:"eval-fixtures", corpusVersion:"etd-1" }`,
  `:231-235`).
- Per-layer reporting: Gate F pushes a `FundLayerReport` per set (`cao.eval.ts:755-769`), serialized
  under `funds[]` in `eval-report.json` (`report-writer.ts:96-137`, `cao.eval.ts:1158`) — base vs fund
  scores reported apart. Fund tests: `golden-set.test.ts:80-114`.

**DoD: OOMT cases present; count.** — The term "OOMT" is not used in the repo. Interpreting it as the
out-of-corpus / out-of-mandate refusal probes of the fund layer: the ETD fund set has **3** such
probes (`etd-f24` kinderopvang, `etd-f25` bedrijfsfitness, `etd-f26` jubileumgratificatie —
`golden-set.etd.jsonl:24-26`), plus **3** in the base set (`etd-024/025/026`). If OOMT means something
narrower from the co-creation session, that mapping is not derivable from the repo.

**DoD: the co-creation session.** — **NOT VERIFIABLE FROM REPO.** Only the *process* doc
`docs/golden-set-cocreation.md` exists (untracked); there is no artefact of an actual session with
fund domain experts. Request the session output/attendance if that is a compliance requirement.

**Verdict: DONE.**

---

## E13 — Derived calculations (amendment)

**DoD (a): runtime guard in `verifyAndBuild` — an answer with a hard fact and zero surviving verified
citations must not be served as-is.** — **NOT IMPLEMENTED.** `verifyAndBuild` (`agent.ts:113-128`)
parses output, verifies citations, strips failed/unverified markers, and returns the (marker-stripped)
answer. There is **no** check for hard facts (€/%/quantity+unit) with zero surviving citations:

```113:128:packages/agents/src/cao/agent.ts
function verifyAndBuild(
  raw: string,
  retrieval: RetrievalOutput,
): { answer: string; citations: CaoCitation[]; verificationFailed: boolean } {
  const parsed = parseGenerationOutput(raw);
  const fullContentById = new Map(retrieval.fullChunkContent);
  const verification = verifyCitations(parsed.modelCitations, fullContentById);
  const citations = buildVerifiedCitations(verification.verified, retrieval.chunks);
  const verifiedMarkers = citations.map((citation) => citation.ref);
  const answer = stripUnverifiedMarkers(
    stripFailedMarkers(parsed.answerMarkdown, verification.strippedMarkers),
    verifiedMarkers,
  );
  const verificationFailed = parsed.citationParseFailed || verification.strippedMarkers.length > 0;
  return { answer, citations, verificationFailed };
}
```

An answer such as "je krijgt € 6,25 vergoeding" whose citation fails verification is served as the
original prose minus the stripped `[n]` marker — exactly the outcome the amendment forbids. The only
sets `citationVerificationFailed` (a trace score / UI flag), which does not gate serving.

**DoD (b): the hard-fact regex is shared between the guard and `scoreHardHallucination` (one source of
truth).** — **NOT IMPLEMENTED.** `HARD_FACT_PATTERNS` exists only in `judge.ts:296-300` (eval path);
it is not exported to or used by production `agent.ts`. There is no guard to share it with.

**DoD (c): `derived` category in the Zod enum; count of derived cases; the vakantie-uren pro-rata
conversation (fulltime 190u → 24u/12u, and the "26 × 12 = 312" failure).** — **NOT IMPLEMENTED.**
- The category enum is `z.enum(["in_scope", "refusal", "table"])` (`golden-set.ts:33`) — **no
  `derived`**. Same for the fund schema.
- **0** derived cases. The vakantie-uren material present is a plain fact case (`etd-002`: "Op hoeveel
  vakantie-uren heb ik recht als fulltimer?" → 190u, `golden-set.base.jsonl:2`); there is no pro-rata
  derivation case at 24u/12u and no "26 × 12 = 312" expected-refusal-or-correct-derivation case (grep
  for `312` / `24u` / `derived` finds nothing in fixtures).

**Verdict: NOT IMPLEMENTED (entire phase).** The amendment's runtime guard, shared regex, `derived`
category, and the five-turn production conversation are all absent.

---

## Deviations from plan

1. **Plan document missing / renumbered.** No `PLAN-eval-hardening.md` (E0–E12) exists; the plan of
   record is `PLAN-eval-gates.md` (P1–P8). Not documented as an equivalence anywhere.
2. **E-work uncommitted.** E11 (`fixtures.ts`), E12 (`golden-set.etd.jsonl`, the base-rename) and the
   E0/E8 ci.yml expression are working-tree changes, not on `main` (last commit `4b87992` = "E7–E10").
3. **Corpus version is `3`, not `2` (E10).** The synthetic v2 was replaced wholesale by the real CAO
   ETD v3; documented in `golden-set.ts`/`REVIEW.md`.
4. **E7 answer baseline not recorded.** Infra exists; `baseline.json` holds only a retrieval section,
   so answer regression checks are dead. (Documented implicitly by the absent section, not called out.)
5. **E4 `sourceRef` residual divergence.** The fixture adapter's `sourceRefFor` (`"Artikel 5.2"`,
   no lid) differs from production ingestion `buildSourceRef` (`"Artikel 5, lid 2"`) in `chunk.ts`.
   Not documented.
6. **E11 min-score guard uses dedicated out-of-corpus probes**, not the golden refusal cases as the
   plan wording implies. Documented in code (`cao.eval.ts:136-143`).
7. **E3 `citationCorrectness` still `1` by category for refusals** (`judge.ts:222-224`); a wrongly
   answering refusal case gets a free pass on that one metric (caught elsewhere). Documented in code
   comment (`judge.ts:432-438`) as intentional.
8. **E1 judge/condense keep literal `temperature: 0`** rather than the shared `GENERATION_CONFIG`
   (acceptable per plan, reported).

## External evidence required (NOT VERIFIABLE FROM REPO)

| Phase | Evidence to request |
|-------|--------------------|
| E0 | Branch protection on `main`: `gh api repos/{owner}/{repo}/branches/main/protection` (or screenshot) showing required check `verify`, "require up to date", admin bypass disabled. |
| E1 | Langfuse trace of a production `cao` generation showing `temperature = 0` on the model call. |
| E3 | Measured `underRefusalRate` (green `eval-report.json` or PR description). |
| E7 | A recorded answer baseline + the run that produced it (`EVAL_JUDGE_SAMPLES=3`); currently none exists. |
| E9 | A Langfuse dataset-run push (plan step 2) — not implemented; confirm whether still required. |
| E11 | A nightly `eval-report.json` (`retrievalIntegration` block) proving Gate B-integration runs green against the staging DB. |
| E12 | Artefact of the actual golden-set co-creation session with fund domain experts. |

## Summary table

| Phase | Verdict | Blocking issues |
|-------|---------|-----------------|
| E0 (+E8) Enforcement | **DONE** (code); branch protection external | Branch protection not verifiable from repo |
| E1 Generation config | **DONE** | Judge/condense use literal temp 0 (minor) |
| E2 Judge parse-retry | **DONE** | — |
| E3 Refusal + distractors | **DONE** | `citationCorrectness=1`-by-category free pass (minor) |
| E4 Shared assemble() | **DONE** | Residual `sourceRef` format divergence vs `chunk.ts` |
| E5 Rerank visibility | **DONE** | — |
| E6 K-alignment | **DONE** | — |
| E7 Answer baseline | **PARTIAL** | Answer section absent → answer regression checks dead |
| E9 Run artifacts | **DONE** (artefact) | Langfuse dataset-run push not implemented |
| E10 Fixture hygiene | **DONE** | Version is `3` not `2`; answer baseline not refreshed |
| E11 Gate B-integration | **DONE** (code) | Nightly run result not verifiable from repo |
| E12 Golden set split | **DONE** | Co-creation session not verifiable |
| E13 Derived calculations | **NOT STARTED** | Guard, shared regex, `derived` category, vakantie-uren cases all absent |

## Regressions introduced (vs the original `eval-gate-audit.md` values)

**Thresholds — no loosening.** All Gate C answer thresholds match the audited values verbatim
(`cao.eval.ts:170-185`): `hardHallucination 0.98`, `citationVerification 0.98`, `softFaithfulness 0.8`,
`relevance 0.85`, `citationCorrectness 0.75`, `completeness 0.7`, `refusalCalibration 0.9`,
`maxOrphanRate 0`, `maxDanglingMarkerRate 0`, `maxOverRefusalRate 0.05`, `maxUnderRefusalRate 0.1`.
Gate B retrieval thresholds unchanged (`hitAt1 0.85`, `recallAt3/5 0.9`, `mrr 0.88`,
`cao.eval.ts:156-161`). The lower integration thresholds (`0.7/0.8/0.8/0.75`, `cao.eval.ts:129-134`)
belong to a **new, separate** nightly gate and are not a relaxation of an existing bar.

**Improvements (not regressions).** The rerank swallow-catch is removed (`status:"failed"` now fails
Gate B); temperature divergence is closed via `GENERATION_CONFIG`; refusal constant-substitution is
removed so under-refusal is measurable; a fixture-hash guard now protects the baseline.

**Weakened / unaddressed items to flag.**
1. **E13 production gap (unaddressed amendment, not a new regression):** production can still serve an
   answer containing a fabricated hard fact (€/%/quantity) with zero verified citations —
   `verifyAndBuild` strips markers but does not withhold the claim. The eval's `hardHallucination`
   gate covers Gate C on golden context, but there is **no runtime equivalent** on the served path.
2. **New eval↔production divergence (minor):** the E4 `sourceRef` format mismatch (fixture "Artikel
   5.2" vs ingested "Artikel 5, lid 2") is a fresh, undocumented one-level-down divergence introduced
   by the shared-assemble adapter.
3. **Answer regression protection is dead (E7):** with no answer baseline, only the absolute Gate C
   thresholds catch answer-quality drift — the regression-relative protection the plan promised for
   answers is not in effect (retrieval-only).
