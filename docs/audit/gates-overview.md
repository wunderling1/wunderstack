# Audit: Complete Gates Inventory (Gates A–D / E0–E13)

> **Type:** READ-ONLY diagnostic inventory. No fixes or recommendations.
> **Date:** 2026-07-30  
> **Method:** repo-wide search → read implementations → cross-ref docs / CI / branch-protection artefacts.  
> **Evidence labels:** **feit** = verified in code/config with path; **schatting** = inferred from surrounding evidence; **aanname** = not verified.

## Scope note (naming)

**feit.** The living gate identifiers in code and the canonical doc are the four-layer model
`G1`–`G4` / `G1-contract` … `G3-isolation` (`packages/agents/src/evals/gates.ts:45-89`,
`docs/eval/GATE-ARCHITECTURE.md:1-6`). Old labels **Gate A–D / B2 / B-integration / F** and
**E0–E13** are declared historical and mapped only in
`docs/eval/GATE-ARCHITECTURE.md` Bijlage A (`:390-418`). Comments in `cao.eval.ts` still use the
old Gate A/B/C/F wording extensively. This report inventories the **requested** A–D and E0–E13
labels and maps each to what actually runs today.

Related labels found in the same search (B2, B-integration, Gate F, Gate E) are covered under
Gaps / Not found — they are part of the historical inventory even though outside the strict A–D
letter set.

---

## Gates A–D (and adjacent historical gate labels)

### Gate A — Prompt & clarify CONTRACT

| Field | Content |
|---|---|
| **Identifier & name** | Historical: **Gate A**. Living id: part of **`G1-contract`** (`gates.ts:47-51`). Fixture-hash portion is also labeled **E10** / invariant Fixture-hygiëne in docs. |
| **Purpose** | Change-detector: system prompt still contains non-negotiable grounding rules; deterministic clarify router fires on underspecified salary questions and does not hijack answerable golden cases. **Does not** prove the model obeys the prompt (that is Gate C / G2-answer). **feit** (`cao.eval.ts:12-17`, `:222-284`). |
| **Role** | CI enforcement (eval harness) + offline unit path via the always-on G1 gate. |
| **Trigger** | Every eval run (`pnpm turbo run test` → `cao.eval.ts`), including PR / push / merge_group / schedule. No API keys. **feit** (`gates.ts:50` `requires: "none"`; `ci.yml:72-73`). |
| **Pass/fail criteria** | Prompt regex/includes checks (`cao.eval.ts:222-260`): e.g. `/uitsluitend op basis van de aangeleverde context/i`, `[1]` + `/bronnen/i`, `NOT_FOUND_MESSAGE` present, `/kern beantwoordt/i` + `/toelichting/i`, artikel+lid, `/geen (?:persoonlijk\|individueel)/i` + `/advies/i`, contiguous-quote rule `/aaneengesloten/i` + ellipsis. Clarify (`:267-284`): three fixed underspecified questions must trigger `detectClarification`; zero answerable golden cases may be hijacked. Fixture-hash (`:296-311`): when baseline has `fixtureHash` for current `GOLDEN_CORPUS_VERSION`, `GOLDEN_FIXTURE_HASH === baseline.fixtureHash`. Fund-scoping contract (historical Gate D-contract) is also folded into the same G1 run (`:1425-1429`). |
| **Implementation location** | `packages/agents/src/evals/cao.eval.ts` (`promptContractChecks`, `clarifyContractChecks`, `fixtureHashChecks`); wired in `GATE_RUNS["G1-contract"]` (`:1424-1430`); registry `packages/agents/src/evals/gates.ts`; prompt source `packages/agents/src/cao/prompt.ts`; clarify `packages/agents/src/cao/clarify.ts`. |
| **Dependencies** | Golden set (`goldenCases`) for hijack check; `baseline.json` for fixture-hash; no external services. |
| **Blocking behavior** | **feit.** Failed checks → `pushGate` status `failed` → `main()` sets `process.exitCode = 1` (`cao.eval.ts:1516-1518`). That fails the CI `verify` job’s “Eval (accuracy gate)” step (`ci.yml:72-73`, no `continue-on-error`). Whether a failed `verify` blocks merge to `main` depends on branch protection (see Summary §2 / Open questions) — last written evidence: `docs/audit/branch-protection-check.md` claims `verify` required as of 2026-07-20; live `gh api …/protection` returned Forbidden on audit day; no `branch-protection-proof.json` in repo. |
| **Status** | `implemented` (as part of `G1-contract`; label “Gate A” is narrative/historical only in living docs). |

---

### Gate B — Retrieval recall + rerank

| Field | Content |
|---|---|
| **Identifier & name** | Historical: **Gate B**. Living id: **`G2-retrieval`**. Rerank portion also maps to **E5** / **P8**. |
| **Purpose** | Protect retrieval quality on golden fixtures: cosine recall@k + MRR before/after rerank; no silent rerank failures; rerank MRR must not regress; regression vs committed baseline within tolerance. **feit** (`cao.eval.ts:19-23`, `:488-644`). |
| **Role** | CI enforcement (needs Scaleway). |
| **Trigger** | Same-repo PR / push / merge_group / schedule when `SCALEWAY_API_KEY` present. Fork PRs without secrets: skip (or fail if `EVAL_REQUIRE_ALL`). **feit** (`gates.ts:53-57`; `ci.yml:85`; `cao.eval.ts:1380-1399`). |
| **Pass/fail criteria** | Absolute (`RETRIEVAL_THRESHOLDS`, `cao.eval.ts:177-182`): `hitAt1 >= 0.85`, `recallAt3 >= 0.90`, `recallAt5 >= 0.90`, `MRR >= 0.88`. Also: embedding dim matches config; `failedCount === 0`; `rerankMrrDelta >= 0` (`:629-642`). Regression (`:647-671`): each metric `now >= was - REL_TOLERANCE` where `REL_TOLERANCE = 0.05` (`baseline.ts:56`). Relevance matched on article/lid, not chunk id (`:419-435`). |
| **Implementation location** | `cao.eval.ts` (`retrievalAndRerankChecks`, `recallChecks`, `retrievalRegressionChecks`); `gates.ts` `G2-retrieval`; embeddings via `@wunderstack/ai`; rerank via `@wunderstack/rag` + `packages/shared/src/config/rerank.ts` (`candidateK: 15`, `topK: 5`). |
| **Dependencies** | `SCALEWAY_API_KEY`; golden passages + base cases; `baseline.json` (optional relative checks); pinned embedding/rerank models. |
| **Blocking behavior** | Same as Gate A when the gate runs and fails. When keys missing and `EVAL_REQUIRE_ALL=1`: **REQUIRED-BUT-UNAVAILABLE → fail** (`cao.eval.ts:1355-1366`). When `EVAL_REQUIRE_ALL` unset/0: status `skipped` (not `passed`) (`:1368-1376`). CI sets `EVAL_REQUIRE_ALL=1` on merge_group/push/schedule/same-repo PR (`ci.yml:85`). |
| **Status** | `implemented`. |

---

### Gate B2 — Multi-turn condensation (historical; still a separate registry gate)

| Field | Content |
|---|---|
| **Identifier & name** | Historical: **Gate B2**. Living id: **`G2-multi-turn`**. Docs claim it is “nu case-categorie van G2-retrieval” / “geen aparte gate meer” (`GATE-ARCHITECTURE.md:71`, `:398`), but code still registers a **separate** gate id. **feit** (`gates.ts:58-63`, `GATE_RUNS` `:1432`). |
| **Purpose** | Elliptical follow-ups detected → condensed → retrieve expected article; answerable elliptical cases must survive `verifyAndBuild` with a verified citation. **feit** (`cao.eval.ts:881-1022`). |
| **Role** | CI enforcement (needs Scaleway + Mistral). |
| **Trigger** | Same as G2-answer prerequisites (`requires: "scaleway+mistral"`). |
| **Pass/fail criteria** | Per follow-up case: `isElliptical` true; expected article in ranked ids after rewrite; rerank not failed. Serve-path: each answerable elliptical case `served.found && citations.length > 0`; aggregate `unverifiableCount <= MULTI_TURN_SERVE_THRESHOLDS.maxUnverifiableCount` where that max is **0** (`answer-floors.ts:62-65`). At least one multi-turn golden case must exist. |
| **Implementation location** | `cao.eval.ts` (`condensationChecks`, `multiTurnServeChecks`, `multiTurnChecks`); `cao/condense.ts`; `verifyAndBuild` in `cao/agent.ts`. |
| **Dependencies** | `SCALEWAY_API_KEY`, `MISTRAL_API_KEY`; LLM for `condenseQuery`; golden multi-turn cases. |
| **Blocking behavior** | Same pattern as Gate B/C under `EVAL_REQUIRE_ALL`. |
| **Status** | `implemented` (as `G2-multi-turn`). Doc claim that it is no longer a separate gate is **inconsistent with code** — see Gaps. |

---

### Gate C — Answer-level quality

| Field | Content |
|---|---|
| **Identifier & name** | Historical: **Gate C**. Living id: **`G2-answer`**. Absolute floors also feed baseline write-guard (E7 / invariant Baseline-integriteit). |
| **Purpose** | Answer quality on golden context: hard hallucination, soft faithfulness, relevance, citations, completeness, refusal calibration, orphan/dangling markers, over/under-refusal; plus ±tolerance regression vs baseline. **feit** (`cao.eval.ts:25-28`, `:1025-1267`; `answer-floors.ts:23-60`). |
| **Role** | CI enforcement (needs Scaleway + Mistral). |
| **Trigger** | Same-repo PR / push / merge_group / schedule with keys. Judge samples: `EVAL_JUDGE_SAMPLES=3` on schedule/merge_group/push, `1` on PR (`ci.yml:88`). Generation attempts: `EVAL_GENERATION_SAMPLES=3` where answer gate required, else `2` (`ci.yml:93`). |
| **Pass/fail criteria** | From `ANSWER_THRESHOLDS` (`answer-floors.ts:23-60`) applied in `answerLevelChecks` (`cao.eval.ts:1057-1105`): |
| | • `hardHallucination >= 0.98` |
| | • `softFaithfulness` (`aggregate.faithfulness`) `>= 0.8` |
| | • `relevance >= 0.84` |
| | • `citationCorrectness >= 0.75` (answerable cases only — `judge.ts:550-556`) |
| | • `completeness >= 0.7` |
| | • `refusalCalibration >= 0.9` |
| | • `unverifiedCitationCount <= 1` (count gate; rate 0.98 is trend-only) |
| | • `orphanRate <= 0` |
| | • `danglingCaseCount <= 1` |
| | • `overRefusalRate <= 0.05` |
| | • `underRefusalCount <= 1` (count; rate 0.1 trend-only) |
| | Regression (`cao.eval.ts:1109-1162`): higher-is-better metrics `now >= was - 0.05`; lower-is-better `now <= was + 0.05`. **under-refusal-rate regression intentionally omitted** (`:1136-1139`). |
| **Implementation location** | `cao.eval.ts` (`answerQualityChecks`, `answerLevelChecks`, `answerRegressionChecks`); `answer-floors.ts`; `judge.ts`; generation via `generateAnswerWithRepair` (`cao/generate-answer.ts`); model coupling `EVAL_LLM_MODEL = env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL` (`cao.eval.ts:114`). |
| **Dependencies** | `SCALEWAY_API_KEY` (embeddings for context assembly path), `MISTRAL_API_KEY`; judge model `JUDGE_MODEL = "mistral-large-2512"` (`judge.ts:30`); generator default `DEFAULT_LLM_MODEL = "mistral-large-2512"` (`packages/ai/src/models.ts:125`); golden base set; `baseline.json` for regression; `EVAL_JUDGE_SAMPLES`, `EVAL_GENERATION_SAMPLES`. |
| **Blocking behavior** | Same as Gate B under `EVAL_REQUIRE_ALL`. Baseline write refuses red runs (`cao.eval.ts:1238-1247` + `answerFloorFailures`). |
| **Status** | `implemented`. |

**Note (feit):** Latest committed run artefact `packages/agents/eval-report.json` records `"generator": "mistral-large-2512"` and `"judge": "mistral-large-2512"` (`:12-14`). Header comment in `judge.ts:17-18` still describes generator as Small / judge as Large — stale relative to current pins.

---

### Gate D — Corpus isolation (split: contract + integration)

Gate D is **two mechanisms** historically; both still exist under new ids.

#### Gate D-contract (schema / seam)

| Field | Content |
|---|---|
| **Identifier & name** | Historical: **Gate D-contract**. Living: part of **`G1-contract`** (`GATE-ARCHITECTURE.md:69`, `:403`). |
| **Purpose** | Retrieval tool input must require `fund`; unscoped query parse-fails. **feit** (`cao.eval.ts:1270-1289`). |
| **Role** | CI / offline contract test. |
| **Trigger** | Every eval (no keys). |
| **Pass/fail criteria** | `retrievalInputSchema.safeParse({ query })` → `!success`; scoped `{ query, fund: "demo" }` → `success` (`cao.eval.ts:1278-1288`). |
| **Implementation location** | `cao.eval.ts` `corpusIsolationContractChecks`; schema `packages/agents/src/cao/tools.ts` `retrievalInputSchema`. |
| **Dependencies** | None external. |
| **Blocking behavior** | As Gate A / G1. |
| **Status** | `implemented`. |

#### Gate D-integration (live leakage probe)

| Field | Content |
|---|---|
| **Identifier & name** | Historical: **Gate D-integration** / **Gate D**. Living id: **`G3-isolation`**. Maps to **E11** family only for DB scheduling; isolation itself is G3. |
| **Purpose** | Live 0 cross-fund leakage: for every fund in DB, a broad probe returns only that fund’s chunks. App-layer isolation (not Postgres RLS). **feit** (`cao.eval.ts:1292-1316`; `GATE-ARCHITECTURE.md:125`). |
| **Role** | Nightly CI enforcement when DB required. |
| **Trigger** | Only runs where CI brings up the throwaway gate database: nightly `schedule`, or a dispatch with `run_db_gates` (`ci.yml:33`, `138-139`). PRs: no DB → skip (or fail if `EVAL_REQUIRE_DB`). |
| **Pass/fail criteria** | `listFunds().length > 0`; for each fund, `retrieveContext({ query: "vakantie loon …", fund, topK: 20, minScore: 0 })` yields `leaked.length === 0` where leak = `chunk.source.fund !== fund` (`cao.eval.ts:1298-1310`). |
| **Implementation location** | `cao.eval.ts` `corpusIsolationLiveChecks`; `GATE_RUNS["G3-isolation"]`; RAG `retrieveContext` / `listFunds`. |
| **Dependencies** | `DATABASE_URL`, `SCALEWAY_API_KEY`; funds ingested into the gate database from the committed corpora (`ci.yml:108-116`). |
| **Blocking behavior** | Fails the nightly `verify` job when required and red. **Does not** (by documented decision B4) act as a deploy gate — visibility until go-live (`GATE-ARCHITECTURE.md:366`). No deploy-pipeline wiring found in `.github/workflows` beyond this CI job. **feit** (workflow file has only `verify` + `write-baseline`). |
| **Status** | `implemented` (app-seam probe). RLS: **not-found** (0 policies; documented). |

---

### Adjacent historical gates (found in inventory)

#### Gate B-integration → `G3-pipeline` (E11)

| Field | Content |
|---|---|
| **Purpose** | Real pipeline recall/MRR + minScore refuse-without-LLM on out-of-corpus probes. **feit** (`cao.eval.ts:719-790`). |
| **Thresholds** | `RETRIEVAL_INTEGRATION_THRESHOLDS`: hitAt1 `0.7`, recallAt3/5 `0.8`, MRR `0.75` (`:150-155`). minScore guard: `emptyProbes >= MIN_SCORE_GUARD_REQUIRED` where required = **2** of 3 probes (`:165-170`); production `minScore` default **0.48** (`types.ts:41`). |
| **Trigger** | Nightly + DB + Scaleway. |
| **Status** | `implemented`. |

#### Gate F → `G3-fund` (E12)

| Field | Content |
|---|---|
| **Purpose** | Per-fund golden set on real corpus: recall/MRR + refusal-guard empty probes. **feit** (`cao.eval.ts:793-870`). |
| **Thresholds** | Same integration recall floors; refusal empty required = `max(1, refusals.length - 1)` if any refusals (`:833-834`). |
| **Trigger** | Nightly; needs DB + Scaleway + Mistral (condensation). `perFundSet: true` → one report per discovered set (`gates.ts:77-81`). |
| **Status** | `implemented`. Latest local artefact: `G3-fund [demo]` **failed**, `etd` **passed**, overall `"passed": false` (`eval-report.json:6`, `:349-381`) — **feit** for that artefact only; not a claim about `main`. |

#### Gate E

| Field | Content |
|---|---|
| **Status** | `not-found` as an implemented gate. Doc states explicitly it never existed (`GATE-ARCHITECTURE.md:405`). |

---

## Eval labels E0–E13

> Per `GATE-ARCHITECTURE.md` §4 / Bijlage A, most E-labels are **invariants** (infrastructure), not
> layer gates. Status below reflects whether the claimed behavior exists in code/CI.

### E0 / E8 — Skip ≠ pass (enforcement)

| Field | Content |
|---|---|
| **Identifier & name** | **E0** and **E8** treated as one invariant “Skip ≠ pass” (`GATE-ARCHITECTURE.md:406`). |
| **Purpose** | A gate that cannot run must not report as passed on protected paths. |
| **Role** | CI config + eval runner logic + turbo env passthrough. |
| **Trigger** | Eval process whenever prerequisites missing; CI sets flags per event. |
| **Pass/fail criteria** | `REQUIRE_ALL` / `REQUIRE_DB` from env (`cao.eval.ts:120`, `:135`). Missing prereqs + required → `status: "failed"` with `REQUIRED-BUT-UNAVAILABLE` (`:1355-1366`); else `status: "skipped"` with check `ok: true` but gate status is **skipped**, never passed (`:1368-1376`). CI: `EVAL_REQUIRE_ALL` expression (`ci.yml:85`); `EVAL_REQUIRE_DB` on schedule only (`ci.yml:81`). Turbo must pass env through (`turbo.json:13-34`) — documented failure mode when stripped (`GATE-ARCHITECTURE.md:260-266`). |
| **Implementation location** | `cao.eval.ts` (`pushUnavailable`, `requiredWhenMissing`); `.github/workflows/ci.yml`; `turbo.json`; `packages/shared/src/env.ts:70-77`. |
| **Dependencies** | GitHub secrets for keys/DB; turbo passThroughEnv list. |
| **Blocking behavior** | On protected paths with missing secrets: eval exits 1 → `verify` red. Branch-protection coupling: see Open questions. |
| **Status** | `implemented` (code + CI expressions). Live branch-protection strength: **partial / unverified today** (see Summary). |

---

### E1 — Eval scores the production model

| Field | Content |
|---|---|
| **Purpose** | Eval generator = production `DEFAULT_LLM_MODEL`, override only via `EVAL_GENERATION_MODEL`. |
| **Role** | Invariant; unit-tested on every PR (`test:unit`). |
| **Trigger** | Offline unit test always; eval run records `models.generator`. |
| **Pass/fail criteria** | Source must assign `env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL` (`eval-model-coupling.test.ts:30-35`; `cao.eval.ts:114`). Generation uses `GENERATION_CONFIG` temperature/maxTokens shared with agent. |
| **Implementation location** | `cao.eval.ts:114`; `eval-model-coupling.test.ts`; `packages/ai/src/models.ts:125`; `packages/shared/src/config/generation.ts`. |
| **Dependencies** | None for the unit test. |
| **Blocking behavior** | Unit test failure fails `verify` “Unit tests” step (`ci.yml:49-50`). |
| **Status** | `implemented`. |

---

### E2 — Judge robustness

| Field | Content |
|---|---|
| **Purpose** | Exactly one parse-retry; fail-loud; no default scores; median over `EVAL_JUDGE_SAMPLES`. |
| **Role** | Invariant inside Gate C / G2-answer. |
| **Trigger** | During answer-quality scoring. |
| **Pass/fail criteria** | `runJudgeWithParseRetry`: first parse fail → one retry with feedback; second fail throws (`judge.ts:90-107`). `parseJudgeOutput` never defaults (`:47-61`). Samples: `env.EVAL_JUDGE_SAMPLES ?? 1`, median (`judge.ts:417` area / doc). Related: judge model pinned `mistral-large-2512` (`judge.ts:30`). |
| **Implementation location** | `packages/agents/src/evals/judge.ts`; retry count in artefact (`cao.eval.ts:1492`). |
| **Dependencies** | `MISTRAL_API_KEY`; `EVAL_JUDGE_SAMPLES`. |
| **Blocking behavior** | Uncaught judge failure fails the eval process. |
| **Status** | `implemented`. **Caveat (feit):** generator and judge currently share the same model id (`mistral-large-2512`), so the documented “judge ≠ generator” separation is model-id-identical in the latest artefact — residual self-preference bias disclosure in `judge.ts:17-22` assumed Small≠Large and is stale. |

---

### E3 — Golden-set schema (+ refusal metrics design)

| Field | Content |
|---|---|
| **Purpose** | Refusal cases require ≥1 distractor; schema enforced at load; under/over-refusal measurable. |
| **Role** | Invariant + unit tests + loader. |
| **Trigger** | Module load of golden set; `golden-set.test.ts` on unit tests. |
| **Pass/fail criteria** | Zod refine: refusal without distractors rejected (`golden-set.ts:70-74`). Unit tests assert every refusal has resolvable distractors (`golden-set.test.ts:23-59`). |
| **Implementation location** | `golden-set.ts`; `golden-set.test.ts`; Gate C refusal scoring in `judge.ts` / `answerLevelChecks`. |
| **Dependencies** | Fixture files. |
| **Blocking behavior** | Invalid fixtures throw at import; unit tests fail CI. |
| **Status** | `implemented`. Doc residual “citationCorrectness=1 on refusals” (`GATE-ARCHITECTURE.md:409`) is **partially outdated**: aggregation now excludes refusals from citationCorrectness mean (`judge.ts:550-556`); per-case scorer still runs on refusals (`:466`). |

---

### E4 — Shared assemble

| Field | Content |
|---|---|
| **Purpose** | Eval context built with production `assemble()`. |
| **Role** | Invariant + snapshot unit test. |
| **Trigger** | Unit tests; eval uses `assembleEvalContext`. |
| **Pass/fail criteria** | Snapshot equality (`assemble.test.ts:34-39`); `viaEval === viaProduction` (`:47-51`). Accepted residual: fixture `sourceRef` format vs ingest `buildSourceRef` (`GATE-ARCHITECTURE.md:312-331`) — **documented**, not unified. |
| **Implementation location** | `judge.ts` `assembleEvalContext`; `assemble.test.ts`; production `packages/rag` `assemble`. |
| **Dependencies** | None for unit test. |
| **Blocking behavior** | Unit test in `verify`. |
| **Status** | `implemented` (with accepted `sourceRef` format residue — not a missing gate). |

---

### E5 — Rerank checks (maps into G2-retrieval)

| Field | Content |
|---|---|
| **Purpose** | Rerank is a real gate, not report-only: no silent failures; MRR delta ≥ 0. |
| **Role** | Part of CI Gate B / `G2-retrieval`. |
| **Trigger** | With Scaleway during G2-retrieval. |
| **Pass/fail criteria** | `failedCount === 0`; `rerankMrrDelta >= 0` (`cao.eval.ts:630-641`). |
| **Implementation location** | `cao.eval.ts` inside `retrievalAndRerankChecks`. |
| **Dependencies** | Same as Gate B. |
| **Blocking behavior** | Same as Gate B. |
| **Status** | `implemented` (not a standalone gate id). |

---

### E6 — K-alignment

| Field | Content |
|---|---|
| **Purpose** | Gate measures what the model sees: `candidateK` 15 → `topK` 5. |
| **Role** | Config invariant (documented + pinned constants). |
| **Trigger** | Implicit in retrieval/rerank config used by eval and production. |
| **Pass/fail criteria** | `RERANK_CONFIG.candidateK === 15`, `topK === 5` (`packages/shared/src/config/rerank.ts:33-37`); `caoQuestionSchema` default `topK: 5` (`types.ts:26`); eval `PRIMARY_K = 5` (`cao.eval.ts:117`). No dedicated “E6” test name found beyond alignment by shared config. |
| **Implementation location** | `rerank.ts` config; `types.ts`; `cao.eval.ts` comments `:173-175`. |
| **Dependencies** | Optional env overrides `RERANK_CANDIDATE_K` / `RERANK_TOP_K` (passed through turbo). |
| **Blocking behavior** | Misaligned env could change behavior without a named E6 assertion — **schatting** that only dim/recall thresholds would catch fallout. |
| **Status** | `implemented` as shared config pin; **no dedicated E6-named assertion** found. |

---

### E7 — Answer regression + baseline integrity

| Field | Content |
|---|---|
| **Purpose** | Relative regression vs `baseline.json`; refuse to write a baseline that misses absolute floors. |
| **Role** | Part of G2-answer + write-baseline path + unit tests. |
| **Trigger** | Every G2-answer run (relative checks when baseline matches corpus version); write on `EVAL_WRITE_BASELINE=1` / `workflow_dispatch` job. |
| **Pass/fail criteria** | Relative: ± `REL_TOLERANCE` 0.05 (`baseline.ts:56`; `cao.eval.ts:1109-1162`). Write-guard: `answerFloorFailures(aggregate)` empty or answer section not written (`cao.eval.ts:1242-1247`; `answer-floors.ts:74-90`). Unit: `answer-floors.test.ts` (referenced in docs; present in package). |
| **Implementation location** | `baseline.ts`; `answer-floors.ts`; `cao.eval.ts`; CI `write-baseline` job (`ci.yml:109-149`). |
| **Dependencies** | `fixtures/baseline.json`; keys for a scoring run to write. |
| **Blocking behavior** | Regression fail blocks eval. Write-guard blocks recording, does not by itself fail the run (warns) — **feit** (`cao.eval.ts:1244-1247` uses `console.warn`, continues). Absolute floors still fail the gate via `answerLevelChecks`. |
| **Status** | `implemented`. |

---

### E9 — Run artefact

| Field | Content |
|---|---|
| **Purpose** | Machine-readable `eval-report.json` every run (incl. failure); optional Langfuse dataset-run push. |
| **Role** | Invariant / observability. |
| **Trigger** | End of every eval (`finally` → `writeRunArtefact`); CI uploads artefact `if: always()` (`ci.yml:97-103`). |
| **Pass/fail criteria** | File written with schemaVersion 6 (`report-writer.ts` / `EVAL_REPORT_SCHEMA_VERSION`); includes gates status three-valued, models, aggregates. |
| **Implementation location** | `report-writer.ts`; `cao.eval.ts:1468-1496`; `ci.yml` upload step. |
| **Dependencies** | Filesystem; optional `GITHUB_SHA`. |
| **Blocking behavior** | Artefact write does not block; missing upload warns (`if-no-files-found: warn`). |
| **Status** | `partial` — JSON artefact **implemented**; Langfuse dataset-run push **not-found** in code (`rg` over `*.ts` for dataset-run / createDataset: 0 hits). Doc marks push as backlog B6 (`GATE-ARCHITECTURE.md:368`). |

---

### E10 — Fixture hygiene (hash guard)

| Field | Content |
|---|---|
| **Purpose** | Fixture edit without `GOLDEN_CORPUS_VERSION` bump fails when baseline hash mismatches. |
| **Role** | Invariant; executed inside G1-contract run (still listed under Gate A historically). |
| **Trigger** | Every G1 run when baseline has hash for current corpus version. |
| **Pass/fail criteria** | `baseline.fixtureHash === GOLDEN_FIXTURE_HASH` (`cao.eval.ts:301-310`). Empty checks if no comparable baseline (`:298-299`). |
| **Implementation location** | `cao.eval.ts` `fixtureHashChecks`; hash in `golden-set.ts`; baseline field `baseline.ts:46`. |
| **Dependencies** | `baseline.json`, golden fixture files. |
| **Blocking behavior** | Fail → G1 fail → eval exit 1. |
| **Status** | `implemented`. |

---

### E11 — G3-pipeline (≡ Gate B-integration)

| Field | Content |
|---|---|
| **Purpose** | Nightly real-pipeline retrieval gate. |
| **Role** | CI nightly enforcement under `EVAL_REQUIRE_DB`. |
| **Trigger** | `schedule` cron `0 3 * * *` (`ci.yml:11-12`); gate database + corpus ingest nightly (`ci.yml:77-116`). |
| **Pass/fail criteria** | See Gate B-integration thresholds above. |
| **Implementation location** | `cao.eval.ts` `retrievalIntegrationChecks`; `GATE_RUNS["G3-pipeline"]`; `scripts/ingest` fixtures ingest. |
| **Dependencies** | `DATABASE_URL`, `SCALEWAY_API_KEY`; golden fixtures ingested into the gate database (`ci.yml:108-116`). |
| **Blocking behavior** | Blocks nightly `verify` when required+red. Not a deploy gate (B4). |
| **Status** | `implemented`. |

---

### E12 — Golden-set fund layer + G3-fund

| Field | Content |
|---|---|
| **Purpose** | Two-layer golden set; fund sets require `FUND_SET_META`; nightly fund correctness. |
| **Role** | Loader invariant + nightly gate `G3-fund`. |
| **Trigger** | Load-time for meta; nightly for scoring. |
| **Pass/fail criteria** | Missing `FUND_SET_META` throws (`golden-set.ts:289-292`). Fund gate thresholds: see Gate F. Unit coverage `golden-set.test.ts` “fund layer (E12)”. |
| **Implementation location** | `golden-set.ts` fund layer; fixtures `golden-set.etd.jsonl`, `golden-set.demo.jsonl`; `cao.eval.ts` `fundLayerChecks` / `fundLayerGroups`. |
| **Dependencies** | DB + keys for live scoring; meta table in code. |
| **Blocking behavior** | As G3-fund / E11 scheduling. |
| **Status** | `implemented`. |

---

### E13 — Runtime hard-fact guard (G4)

| Field | Content |
|---|---|
| **Purpose** | An answer asserting an ungrounded hard fact (money / % / quantity+unit) must not reach the user; also citation-coupling for substantive answers. |
| **Role** | **Runtime guard** (not an eval-registry gate). **feit** (`gates.ts:11-12`; `GATE-ARCHITECTURE.md:76`). |
| **Trigger** | Every production `answer` / `answerStream` path after generation, via `verifyAndBuild`. |
| **Pass/fail criteria** | `hasUngroundedHardFact(answer, grounding, userSupplied)` → replace with `NOT_FOUND_MESSAGE`, `found: false` (`agent.ts:167-176`). Shared regexes in `hard-facts.ts:19-29`. Eval mirror: `scoreHardHallucination` / Gate C. Buffer-to-verify: stream emits only after verify (`GATE-ARCHITECTURE.md:136`; `settledAnswerEvents` in `agent.ts`). |
| **Implementation location** | `packages/agents/src/cao/agent.ts` `verifyAndBuild`; `hard-facts.ts`; tests `hard-facts.test.ts`, `agent.test.ts`; eval uses same helpers. |
| **Dependencies** | None external (in-process). |
| **Blocking behavior** | **Yes — per answer.** Replaces served text. Only gate that blocks an individual user-facing response. **feit**. |
| **Status** | `implemented`. |

---

## G4 / living registry (cross-walk)

For completeness, living registry ids (`GATE_SPECS`) and their old labels:

| Living id | Layer | Old label(s) | In eval harness? |
|---|---|---|---|
| `G1-contract` | G1 | Gate A + Gate D-contract (+ E10 hash in practice) | yes |
| `G2-retrieval` | G2 | Gate B (+ E5) | yes |
| `G2-multi-turn` | G2 | Gate B2 | yes (separate id) |
| `G2-answer` | G2 | Gate C (+ E7 regression) | yes |
| `G3-pipeline` | G3 | Gate B-integration / E11 | yes |
| `G3-fund` | G3 | Gate F / E12 | yes |
| `G3-isolation` | G3 | Gate D-integration | yes |
| `G4` (runtime) | G4 | E13 | **no** (production only) |

Consistency between registry and doc is unit-tested (`gate-registry.test.ts`).

---

## Summary 1 — Coverage matrix

| Gate / label | Status | Blocks merge today? | Blocks deploy? | Blocks user answer? |
|---|---|---|---|---|
| Gate A → G1 (prompt/clarify) | implemented | **schatting** yes if `verify` required (see BP) | no evidence | no |
| Gate B → G2-retrieval | implemented | same (when keys / REQUIRE_ALL) | no | no |
| Gate B2 → G2-multi-turn | implemented | same | no | no |
| Gate C → G2-answer | implemented | same | no | no |
| Gate D-contract → G1 | implemented | same | no | no |
| Gate D-integration → G3-isolation | implemented | nightly verify only | no (B4) | no |
| Gate B-integration → G3-pipeline | implemented | nightly verify only | no (B4) | no |
| Gate F → G3-fund | implemented | nightly verify only | no (B4) | no |
| Gate E | not-found | n/a | n/a | n/a |
| E0/E8 Skip≠pass | implemented | enables blocking of skips | n/a | n/a |
| E1 model coupling | implemented | via unit tests | no | no |
| E2 judge robustness | implemented | via Gate C | no | no |
| E3 golden schema | implemented | via unit/load | no | no |
| E4 shared assemble | implemented | via unit tests | no | no |
| E5 rerank gate | implemented | via G2-retrieval | no | no |
| E6 K-alignment | implemented (config) | no dedicated assert | no | no |
| E7 baseline/regression | implemented | via G2-answer | no | no |
| E9 run artefact | partial | no (upload warn-only) | no | no |
| E10 fixture hash | implemented | via G1 | no | no |
| E11 G3-pipeline | implemented | nightly | no | no |
| E12 fund layer | implemented | nightly (G3-fund) | no | no |
| E13 / G4 runtime | implemented | n/a (runtime) | n/a | **yes** |

“Blocks merge today?” cannot be asserted stronger than **schatting** without a current successful `gh api …/protection` proof (Forbidden on 2026-07-30; prior doc claims applied partial protection).

---

## Summary 2 — Gaps & inconsistencies

1. **Living vs historical names:** Code registry and reports use G-ids; `cao.eval.ts` comments and many docs still say Gate A/B/C/F. Mapping is documented; dual vocabulary is a consistency tax. **feit**.

2. **Gate B2 “not a separate gate” vs registry:** `GATE-ARCHITECTURE.md:71,398` says B2 is a case-category of G2-retrieval / no longer a separate gate; `gates.ts` still has `G2-multi-turn` as its own `GATE_SPECS` entry and `eval-report.json` lists it separately. **feit**.

3. **Fixture-hash placement:** Docs map fixture-hash out of Gate A into invariant E10 (`GATE-ARCHITECTURE.md:396`); code still runs `fixtureHashChecks()` inside `G1-contract` (`cao.eval.ts:1425-1429`). Behavior exists; taxonomy diverges. **feit**.

4. **Judge ≠ generator claim vs pins:** `judge.ts` header claims Small generator / Large judge; `DEFAULT_LLM_MODEL` and `JUDGE_MODEL` are both `mistral-large-2512`; artefact confirms identical ids. **feit**.

5. **Branch protection / merge queue:** `ci.yml:7-8` assumes merge queue + required `verify`. `docs/audit/branch-protection-check.md` (2026-07-20): `verify` required, **no** merge-queue, **no** required PR reviews; no committed `branch-protection-proof.json`. Live API Forbidden on audit day. **feit** for docs/API; current GitHub settings **unverified**.

6. **Nightly G3 fails do not block deploy:** No deploy workflow found; B4 documents visibility-only until go-live. **feit**.

7. **E9 Langfuse dataset push:** Documented backlog; no implementation found. **feit**.

8. **G3-freshness:** Reserved in docs (`GATE-ARCHITECTURE.md:124`); no implementation found. Outside E0–E13 letter set but related gap.

9. **Postgres RLS:** Documented as not implemented; isolation is app-seam + G3-isolation only. **feit**.

10. **Threshold docs vs code:** `GATE-ARCHITECTURE.md` §3 drempeltabel matches `answer-floors.ts` / `RETRIEVAL_*` constants for the values checked in this audit (incl. relevance 0.84, minScore 0.48, count gates). **feit** for agreement on those values. Older audits (`docs/STATUS.md`, `eval-hardening-audit.md`) contain stale red/green claims — STATUS itself flags some as outdated. **feit**.

11. **Write-baseline guard does not fail the process:** It warns and skips writing (`cao.eval.ts:1244-1247`); absolute floor failures still fail via checks. **feit**.

12. **Latest local `eval-report.json`:** `"passed": false` due to `G3-fund [demo]` failure (2026-07-28), with `requireAll: false`. Snapshot of a local/nightly-like run, not proof of CI `main`. **feit**.

---

## Summary 3 — Not found

Explicit absences:

| Label / claim | Finding |
|---|---|
| **Gate E** | Never existed (`GATE-ARCHITECTURE.md:405`). No code id. |
| **E-labels as runtime identifiers** | No `E0`…`E13` string identifiers in `GATE_SPECS` or report gate ids; only comments/docs/mapping. |
| **Langfuse dataset-run push (E9 stap 2)** | No implementation in TS sources. |
| **G3-freshness** | Documented reserved; not built. |
| **Postgres RLS policies** | 0 implementations (per canonical doc + prior audits). |
| **Deploy gate on G3 failure** | Not present in workflows; B4 open/visibility. |
| **`docs/audit/branch-protection-proof.json`** | Missing. |
| **`PLAN-eval-hardening.md` (E0–E12 plan of record)** | Absent (noted in `eval-hardening-audit.md`); living plan/docs are `GATE-ARCHITECTURE.md` + archived `PLAN-eval-gates.md`. |
| **Dedicated E6-named unit test** | Not found; alignment is by shared config constants only. |
| **Merge queue enforcement** | Referenced in CI comments; branch-protection checklist says not active as of 2026-07-20; not re-verified today. |

No gate/label in the requested set A–D or E0–E13 was entirely without *either* an implementation *or* an explicit documentation statement — except **Gate E**, which is explicitly documented as never existing.

---

## Summary 4 — Open questions (human decision)

1. **Is `verify` still a required status check on `main` right now?** Repo doc says yes (2026-07-20); live `gh api` returned Forbidden; no proof JSON. Without this, CI gate blocking of merges is unverified.

2. **Should `G2-multi-turn` remain a separate registry gate?** Docs and plan say fold into G2-retrieval as case-category; code still separates it. Which is authoritative?

3. **Is identical generator/judge model (`mistral-large-2512`) an accepted residual bias, or should judge diverge again?** Code comments and procurement framing still assume separation.

4. **Does a red nightly G3 (e.g. `G3-fund [demo]`) require any operational response today**, given B4 “visibility until go-live”?

5. **E9 Langfuse push:** remain backlog until go-live (B6), or promote?

6. **Fixture-hash:** keep executing under G1 for convenience, or treat strictly as non-gate invariant in reporting?

---

## Evidence index (primary files)

| Path | Role |
|---|---|
| `packages/agents/src/evals/gates.ts` | Living gate registry |
| `packages/agents/src/evals/cao.eval.ts` | Gate runners, thresholds (retrieval), skip≠pass |
| `packages/agents/src/evals/answer-floors.ts` | G2-answer absolute floors + write-guard |
| `packages/agents/src/evals/baseline.ts` | `REL_TOLERANCE = 0.05` |
| `packages/agents/src/evals/judge.ts` | Judge model, parse-retry, aggregation |
| `packages/agents/src/evals/golden-set.ts` | Layers, distractors, FUND_SET_META, hash |
| `packages/agents/src/cao/agent.ts` | E13 / G4 `verifyAndBuild` |
| `packages/agents/src/cao/hard-facts.ts` | Shared hard-fact regex |
| `packages/agents/src/types.ts` | `minScore` default 0.48, `topK` 5 |
| `packages/shared/src/config/rerank.ts` | candidateK 15 / topK 5 |
| `packages/ai/src/models.ts` | `DEFAULT_LLM_MODEL` |
| `.github/workflows/ci.yml` | Triggers, REQUIRE_ALL/DB, samples, artefact upload |
| `turbo.json` | `passThroughEnv`, `cache: false` on `test` |
| `docs/eval/GATE-ARCHITECTURE.md` | Canonical mapping & thresholds |
| `docs/audit/branch-protection-check.md` | Last written BP state |
| `packages/agents/eval-report.json` | Latest local run artefact (schema v6) |

---

*End of diagnostic report. No changes proposed.*
