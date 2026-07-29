# Eval Gate System — Factual Audit Report

> Scope: the CAO-agent quality gate ("eval gates A/B/C") as actually implemented in this
> repository, described so an external reviewer can audit it without codebase access.
> Method: read of source, CI YAML, fixtures, and the committed baseline. Behavior described is
> what the **code does**, not what comments/plans intend. Every code path that could not be fully
> traced is marked `[UNVERIFIED]`. All numbers/model names/env vars are quoted verbatim.

The whole gate suite is a **single Node script**, not a test-framework run:
`packages/agents/src/evals/cao.eval.ts`, executed via
`tsx --env-file-if-exists=../../.env src/evals/cao.eval.ts` (`packages/agents/package.json:15`).
It prints `PASS`/`FAIL` lines and sets `process.exitCode = 1` on any failure.

---

## 1. System overview

### 1.1 Gates present (more than A/B/C)

The script actually runs **five gate blocks** (A, B, B2, C, D), despite the "three gates" framing
in the file header (`packages/agents/src/evals/cao.eval.ts:4-22`). Orchestration is in `main()`
(`cao.eval.ts:726-780`).

| Gate | Name in output | Purpose (as coded) | Implementation |
|------|----------------|--------------------|----------------|
| A | `Gate A — prompt & clarify CONTRACT (change-detector, not a behavioral gate)` | Regex assertions over the system prompt string + deterministic clarify-router checks. Offline, always runs. | `promptContractChecks()` `cao.eval.ts:130-163`; `clarifyContractChecks()` `cao.eval.ts:169-186` |
| B | `Gate B — retrieval recall + rerank [fund-specific layer]` | Embeds golden passages/questions in-memory, cosine recall@k + MRR before/after reranker. Needs `SCALEWAY_API_KEY`. | `retrievalAndRerankChecks()` `cao.eval.ts:273-378` |
| B2 | `Gate B2 — multi-turn condensation retrieval` | Condense elliptical follow-ups (LLM) then check the expected article is retrieved. Needs `SCALEWAY_API_KEY` + `MISTRAL_API_KEY`. | `condensationChecks()` `cao.eval.ts:407-466` |
| C | `Gate C — answer-level quality` | Generate answers on golden context, score hallucination/faithfulness/citation/refusal. Needs `SCALEWAY_API_KEY` + `MISTRAL_API_KEY`. | `answerQualityChecks()` `cao.eval.ts:602-653` |
| D | `Gate D — corpus isolation (contract + integration)` | Assert retrieval seam rejects unscoped queries; live per-fund cross-leak test. Integration needs `DATABASE_URL` + `SCALEWAY_API_KEY`. | `corpusIsolationContractChecks()` `cao.eval.ts:662-675`; `corpusIsolationLiveChecks()` `cao.eval.ts:677-702` |

There is **no Gate C latency/cost measurement** — explicitly deferred (`cao.eval.ts:27-28`).

### 1.2 Aggregation into an exit code

Every block returns `Check[]` (`{ name, ok, detail? }`, `cao.eval.ts:104-108`). `report()`
(`cao.eval.ts:704-711`) prints each and returns `checks.every(c => c.ok)`. `main()` ANDs all
block results into `allPassed`. Final (`cao.eval.ts:774-780`):

```ts
if (!allPassed) {
  console.error("\nEval FAILED — an accuracy gate regressed or a required gate could not run. See above.");
  process.exitCode = 1;
  return;
}
console.log("\nEval PASSED.");
```

The top-level `main().catch(...)` also sets `process.exitCode = 1` on a thrown error
(`cao.eval.ts:782-785`). So an **uncaught exception fails the run** (it does not exit 0). Note the
process uses `process.exitCode` (not `process.exit()`); it relies on the event loop draining. `[UNVERIFIED]` whether any pending timer/keep-alive could delay exit, but the exit *code* is correct.

### 1.3 CI wiring

Single workflow: `.github/workflows/ci.yml`. One job, `verify`, `runs-on: ubuntu-latest`.

Triggers (`ci.yml:3-12`):

```yaml
on:
  push:
    branches: [main]
  pull_request:
  merge_group:
  schedule:
    - cron: "0 3 * * *"
```

Steps in order (`ci.yml:17-52`): checkout → corepack enable → setup-node `22.13.0` (cache pnpm) →
`pnpm install --frozen-lockfile` → `pnpm turbo run typecheck` → `pnpm turbo run lint` →
`pnpm depcruise` → **Eval (accuracy gate)** = `pnpm turbo run test`.

The eval step env (`ci.yml:46-52`):

```yaml
- name: Eval (accuracy gate)
  run: pnpm turbo run test
  env:
    SCALEWAY_API_KEY: ${{ secrets.SCALEWAY_API_KEY }}
    MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
    EVAL_REQUIRE_ALL: ${{ (github.event_name == 'merge_group' || github.event_name == 'push' || github.event_name == 'schedule') && '1' || '0' }}
    EVAL_JUDGE_SAMPLES: ${{ github.event_name == 'schedule' && '3' || '1' }}
```

`pnpm turbo run test` runs only the one package that defines a `test` script
(`@wunderstack/agents`); `turbo.json:10-12` declares the `test` task with
`env: ["SCALEWAY_API_KEY","MISTRAL_API_KEY"]`.

**Conditions under which a gate result blocks a merge:**
- There is **no `continue-on-error`** anywhere in the workflow, and no `if:` conditions on steps.
  A non-zero exit from the eval step fails the `verify` job.
- Whether a failed `verify` job actually **blocks merge** depends on GitHub branch-protection /
  merge-queue settings that are **not in the repo**. `PLAN-eval-gates.md:7-10,192-193` states
  explicitly this is still "Nog te doen in repo-settings: `verify` als required check + merge queue
  aanzetten." `[UNVERIFIED]` — cannot confirm from the codebase that `verify` is a required check
  or that the merge queue is enabled. If it is not, nothing blocks a merge regardless of gate result.
- `EVAL_REQUIRE_ALL` is `'1'` on `merge_group`, `push` (to main), and `schedule`; `'0'` on
  `pull_request`. This flag only changes skip→fail behavior (see §2 per gate), not whether the job is required.

---

## 2. Per gate: exact mechanics

Shared thresholds (verbatim):

```ts
// cao.eval.ts:73-78
const RETRIEVAL_THRESHOLDS = { hitAt1: 0.85, recallAt3: 0.9, recallAt5: 0.9, mrr: 0.88 };
// cao.eval.ts:87-102
const ANSWER_THRESHOLDS = {
  hardHallucination: 0.98, softFaithfulness: 0.8, relevance: 0.85,
  citationCorrectness: 0.75, completeness: 0.7, refusalCalibration: 0.9,
  citationVerification: 0.98, maxOrphanRate: 0, maxDanglingMarkerRate: 0,
  maxOverRefusalRate: 0.05, maxUnderRefusalRate: 0.1,
};
// cao.eval.ts:66-68
const EVAL_LLM_MODEL = "mistral-small-2603";
const K_VALUES = [1, 3, 5]; const PRIMARY_K = 5;
// cao.eval.ts:71
const REQUIRE_ALL = env.EVAL_REQUIRE_ALL === "1" || env.EVAL_REQUIRE_ALL === "true";
```

### Gate A — prompt & clarify contract (offline, deterministic, always runs)

**Input.** No dataset for the prompt half. It reads the string constants `CAO_SYSTEM_INSTRUCTIONS`
and `NOT_FOUND_MESSAGE` and the assembled user turn `buildAnswerPrompt("[1] voorbeeldcontext","Voorbeeldvraag?")` (all from `packages/agents/src/cao/prompt.ts`). The clarify half reads the golden
cases (`goldenCases`, loaded from `golden-set.jsonl`, see §3).

**Execution.** Pure string/regex work, no network. `promptContractChecks()` runs 7 regex assertions
(`cao.eval.ts:133-162`), e.g.:
- `/uitsluitend op basis van de aangeleverde context/i` (answers only from context)
- `/\[1\]/` AND `/bronnen/i` (cites `[n]`)
- `instructions.includes(NOT_FOUND_MESSAGE)` (refusal string present)
- `/kern beantwoordt/i` AND `/toelichting/i` (direct-answer-first format)
- `/artikel/i` AND `/lid/i` (cite article + lid)
- `/geen (?:persoonlijk|individueel)/i` AND `/advies/i` (no individual/legal advice)

`clarifyContractChecks()` (`cao.eval.ts:169-186`) asserts `detectClarification()` returns non-null
for three hardcoded strings (`"Hoeveel verdien ik?"`, `"Wat is mijn salaris?"`,
`"Wat verdient een medewerker?"`) and returns null for every non-refusal golden question ("does not
hijack answerable golden questions").

**Scoring / pass-fail.** Each check is boolean `ok`. Gate A passes iff all booleans are true.
There are **no thresholds, no model, no tolerance** — it is a change-detector, as the header states.

**Failure/skip behavior.** Always runs; no skip path. A prompt edit that drops a matched phrase
fails Gate A. It does **not** verify the model obeys any instruction (that is Gate C).

### Gate B — retrieval recall + rerank

**Input.** `goldenPassages` (23 entries) and the subset of `goldenCases` with
`category !== "refusal"` and no history (`cao.eval.ts:276-278`). Data is loaded from JSONL fixtures
in-repo (see §3). It does **not** read the database or the production corpus.

**Execution.** `requireEmbeddingConfig()` / `requireRerankConfig()` are read
(`cao.eval.ts:274-275`). Passages and questions are embedded via `embed()`
(`packages/ai/src/embeddings.ts`) using `embeddingConfig.model` = `qwen3-embedding-8b`,
`version` `"1"` (Scaleway `POST /v1/embeddings`, `embeddings.ts:40,63-74`). Vectors are
L2-normalized in-process (`normalize()` `cao.eval.ts:110-117`) and scored by dot product
(`dot()` `cao.eval.ts:119-124`) — i.e. **cosine similarity computed in memory**, NOT via pgvector.

For each query: cosine-rank all passages, take top `rerankConfig.candidateK` (= 15) as
`beforeRankings`; then call `rerankDocuments()` (`packages/ai/src/rerank.ts`, Scaleway
`POST /v1/rerank`) with `topN = rerankConfig.topK` (= 3), `model` = `qwen3-embedding-8b`
(`cao.eval.ts:317-334`). On a rerank exception it falls back to `candidates.slice(0, topK)`
(catch at `cao.eval.ts:331-333`) — **the rerank failure is swallowed and the pre-rerank order is used**.

Note the pinned config (`packages/shared/src/config/rerank.ts:33-41`): `candidateK: 15`, `topK: 3`,
`enabled: true`, `skipAboveScore: 0.85`. Gate B calls `rerankDocuments` directly and **does not
apply** the `enabled`/`skipAboveScore`/single-candidate skip logic that production's
`packages/rag/src/rerank.ts` applies (divergence, see §2b).

**Scoring.** `scoreRecall()` (`cao.eval.ts:223-240`): a passage is relevant when its
article (and lid when both specify one) match the case — `passageMatchesCase()`
(`cao.eval.ts:209-221`), matched on `article`/`lid`, never chunk id. Computes recall@{1,3,5}
and MRR (mean reciprocal rank).

**Pass/fail (verbatim checks, `cao.eval.ts:242-261, 364-377`):**
- `retrieval: embedding dim matches pinned EMBEDDING_CONFIG.dim` (`passageResult.dim === 4096`).
- `hit@1 >= 85.0%`, `recall@3 >= 90.0%`, `recall@5 >= 90.0%`, `MRR >= 0.880` — computed on the
  **before-rerank** metrics (`recallChecks("retrieval (before rerank)", beforeMetrics, ...)`).
- `rerank: MRR does not regress (delta >= 0)` — `afterMetrics.mrr - beforeMetrics.mrr >= 0`.
- Plus regression-relative checks vs baseline (see §2 baseline note).

Aggregation is a **mean over queries** (recall = hits/queries; MRR = Σ(1/rank)/queries).
Absolute thresholds are applied to the before-rerank numbers; the after-rerank numbers only feed
the "MRR does not regress" delta check and console logging.

**Regression checks.** `retrievalRegressionChecks()` (`cao.eval.ts:381-405`) compares the
**before-rerank** current metrics against `baseline.retrieval` if present AND
`baseline.corpusVersion === GOLDEN_CORPUS_VERSION` (= `"1"`). Fail if `now < was - REL_TOLERANCE`
(`REL_TOLERANCE = 0.05`, `baseline.ts:53`). The committed baseline (`fixtures/baseline.json`) is:

```json
{ "corpusVersion": "1",
  "retrieval": { "hitAt1": 0.9777777777777777, "recallAt3": 1, "recallAt5": 1, "mrr": 0.9888888888888889 } }
```

So retrieval regression checks are live (e.g. hit@1 must stay ≥ 0.9277).

**Failure/skip behavior.** Runs only if `env.SCALEWAY_API_KEY` is set (`cao.eval.ts:737-743`).
If missing: `reportUnavailable("Gate B — retrieval recall", "SCALEWAY_API_KEY not set")`
(`cao.eval.ts:717-724`) → returns **false (fail)** when `REQUIRE_ALL`, else prints `SKIPPED` and
returns **true (pass)**. Network errors from `embed()` are **not** caught inside Gate B (only the
rerank call is wrapped) → they propagate to `main().catch` → exit 1.

### Gate B2 — multi-turn condensation retrieval

**Input.** Golden cases with `history.length > 0` (`cao.eval.ts:410`). There are **3** such cases
(all `q-vakantie-followup-*`, expected article `12`; see §3). If none existed it returns a single
failing check (`cao.eval.ts:411-413`).

**Execution.** Embeds all passages; for each follow-up: asserts `isElliptical()` is true
(`packages/agents/src/cao/condense.ts:30-46`), then `condenseQuery(history, question)` (LLM call,
`DEFAULT_LLM_MODEL` = `mistral-small-2603`, `temperature: 0`, `maxTokens: 64`, `condense.ts:48-85`),
embeds the condensed query, cosine-ranks, takes top `candidateK`, reranks to `topK`, and checks
the expected article appears in the reranked ids (`cao.eval.ts:423-463`).

**Pass/fail.** Booleans: `"...is detected as elliptical"` and `"...retrieves the expected article
after rewrite"`. No numeric threshold.

**Failure/skip.** Runs only if `SCALEWAY_API_KEY` AND `MISTRAL_API_KEY` set (`cao.eval.ts:745-753`);
otherwise `reportUnavailable(...)` (fail under `REQUIRE_ALL`, else pass/skip). The rerank call here
is **not** wrapped in try/catch (`cao.eval.ts:448-453`) → a rerank/LLM error propagates to exit 1.

### Gate C — answer-level quality

**Input.** All 58 golden cases (`for (const testCase of goldenCases)` `cao.eval.ts:605`).

**Execution (`answerQualityChecks()` `cao.eval.ts:602-653`).**
- For `category === "refusal"`: the answer is **hardcoded** to `NOT_FOUND_MESSAGE` with **no LLM
  call** (`cao.eval.ts:608-609`). (Consequence: refusal cases never test whether the model would
  actually refuse — see §5.)
- Otherwise: context is built from `passagesForCase(testCase)` (the case's `expectedPassageIds`,
  §3) via `buildContext()` (judge.ts, see below), the question is optionally condensed
  (`evalQuestion()` `cao.eval.ts:188-193`), then generated:

```ts
// cao.eval.ts:614-627
const generated = await retryWithBackoff(
  () => generateText({
    model: EVAL_LLM_MODEL,                       // "mistral-small-2603"
    messages: [
      { role: "system", content: CAO_SYSTEM_INSTRUCTIONS },
      { role: "user", content: buildAnswerPrompt(context, question) },
    ],
    temperature: 0,
  }),
  { baseDelayMs: 5000, maxAttempts: 8 },
);
answer = generated.text;
await sleep(2000);
```

`generateText` (`packages/ai/src/models.ts:203-241`) calls Mistral
`https://api.mistral.ai/v1/chat/completions`; `max_tokens` defaults to `DEFAULT_MAX_OUTPUT_TOKENS`
= `1024` (`models.ts:126,257`) because no `maxTokens` is passed. **The eval bypasses Mastra and the
`createSovereignModel` adapter** and calls `generateText` directly (divergence, §2b).

**Scoring (`scoreAnswerCase()` `judge.ts:350-402`).** Six scorers per case:

1. **Citation verification (deterministic)** — `scoreCitationVerification()` (`judge.ts:82-115`).
   Refusals return `{verification:1, orphanRate:0, danglingMarkerRate:0}`. Else `parseGenerationOutput`
   splits prose from a `<<<CITATIONS>>>` JSON block (`parse-generation.ts:41-68`). If the citation
   block does not parse → `verification: 0`, and `danglingMarkerRate` = 1 if the prose has any `[n]`
   marker else 0. Otherwise `verifyCitations()` (`verify-citations.ts:22-49`) checks each model quote
   is a verbatim substring (whitespace-normalized) of its chunk; `verification = strippedMarkers.length === 0 ? 1 : 0`. Orphan rate = verified markers with no `[n]` in prose / verified markers; dangling
   rate = prose `[n]` with no verified citation / prose markers.
2. **Citation correctness (deterministic)** — `scoreCitationCorrectness()` (`judge.ts:150-202`).
   Returns 1 for refusals or cases with no `expectedArticle`. Otherwise a graded score in
   {0, 0.5, 0.6, 0.8, 1} based on whether the prose mentions `artikel <expectedArticle>` and/or
   cites a passage whose article/source matches. (This is heuristic string matching; note the
   `passage.content.slice(0,40)...slice(0,20)` content check at `judge.ts:186` is effectively a
   20-char prefix match.)
3. **Refusal calibration (deterministic)** — `scoreRefusalCalibration()` (`judge.ts:209-217`).
   `answerRefuses()` = answer contains `NOT_FOUND_MESSAGE` OR matches `/niet terugvinden/i`
   (`judge.ts:205-207`). Refusal case: 1 if refused else 0. Non-refusal: 1 if answered else 0.
4. **Hard-hallucination (deterministic)** — `scoreHardHallucination()` (`judge.ts:239-254`).
   Strips `[n]` markers, extracts hard facts via three regexes (`judge.ts:229-233`): euro amounts
   `/€\s?\d[\d.]*(?:,\d+)?/g`, percentages `/\d+(?:,\d+)?\s?%/g`, and quantities with units
   (`uur|uren|week|weken|maand|...|trede|periodiek|...`). Score is **binary**: 1 if every extracted
   fact (whitespace/lowercase-normalized) appears in the concatenated context, else 0. Bare
   article/citation numbers are excluded by design.
5. **LLM judge (non-deterministic)** — for non-refusal cases only, `judgeFaithfulnessAndCompleteness()`
   returns `faithfulness`, `relevance`, `completeness` (see below). For refusal cases these three are
   set to the `refusalCalibration` value and `citationCorrectness` is forced to 1 (`judge.ts:366-380`).

**LLM-as-judge details (`judge.ts:265-348`).**
- Judge model: `JUDGE_MODEL = "mistral-large-2512"` (`judge.ts:28`), deliberately different from the
  generator `mistral-small-2603` (same provider/family: Mistral).
- `temperature: 0` (`judge.ts:275`). Called via `retryWithBackoff({ baseDelayMs: 5000, maxAttempts: 8 })`.
- **Full judge prompt (system, `judge.ts:279-288`):**

```
Je bent een strikte evaluator voor een CAO-assistent.
Beoordeel het antwoord op basis van ALLEEN de gegeven context en de referentie.
Antwoord uitsluitend met geldig JSON:
{"faithfulness":0.0,"relevance":0.0,"completeness":0.0,"reasoning":"kort"}

faithfulness (0-1): bevat het antwoord geen feiten die niet uit de context volgen?
relevance (0-1): beantwoordt het antwoord de gestelde vraag echt, en niet alleen een verwant onderwerp?
completeness (0-1): beantwoordt het antwoord de kern van de vraag zoals de referentie?
```

  User turn (`judge.ts:291-301`): `Vraag: <question>`, `Context:` <context>, `Referentie-antwoord:
  <referenceAnswer>`, `Te beoordelen antwoord: <answer>`.
- **Output parsing (`judge.ts:308-318`):** `jsonMatch = /\{[\s\S]*\}/.exec(result.text)`; if no
  match → **throws** `Error("Judge returned non-JSON: ...")`. On match, `JSON.parse` then
  `judgeResponseSchema.parse` (Zod: faithfulness/relevance/completeness numbers in [0,1], optional
  reasoning; `judge.ts:30-35`). A parse/validation failure **throws** (inside `retryWithBackoff`, but
  the retry only re-tries on messages containing `"429"` or `/rate limit/i` — `retry.ts:19`; a JSON
  error is not a rate-limit, so it is re-thrown on the first attempt) → propagates to `main().catch`
  → exit 1. So **unparseable judge output fails the whole eval run** (it does not default to a score).
- **Multi-sample:** `samples = env.EVAL_JUDGE_SAMPLES ?? 1` (`judge.ts:331`); draws N sequential
  samples and takes the **median** per metric (`judge.ts:336-347`, `median()` `judge.ts:256-263`).
  CI sets 3 nightly, 1 otherwise (§1.3).

**Aggregation (`aggregateScores()` `judge.ts:404-467`).** Simple **mean over all cases** for
hardHallucination, faithfulness, relevance, citationCorrectness, completeness, refusalCalibration,
citationVerification, orphanRate, danglingMarkerRate. Two rates are computed over subsets:
`overRefusalRate = (# answerable cases that refused) / (# answerable cases)`;
`underRefusalRate = (# refusal cases that answered) / (# refusal cases)` (`judge.ts:447-464`).

**Pass/fail (verbatim, `cao.eval.ts:500-546`).** Higher-is-better: hard-hallucination ≥ 98.0%,
soft-faithfulness ≥ 80.0%, relevance ≥ 85.0%, citation-correctness ≥ 75.0%, completeness ≥ 70.0%,
refusal-calibration ≥ 90.0%, citation-verification ≥ 98.0%. Lower-is-better: orphan-rate ≤ 0%,
dangling-marker-rate ≤ 0%, over-refusal-rate ≤ 5.0%, under-refusal-rate ≤ 10.0%. Plus answer
regression checks (see note).

**Answer-regression note (important).** `answerRegressionChecks()` (`cao.eval.ts:550-600`) returns
`[]` when `baseline.answer` is absent. The committed `fixtures/baseline.json` has **only a
`retrieval` section, no `answer` section** → **all answer-regression checks are currently no-ops
(dead).** They would activate only after an `EVAL_WRITE_BASELINE=1` run records an answer section.

**Failure/skip.** Runs only if `SCALEWAY_API_KEY` AND `MISTRAL_API_KEY` (`cao.eval.ts:756-762`);
else `reportUnavailable(...)`. Generation is retried up to 8× on rate limits (`retry.ts:5-29`);
non-rate-limit generation errors propagate → exit 1.

### Gate D — corpus isolation

**Contract (always runs, `cao.eval.ts:662-675`).** Asserts `retrievalInputSchema.safeParse({query})`
fails (no fund) and `{query, fund:"demo"}` succeeds. `retrievalInputSchema` requires
`fund: z.string().min(1)` (`packages/agents/src/cao/tools.ts:15-21`).

**Integration (`corpusIsolationLiveChecks()` `cao.eval.ts:677-702`).** Runs only if `DATABASE_URL`
AND `SCALEWAY_API_KEY` (`cao.eval.ts:766-772`). `listFunds()`; for each fund runs
`retrieveContext({ query: "vakantie loon toeslag pensioen arbeidsduur", fund, topK: 20, minScore: 0 })`
and asserts no returned chunk has `source.fund !== fund`. Fails if 0 funds ingested.

---

## 2b. The system under test (agent configuration)

### Agent system prompt

Full text is `CAO_SYSTEM_INSTRUCTIONS` (`packages/agents/src/cao/prompt.ts:16-64`), a Dutch
`.join("\n")` array. It is used **verbatim in both production and eval** (production:
`agent.ts:163` sets `instructions: CAO_SYSTEM_INSTRUCTIONS`; eval: `cao.eval.ts:619` passes it as
the system message). Instruction excerpts by audited behavior:

- **Source citation** (`prompt.ts:23-41`): "Zet ACHTER ELKE zin die op een bron leunt een inline
  verwijzing `[n]`…"; append a `<<<CITATIONS>>>` sentinel then a JSON array; each `[n]` must have
  exactly one JSON object with `marker`, `chunk_id` (the uuid after `chunk_id=`), and a verbatim
  `quote`. "Een bron zonder [n] in de tekst is fout; een [n] in de tekst zonder bijbehorende
  JSON-citatie is ook fout."
- **Refusal / "I don't know"** (`prompt.ts:48-49`): "Staat het antwoord niet in de context? Zeg dan
  letterlijk: \"<NOT_FOUND_MESSAGE>\" en verzin niets. Gebruik in dat geval een lege citatie-array: []."
  `NOT_FOUND_MESSAGE` = `"Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb.
  Neem voor zekerheid contact op met je fonds."` (`prompt.ts:12-14`).
- **Clarification** (`prompt.ts:50-52`): if the context is about another topic and doesn't answer
  the question, say so and ask one short clarifying question, with an empty citation array. (Note:
  the *deterministic* clarify router — `clarify.ts` — runs before the LLM in production only for the
  salary-without-pay-grade case; see below.)
- **Answer format** (`prompt.ts:21-27,53`): one short kernel sentence first, then brief explanation;
  answer in Dutch, "kort en feitelijk", compact.
- **Language** (`prompt.ts:53`): "Antwoord in het Nederlands."
- **Scope guard** (`prompt.ts:18,54-55`): informative only, "geen persoonlijk, financieel of
  juridisch advies"; no individual advice.
- **Security** (`prompt.ts:57-63`): context/question are reference data, never instructions; ignore
  role-change/prompt-injection; never reveal the system prompt.

The user turn is assembled by `buildAnswerPrompt(context, question)` (`prompt.ts:74-87`), which
fences the context in `<context>…</context>` markers and appends `Vraag: <question>`.

Deterministic **clarify router** `detectClarification()` (`clarify.ts:37-50`): fires the fixed
`SALARY_CLARIFICATION` string only when `SALARY_INTENT` AND `AMOUNT_QUESTION` match and neither
`PAY_GRADE_SPECIFIED` nor `GENERIC_SALARY_TOPIC` match. It is intentionally limited to the
salary-without-functiegroep case (`clarify.ts:11-13`).

### Generation config: production vs eval

| Parameter | Production (`agent.ts`) | Eval Gate C (`cao.eval.ts`) | Identical? |
|-----------|-------------------------|------------------------------|-----------|
| Model id | `createSovereignModel()` → `DEFAULT_LLM_MODEL` = `mistral-small-2603` (`sovereign-model.ts:83`, `models.ts:118`) | `EVAL_LLM_MODEL` = `mistral-small-2603` (`cao.eval.ts:66`) | **Yes (same id)** |
| Temperature | **Not set** by `registered.generate/stream` (`agent.ts:213,295`) → Mastra passes `callOptions.temperature`; if undefined, `generateText` omits it → Mistral API default. `[UNVERIFIED]` exact value Mastra sends. | `temperature: 0` (`cao.eval.ts:622`) | **No** (eval forces 0; production does not) |
| max tokens | undefined → `DEFAULT_MAX_OUTPUT_TOKENS` = 1024 (`models.ts:257`) | undefined → 1024 | Yes |
| Call path | Mastra `Agent` → `createSovereignModel` (AI-SDK v2 adapter) → `generateText`/`streamText` | **Direct** `generateText` (adapter + Mastra bypassed) | **No** |
| Judge model | n/a | `mistral-large-2512`, temp 0 | n/a |

Condense model (both paths): `DEFAULT_LLM_MODEL` = `mistral-small-2603`, `temperature: 0`,
`maxTokens: 64` (`condense.ts:53-57`).

### Retrieval config

Pinned embedding (`packages/shared/src/config/embedding.ts:28-32`): `model: "qwen3-embedding-8b"`,
`dim: 4096`, `version: "1"`. Flat/exact search (4096 > pgvector 2000 ANN limit) — no HNSW/IVF index.

Pinned rerank (`packages/shared/src/config/rerank.ts:33-41`): `model: "qwen3-embedding-8b"`
(the **same model as embeddings**, not a cross-encoder — noted `rerank.ts:6-11`), `version: "1"`,
`candidateK: 15`, `topK: 3`, `enabled: true`, `skipAboveScore: 0.85`. Overridable via env
(`requireRerankConfig()` `rerank.ts:47-60`; env keys `RERANK_ENABLED/MODEL/CANDIDATE_K/TOP_K/SKIP_ABOVE_SCORE`).

Production retrieval defaults (from the agent contract `caoQuestionSchema`, `types.ts:18-32`):
`topK` default **3**, `minScore` default **0.35**. The chat API never overrides these
(`route.ts:86` passes only `{question, fund, history}`), so production uses topK=3, minScore=0.35.
Production pipeline order: `rewrite → retrieve (pgvector) → rerank → assemble`
(`packages/rag/src/index.ts:18-44`). The anti-hallucination guard: if
`retrieval.hits.length === 0` the agent returns `NOT_FOUND_MESSAGE` **without calling the LLM**
(`agent.ts:201-211, 277-290`).

Chunking strategy is set at ingestion (`scripts/ingest/chunk.ts`), not in the eval; Gate B/C use
fixture passages, not ingested chunks, so **chunking is not exercised by any gate** (see §5).

### Eval path vs. production path — divergences (each one listed)

1. **Model wrapper.** Production goes through Mastra `Agent` → `createSovereignModel` adapter;
   Gate C/B2/condense call `@wunderstack/ai` `generateText`/`rerankDocuments` directly
   (`cao.eval.ts:616`, `judge.ts:273`). The adapter is bypassed in eval.
2. **Temperature.** Eval forces `temperature: 0`; production does not set temperature
   (`agent.ts:213,295`). See table above.
3. **Retrieval is not run in Gate C.** Gate C feeds the model the **golden context** built from
   `expectedPassageIds` (`passagesForCase`, `cao.eval.ts:611`), not pgvector-retrieved chunks.
   Production runs rewrite+embed+pgvector+rerank+assemble. So Gate C measures generation given
   perfect context, not end-to-end retrieval→answer.
4. **Context assembly is reimplemented.** Gate C uses `buildContext()` in `judge.ts:124-133`
   (`[n] chunk_id=<id> (Artikel X / Bijlage …) <content>`), a **separate implementation** from
   production `assemble()` (`packages/rag/src/assemble.ts:62-68`), which anchors on
   `hit.structure.sourceRef` not on an "Artikel X" label. The two context strings differ in the
   parenthetical anchor and whitespace handling.
5. **Rerank skip logic differs.** Gate B calls `rerankDocuments` unconditionally (except empty
   candidates); production `rerank()` skips rerank when disabled, single candidate, or top score ≥
   `skipAboveScore` (0.85) (`packages/rag/src/rerank.ts:34-46`). Gate B also computes cosine
   in-memory, not via pgvector.
6. **minScore not applied in eval.** Gate B/C never apply the production `minScore` (0.35) relevance
   floor, so the eval never exercises the "nothing clears threshold → refuse without LLM" guard.
7. **Refusal path not exercised in Gate C.** Refusal cases are answered with a hardcoded constant,
   no model/retrieval call (`cao.eval.ts:608-609`).
8. **Query rewriting absent.** Production `rewriteQuery()` (`packages/rag/src/rewrite.ts`) expands
   CAO abbreviations before embedding; Gate B/B2 embed the raw question (Gate B) / condensed query
   (B2) with no rewrite step.
9. **Citation post-processing differs.** Production `verifyAndBuild()` strips failed/unverified
   markers and builds UI citations (`agent.ts:113-128`); eval scores verification but does not run
   the same strip-and-rebuild path.
10. **Env differences.** Eval sets `temperature 0`, uses pinned dated model ids; production default
    may track behavior of `mistral-small-2603` too (same id), but temperature and wrapper differ as
    above.

There is **no place in the code that guarantees eval == production**; the shared elements are only
the string constants `CAO_SYSTEM_INSTRUCTIONS` / `NOT_FOUND_MESSAGE` and the model id constant.

---

## 3. Golden set architecture

### Files & loading

- `packages/agents/src/evals/fixtures/golden-set.jsonl` — **58 cases** (one JSON object per line).
- `packages/agents/src/evals/fixtures/golden-passages.jsonl` — **23 passages**.
- Loaded by `golden-set.ts:58-59` via `readJsonl()` (`golden-set.ts:9-17`), each line
  `JSON.parse`d then Zod-validated. A malformed line throws at load (fails the run).

### Schemas (verbatim, `golden-set.ts:19-43`)

```ts
goldenPassageSchema = { id, source, content, article?, lid?, chunkType: "text"|"table" (default "text") }
goldenCaseSchema = {
  id, question, history?: [{role:"user"|"assistant", content}] (max 6),
  expectedPassageIds: string[], expectedArticle?, expectedLid?, referenceAnswer, category
}
goldenCaseCategorySchema = "in_scope" | "refusal" | "table"
```

### Example entries (structure; content is fictional "CAO Voorbeeldsector" seed data)

Passage:
```json
{"id":"proeftijd","source":"CAO Voorbeeldsector — Artikel 3 (Proeftijd)","content":"Bij een arbeidsovereenkomst...","article":"3","chunkType":"text"}
```
In-scope case:
```json
{"id":"q-proeftijd-onbepaald","question":"Hoe lang mag de proeftijd zijn bij een vast contract?","expectedPassageIds":["proeftijd"],"expectedArticle":"3","referenceAnswer":"Bij een arbeidsovereenkomst voor bepaalde tijd van zes maanden of korter kan geen proeftijd worden overeengekomen.","category":"in_scope"}
```
Multi-turn case:
```json
{"id":"q-vakantie-followup-deeltijd","question":"En bij deeltijd?","history":[{"role":"user","content":"Op hoeveel vrije dagen heb ik per jaar recht bij een fulltime baan?"},{"role":"assistant","content":"...25 vakantiedagen..."}],"expectedPassageIds":["vakantiedagen"],"expectedArticle":"12","referenceAnswer":"Bij een deeltijd dienstverband worden de vakantiedagen naar rato toegekend.","category":"in_scope"}
```
Refusal case:
```json
{"id":"q-refusal-bouw","question":"Hoeveel vakantiedagen gelden in de bouwsector?","expectedPassageIds":[],"referenceAnswer":"Ik kan dit niet terugvinden...","category":"refusal"}
```

### Composition (measured from the committed file)

- By category: **41 `in_scope`, 10 `refusal`, 7 `table`** (58 total).
- Multi-turn: **3** cases carry `history` (all `q-vakantie-followup-*`).
- Passages: 23 (20 `text`, 3 `table`).

### How source/citation expectations are encoded

Per case: `expectedPassageIds` (passage ids used to build Gate C context, `passagesForCase`
`golden-set.ts:65-69`) and `expectedArticle` / optional `expectedLid`. **Relevance in Gate B is
matched on `article`/`lid`, never on chunk/passage id** (`passageMatchesCase()` `cao.eval.ts:209-221`).
`expectedPassageIds` are still id-based and are the only thing tying a case to its Gate C context.

**Re-chunk / re-ingest impact:** Gate B/C read fixtures, not the ingested corpus, so re-chunking the
real corpus does not affect them at all. Within the fixtures, Gate B relevance survives re-chunking
by design (article/lid match). But `expectedPassageIds` (Gate C context selection) are hardcoded ids
in the fixtures; they are decoupled from any DB corpus. `GOLDEN_CORPUS_VERSION` (`golden-set.ts:56`)
= `"1"` is the snapshot tag; a change to `golden-passages.jsonl` should bump it (manual discipline;
nothing enforces it).

### Behavioral vs fonds-specific split

**Not implemented as separate files.** The split exists only as **labels in console output and
comments**: Gate A + Gate C behavioral checks are called "corpus-agnostic base layer" and Gate B +
correctness checks "fund-specific" (`cao.eval.ts:729,736,755`; header `:13,:19`). All cases live in
one `golden-set.jsonl`; `PLAN-eval-gates.md:161-163` lists physically splitting the fixtures as an
open backlog item.

### Versioning / pinning

- Golden set version: single tag `GOLDEN_CORPUS_VERSION = "1"` (`golden-set.ts:56`). Not per-case.
- A run is "pinned" to a set version only insofar as the regression baseline is gated on
  `baseline.corpusVersion === GOLDEN_CORPUS_VERSION` (`cao.eval.ts:386,555`). The fixtures
  themselves are versioned only by git; there is no content hash. The golden set is **not**
  versioned in Langfuse (see §6).

---

## 4. Determinism & reliability

### Sources of non-determinism (per gate)

- **Gate A:** none (pure string/regex).
- **Gate B:** Scaleway embedding calls + Scaleway rerank call (network; provider-side model
  behavior). Cosine math is deterministic. Rerank order is provider-dependent. On rerank error the
  order silently falls back (`cao.eval.ts:331-333`), changing results without failing.
- **Gate B2:** all of Gate B plus `condenseQuery` LLM output (`mistral-small-2603`, temp 0 — still
  not perfectly deterministic).
- **Gate C:** generator LLM (`mistral-small-2603`, temp 0), judge LLM
  (`mistral-large-2512`, temp 0). Both are non-deterministic even at temperature 0 (stated
  `judge.ts:22`). Deterministic scorers (hard-hallucination, citation verification/correctness,
  refusal) depend only on the (non-deterministic) generated text. Case order is fixed (array order).
- **Gate D:** DB + embedding network calls.

### Retry / re-run / flakiness mitigation

- **Retry on rate limits only:** `retryWithBackoff` retries iff the error message contains `"429"`
  or matches `/rate limit/i` (`retry.ts:19`); otherwise it rethrows immediately. Generator:
  `{ baseDelayMs: 5000, maxAttempts: 8 }` (`cao.eval.ts:624`). Judge: `{ baseDelayMs: 5000,
  maxAttempts: 8 }` (`judge.ts:305`). Exponential backoff `base * 2^(attempt-1)`.
- **Inter-request pacing:** `await sleep(2000)` after each Gate C generation (`cao.eval.ts:627`).
- **Judge majority vote:** median over `EVAL_JUDGE_SAMPLES` (default 1; nightly 3) — `judge.ts:325-347`.
  With the default of 1, there is effectively **no** majority vote on PR/merge runs.
- **No case-level retry** for a failing assertion, and **no gate re-run** loop. A failed check just
  fails. There is **no caching** of model outputs.
- **Regression tolerance** `REL_TOLERANCE = 0.05` (`baseline.ts:53`) dampens threshold noise for
  retrieval (answer regression is currently dead, §2).

### Answering vs judging model relationship

Same provider/family (both Mistral, EU-sovereign). Generator `mistral-small-2603` (Mistral Small 4);
judge `mistral-large-2512` (Mistral Large 3) — different sizes, deliberately separated to reduce
self-preference bias, with the residual same-provider bias disclosed (`judge.ts:15-20`).

---

## 5. Coverage & blind spots (factual)

| Behavior | Status | Evidence |
|----------|--------|----------|
| Faithfulness (soft, paraphrase drift) | **MEASURED** | judge `faithfulness` ≥ 0.8 (`cao.eval.ts:506-507`) |
| Hard hallucination (invented €/%/quantities) | **MEASURED** | `scoreHardHallucination` ≥ 0.98 (`judge.ts:239-254`, `cao.eval.ts:502-503`) |
| Citation correctness (right article) | **MEASURED** | `scoreCitationCorrectness` ≥ 0.75 (`judge.ts:150-202`) |
| Citation verbatim verification | **MEASURED** | `scoreCitationVerification` ≥ 0.98 (`judge.ts:82-115`) |
| Orphan sources / dangling markers | **MEASURED** | orphanRate ≤ 0, danglingMarkerRate ≤ 0 (`cao.eval.ts:530-535`) |
| Under-refusal (should refuse, answered) | **MEASURED but weak** | rate ≤ 0.10 (`cao.eval.ts:542-543`), BUT refusal cases are answered with a hardcoded constant (`cao.eval.ts:608-609`) so under-refusal is **structurally always 0** — the model's refusal behavior is never tested. |
| Over-refusal (answerable, refused) | **MEASURED** | rate ≤ 0.05 (`cao.eval.ts:538-539`); computed on answerable cases which DO call the model on golden context |
| Answer relevance | **MEASURED** | judge `relevance` ≥ 0.85 |
| Completeness | **MEASURED** | judge `completeness` ≥ 0.7 |
| Retrieval recall/MRR | **MEASURED** (on fixtures, in-memory cosine) | Gate B |
| Rerank effect | **MEASURED** (MRR delta ≥ 0) | `cao.eval.ts:371-375` |
| Multi-turn condensation retrieval | **MEASURED** (3 cases) | Gate B2 |
| Corpus/fund isolation | **MEASURED** (contract always; live needs DB) | Gate D |
| Latency | **NOT MEASURED** | `cao.eval.ts:27-28`; timings only traced in production |
| Cost / tokens | **NOT MEASURED** | same; no budget gate |
| End-to-end retrieval→answer (real pgvector feeding the LLM) | **NOT MEASURED** | Gate C uses golden context, not retrieval (§2b) |
| Chunking quality | **NOT MEASURED** | fixtures bypass ingestion |
| Prompt-injection resistance (security instructions in prompt) | **NOT MEASURED behaviorally** | only asserted present as text in Gate A |
| Table answers (`table` category, 7 cases) | **MEASURED via Gate C** (no table-specific metric) | scored by the same generic scorers |
| Production temperature setting | **NOT MEASURED** | eval uses temp 0; production temp unset (§2b) |

**Over-refusal test exists** (answerable case that refuses is penalized) — MEASURED. **Refusal of
truly-unanswerable questions by the model is NOT measured** (constant substitution).

Behaviors that exist in the agent but are not covered by any gate: real retrieval-driven answering,
the `minScore` refuse-without-LLM guard, query rewriting, streaming/citation-stripping reconciliation,
multi-turn *answering* (only retrieval of condensed query is tested, not the answer), and prompt-injection
handling.

---

## 6. Observability & audit trail

- **Gate output:** console only (`report()` `cao.eval.ts:704-711`, plus metric log blocks). In CI
  this is the GitHub Actions job log. There is **no JUnit/JSON artifact, no `upload-artifact` step**
  in `ci.yml`. No Langfuse dataset/score is written by the eval.
- **Baseline:** the only persisted eval state is `fixtures/baseline.json`, updated only under
  `EVAL_WRITE_BASELINE=1` (`cao.eval.ts:359-362, 634-650`). It currently holds a retrieval section
  only.
- **Production (not the gate):** the agent writes Langfuse traces (`trace.ts`) and a numeric score
  `"citation-verification-rate"` per answer (`agent.ts:42, 146-157`), and the app records
  `"user-feedback"` scores (`feedback.ts`). `scripts/eval/harvest-feedback.ts` reads thumbs-down
  `"user-feedback"` scores from Langfuse into candidate golden cases for **manual** curation — never
  auto-added to the gate.
- **Reproducibility of a historical gate run:**
  - Model ids: **pinned** (`mistral-small-2603`, `mistral-large-2512`) but these are hosted
    endpoints; the provider can change weights behind a dated id `[UNVERIFIED]`.
  - Embedding/rerank models: **pinned** (`qwen3-embedding-8b`), same caveat.
  - Data: golden fixtures pinned by git commit; `GOLDEN_CORPUS_VERSION` = `"1"`.
  - Prompt: pinned by git (string constant).
  - Temperature: 0 for eval calls.
  - **Not pinned/persisted:** the actual model outputs, judge outputs, per-case scores, and the
    aggregate numbers of a given run (console-only, not archived). So a specific past run cannot be
    reproduced bit-for-bit; only re-run under the same commit+models, with residual LLM/provider
    non-determinism.

---

## 7. Configuration surface

All env vars are parsed once in `packages/shared/src/env.ts` (Zod).

| Var | Default | Effect on gate behavior | Read at |
|-----|---------|-------------------------|---------|
| `SCALEWAY_API_KEY` | unset | Enables Gate B, B2, C, Gate D integration; missing → skip (or fail under `EVAL_REQUIRE_ALL`) | `cao.eval.ts:737,745,756,766`; used in `embeddings.ts:59`, `rerank.ts:93` |
| `MISTRAL_API_KEY` | unset | Enables Gate B2, C; missing → skip/fail | `cao.eval.ts:745,756`; `models.ts:208,319` |
| `DATABASE_URL` | unset | Enables Gate D integration (live cross-fund test) | `cao.eval.ts:766` |
| `EVAL_REQUIRE_ALL` | unset (`"0"` in PR CI) | `"1"`/`"true"` → a missing-key gate FAILS instead of skipping (`REQUIRE_ALL`) | `cao.eval.ts:71`; set in `ci.yml:51` |
| `EVAL_JUDGE_SAMPLES` | 1 (max 9) | Judge samples per case; median taken | `judge.ts:331`; set to 3 nightly (`ci.yml:52`) |
| `EVAL_WRITE_BASELINE` | unset | `"1"`/`"true"` → record current metrics into `baseline.json` instead of comparing | `cao.eval.ts:359,634` |
| `RERANK_ENABLED` | `true` | Toggles rerank in the **production** pipeline (`rag/src/rerank.ts:38`). NOTE: Gate B ignores this and always calls rerank. | `rerank.ts:53` |
| `RERANK_MODEL` | `qwen3-embedding-8b` | Rerank model id used by Gate B/B2 (`requireRerankConfig`) | `rerank.ts:49` |
| `RERANK_CANDIDATE_K` | 15 | Candidate pool size before rerank (Gate B/B2 use it) | `rerank.ts:51` |
| `RERANK_TOP_K` | 3 | Kept-after-rerank count (Gate B/B2) | `rerank.ts:52` |
| `RERANK_SKIP_ABOVE_SCORE` | 0.85 (`"null"` disables) | Production skip-rerank threshold; not applied in Gate B | `rerank.ts:54-58` |
| `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_BASE_URL` | unset / EU cloud | Production tracing + feedback harvesting; **no effect on the gate** | `langfuse.ts`, `feedback.ts`, `harvest-feedback.ts` |
| `CAO_FUNDS` | unset | Production fund allowlist; affects Gate D live test only via which funds are ingested `[UNVERIFIED]` | `funds.ts`, `fund-scope.ts` |
| `NODE_ENV` | `development` | Langfuse realtime flush flag; no gate effect | `env.ts:15`, `langfuse.ts:31` |

Config files: `packages/shared/src/config/embedding.ts` (embedding pin), `.../config/rerank.ts`
(rerank pin), `fixtures/baseline.json` (regression baseline), `fixtures/golden-set.jsonl` +
`golden-passages.jsonl` (data). In-code constants (not env-overridable): all thresholds in
`cao.eval.ts:73-102`, `EVAL_LLM_MODEL`, `JUDGE_MODEL`, `GOLDEN_CORPUS_VERSION`, `REL_TOLERANCE`,
retry parameters, the 2000 ms inter-call sleep, hard-fact regexes.

No CLI flags: the script takes no argv (`main()` reads only env).

---

## 8. Known TODOs / suppressed checks

There are **no** `TODO`/`FIXME`/`xit`/`xdescribe`/`.skip`/`continue-on-error` tokens in the eval or
CI code. The relevant items are worded as "backlog"/"skip" semantics:

- `cao.eval.ts:27-28` — "Backlog (not gated yet): latency and per-run token cost." (latency/cost
  gate deliberately omitted).
- `cao.eval.ts:717-724` `reportUnavailable()` — the **skip mechanism**: without `EVAL_REQUIRE_ALL`,
  a gate with missing keys prints `SKIPPED` and returns `true` (pass). This is the intended
  fork/dev escape hatch; it means on `pull_request` (where `EVAL_REQUIRE_ALL='0'`) **Gate B/B2/C/D-
  integration all pass-by-skip if secrets are absent**, leaving only Gate A + Gate D contract as
  hard checks.
- `cao.eval.ts:331-333` — rerank exception in Gate B is **swallowed** (falls back to pre-rerank
  order); a broken reranker does not fail Gate B, it just makes the "MRR does not regress" check
  trivially pass (delta 0).
- `answerRegressionChecks()` (`cao.eval.ts:550-600`) — effectively **suppressed**: returns `[]`
  because `baseline.json` has no `answer` section. Answer-quality regressions are only caught by the
  absolute thresholds, not relative to a baseline.
- `PLAN-eval-gates.md:7-10, 192-193` — branch protection (required `verify` check + merge queue)
  is documented as **not yet configured in repo settings**; without it the gate does not block merges.
- `PLAN-eval-gates.md:161-163` — physical behavioral/fonds-specific fixture split: **not done**.
- `packages/agents/scripts/build-golden-fixtures.ts` is **stale** relative to the committed fixtures:
  it generates 50 cases (23 labeled + 10 extra in-scope + 7 table + 10 refusal) and no `history`
  cases, but the committed `golden-set.jsonl` has 58 cases including 3 multi-turn ones. Regenerating
  fixtures with this script would silently drop the multi-turn (Gate B2) cases and 8 others.

---

## Open questions from the codebase itself

1. **Is `verify` a required check / is the merge queue on?** Not answerable from the repo. If not,
   `EVAL_REQUIRE_ALL` on `merge_group`/`push` is moot because nothing forces the merge through the
   gate (`PLAN-eval-gates.md:7-10`).
2. **What temperature does production actually use?** `agent.ts` never sets it and
   `createSovereignModel` forwards `callOptions.temperature`. `[UNVERIFIED]` whether Mastra 1.x
   injects a default temperature into `doGenerate`/`doStream`. If it defaults to non-zero, the eval
   (temp 0) systematically under-samples production variance.
3. **Dead answer-regression path.** `answerRegressionChecks` and the entire `answer` branch of the
   baseline schema are unused because `baseline.json` lacks an `answer` section. Was an answer
   baseline ever meant to be committed? Currently the "regression-relative" protection the plan
   describes (`PLAN-eval-gates.md:158-160`) only exists for retrieval.
4. **Refusal category never tests the model.** Gate C substitutes `NOT_FOUND_MESSAGE` for refusal
   cases (`cao.eval.ts:608-609`), so `underRefusalRate` is structurally 0 and the 10 refusal cases
   validate only the deterministic scorers on a constant. Intended, or a stub?
5. **Gate B does not test production retrieval.** It re-embeds fixtures and does in-memory cosine
   (no pgvector, no rewrite, no `minScore`, no production skip-rerank logic). The plan
   (`PLAN-eval-gates.md:100-103`) targeted "Gate B op de echte retrieval-pijplijn"; the code did not
   move to it. So retrieval-pipeline regressions (SQL, rewrite, threshold) are invisible to the gate.
6. **Rerank model is the embedding model.** `RERANK_CONFIG.model = "qwen3-embedding-8b"`
   (`config/rerank.ts:34`) — an embedding model used as a reranker, not a cross-encoder. The
   "rerank MRR does not regress" gate is measuring an embedding model reranking its own cosine
   neighbors.
7. **`skipAboveScore` unused where measured.** `RERANK_SKIP_ABOVE_SCORE`/`skipAboveScore` (0.85)
   only affects the production `rerank()` (`rag/src/rerank.ts:43`), never Gate B — so the gate can
   report a rerank benefit that production skips for high-confidence hits.
8. **Config drift risk:** `GOLDEN_CORPUS_VERSION` bumping is manual; nothing ties fixture content to
   the version tag, so a fixture edit without a bump would silently keep comparing against a stale
   baseline.
9. **`build-golden-fixtures.ts` vs committed fixtures** diverge (see §8) — unclear which is source of
   truth; the committed JSONL is what the gate reads.
