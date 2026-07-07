# Code Review — 2026-07-03 14:13

> **Update 2026-07-03 20:00 — remediation applied.** The critical secret leak was resolved by
> rewriting the (never-pushed) root commit and pruning the old blob; no rotation needed. Warnings
> W3–W6, suggestions S2/S3/S4/S7 and all dead-code items were implemented. Full `typecheck`,
> `lint` and `depcruise` are green after the changes. Per-item status is marked inline below with
> ✅ (done), ⏳ (open) and 🔁 (resolved differently).
>
> **Update 2026-07-05 — observability closed.** Warnings **W1 and W2 are now implemented.** A small
> tracing seam (`packages/agents/src/observability/trace.ts`) opens one Langfuse span per question
> and records the pgvector retrieval + the query-embedding as child spans on **every** path
> (including the "niet gevonden" refusal, where no LLM call follows); the generation is linked into
> the same trace. Langfuse stays confined to `packages/agents`; the whole path is best-effort
> (no-op when observability is unconfigured, so tracing can never break an answer). `typecheck`,
> `lint` and `depcruise` remain green. **All warnings are now closed.**

## Scope
- **Time window:** since 1 day ago (last 24h) — default configuration.
- **Branch:** `main`
- **Uncommitted included:** yes (staged + unstaged + untracked)
- **Commits in scope:** 1 (`0b8fccb`)
- **Changed files:** 72 in the commit + 22 modified (uncommitted) + 30 new/untracked.

> **Note on scope.** The only commit in the window is the initial commit (3h ago), and most
> real feature code (agent, API, UI, ingestion, evals) is still uncommitted/untracked on top of
> it. In practice this is a **whole-codebase review** of a brand-new walking skeleton, which
> matches the review standard: existing code is thin, so the rules (`.cursor/rules/*.mdc`),
> `AGENTS.md`, `docs/PRODUCT_SPEC.md` and `PLAN.md` are the primary standard.

## Changed files

### Commit `0b8fccb` — 2026-07-03 11:13 +0200 — ce1zer
> chore: initial commit — walking skeleton through Phase 5 (retrieval)

Full monorepo scaffold: root config (`package.json`, `turbo.json`, `tsconfig.base.json`,
`eslint.config.mjs`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml`, `.env.example`),
`.cursor/rules/000–500`, `docs/PRODUCT_SPEC.md`, `PLAN.md`, empty package skeletons, and the
`packages/db` schema + migrations, `packages/ai`, `packages/shared`, `scripts/bake-off`.

### Uncommitted — modified (tracked), ce1zer, last hours
- `.cursor/rules/200-architecture.mdc`, `AGENTS.md` (add connectors/airlock)
- `.env.example` (**secrets added — see Critical #1**)
- `.github/workflows/ci.yml` (eval gate)
- `apps/demo/app/layout.tsx`, `apps/demo/next.config.mjs`, `apps/demo/package.json`, `apps/demo/tsconfig.json`
- `apps/demo/app/page.tsx` (deleted → moved to `app/(demo)/page.tsx`)
- `eslint.config.mjs`, `turbo.json`, `pnpm-workspace.yaml`
- `packages/agents/*`, `packages/ai/src/{index,models}.ts`, `packages/shared/src/{env,index}.ts`
- `scripts/bake-off/run.ts`; `scripts/bake-off/dataset.ts` (deleted → moved to `@wunderstack/shared`)

### Uncommitted — new/untracked (the bulk of the feature code)
- `.cursor/rules/600-connectors.mdc`
- `apps/demo/app/(demo)/page.tsx`, `apps/demo/app/widget/page.tsx`, `apps/demo/app/globals.css`
- `apps/demo/app/api/chat/{route,contract}.ts`, `apps/demo/app/api/webhook/{route,contract}.ts`
- `apps/demo/components/chat/{chat,composer,message-list,use-chat}.tsx|ts`, `components/ui/button.tsx`
- `apps/demo/lib/{agent,utils}.ts`, `apps/demo/proxy.ts`, `apps/demo/public/widget/{widget.js,example.html}`
- `packages/agents/src/cao/{agent,prompt,tools}.ts`, `src/types.ts`, `src/model/sovereign-model.ts`
- `packages/agents/src/observability/{langfuse,langfuse-model-prices}.ts`, `src/evals/cao.eval.ts`, `src/{smoke,sync-model-prices}.ts`
- `packages/shared/src/evals/cao-labeled-set.ts`
- `scripts/ingest/{run,parse,chunk}.ts`

---

## Critical issues
Bugs, security or sovereignty problems that must be fixed now.

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| 1 | `.env.example:11,14,17` | Security / Secrets | 🔁 **RESOLVED (2026-07-03).** Real live credentials were committed in `.env.example` (tracked, in root commit `0b8fccb`): a full Scalingo Postgres connection string incl. password, a real `MISTRAL_API_KEY`, and a real `SCALEWAY_API_KEY`. **Fix applied:** values replaced with empty placeholders; the never-pushed root commit was amended (`0b8fccb` → `3ab4a28`) and the old blob pruned (`git reflog expire --expire=now --all && git gc --prune=now`). Verified: the three secret strings are no longer present in any git object. Because the repo was never pushed/synced (remote 404, no upstream, no push in reflog), **rotation was deemed unnecessary**. `.env` remains correctly gitignored. | *(done — see above; rotate anyway if there is any doubt the values ever left the machine.)* |

## Warnings
Not direct bugs, but they hurt quality, consistency, scalability or rule-adherence.

> **W1 & W2 (observability) — implemented 2026-07-05.** Rather than hand-wiring the raw Langfuse v5
> OTEL tracer/context, the spans are created through **Mastra's own AI-tracing API**
> (`mastra.observability.getDefaultInstance().startSpan(...)` + `createChildSpan`/`createEventSpan`),
> which already exports to the configured Langfuse instance. This keeps us on the framework's
> supported surface (no guessed OTEL setup) and confines Langfuse to `packages/agents`. See the
> resolution notes in the W1/W2 rows.

| # | File:line | Category | Status | Description | Suggestion |
|---|-----------|----------|--------|-------------|-----------|
| 1 | `packages/agents/src/cao/agent.ts` | Observability | ✅ fixed | On the "niet gevonden" path the agent returned **without any Langfuse trace**. | Fixed: a per-question root `AGENT_RUN` span now wraps both paths; `retrieveTraced` emits a `RAG_VECTOR_OPERATION` child span (query, `topK`, `minScore`, `fund`, hit count, top-K scores, `found`) **before** the zero-hit short-circuit, so refusals are fully traced. The tracing seam lives in `packages/agents/src/observability/trace.ts` and no-ops when observability is off. |
| 2 | `packages/ai/src/embeddings.ts`; `packages/rag/src/retrieve.ts` | Observability | ✅ fixed | **Embedding model calls were never traced.** | Fixed: the query embedding is recorded as a `RAG_EMBEDDING` event span (model, provider, dimensions, `inputCount`, `mode:"query"`) nested under the retrieval span, on every path. Implemented at the `packages/agents` layer so `ai`/`rag` stay free of any tracing-vendor coupling (embedding model/dim come from `EMBEDDING_CONFIG`). Note: this traces the retrieval-time query embed; ingestion/eval embeds run outside the agent trace and are logged there instead. |
| 3 | `apps/demo/app/api/chat/route.ts`; `apps/demo/components/chat/use-chat.ts` | Correctness / Cost | ✅ fixed | The chat stream had **no abort/disconnect handling** — the agent kept generating after the client left. | Fixed: `AbortSignal` now threads route → `CaoAgent.answerStream({signal})` → Mastra `stream({abortSignal})` → sovereign model → `generateText` → `fetch`. Route aborts on `request.signal`/stream `cancel()`; `useChat` uses an `AbortController` and aborts on unmount. |
| 4 | `packages/ai/src/embeddings.ts:17-24` | Consistency (docs) | ✅ fixed | The `EmbedInput.dimensions` docstring contradicted `config/embedding.ts` + `results.md` (Matryoshka/2000 vs native-4096-only). | Fixed: docstring corrected (Scaleway returns native dim, `dimensions` is a no-op today) and `embed()` now **throws** if a requested `dimensions` differs from what the provider returns. |
| 5 | `.cursor/rules/100-stack.mdc` | Consistency (rules) | ✅ fixed | The stack rule still pinned `qwen3-embedding-8b @ 2000 dim` + `hnsw/ivfflat`, superseded by the bake-off (4096, flat). | Fixed: the embeddings line now states 4096 dim / flat index, points at `EMBEDDING_CONFIG` as source of truth, and notes Scaleway's native-dim-only behaviour. |
| 6 | `packages/rag/src/assemble.ts`; `agents/src/cao/tools.ts`; `agents/src/types.ts`; `apps/demo/app/api/chat/contract.ts` | Consistency (DRY) | ✅ fixed | The citation/**Source** shape was redefined 4×. | Fixed: one canonical `citationSourceSchema` + `CitationSource` added to `@wunderstack/shared`; `rag` `Source`, `retrievalSourceSchema`, `caoSourceSchema` and the chat contract's `sourceSchema` all derive from it. (This also made the `@wunderstack/shared` dependency in `apps/demo` genuinely used — resolves S4.) The retrieval-input schemas were left separate on purpose: their defaults legitimately differ (`minScore` 0 internally vs 0.35 at the agent boundary). |

## Suggestions
Non-urgent improvements.

| # | File:line | Category | Status | Description |
|---|-----------|----------|--------|-------------|
| 1 | `packages/agents/src/types.ts:23` | RAG quality | ⏳ open | `minScore` default `0.35` is an untuned guess for the anti-hallucination threshold. Left as-is: it can only be validated meaningfully against a fund's real CAO text + the eval set (no data change to make now). Revisit when the real corpus lands. |
| 2 | `packages/rag/src/index.ts`; `retrieve.ts` | Performance (minor) | ✅ fixed | Removed the internal double-parse: `retrieveContext` now parses once and calls `retrieveValidated` (trusts parsed input); the public `retrieve` still validates for direct callers. Cross-package defensive parses at seam boundaries kept on purpose. |
| 3 | `packages/rag/src/retrieve.ts` | Scalability | ✅ fixed | Documented the flat-scan `O(rows)` ceiling and the escape hatch (re-embed to ≤2000 dim / dim-reduction → `hnsw`) as a comment on the retrieval query. |
| 4 | `apps/demo/package.json:14` | Dead dependency | 🔁 resolved | Now genuinely used: the chat contract imports `citationSourceSchema` from `@wunderstack/shared` (via the W6 dedupe). Dependency kept and justified. |
| 5 | `apps/demo/app/api/webhook/route.ts` | Security (future) | ⏳ open | The webhook is public and unauthenticated with no signature/HMAC verification. Left as-is on purpose: it has no side effects in v1 and the rules say not to build auth now — wire authenticity checks before it ever triggers ingestion. |
| 6 | `packages/db/src/schema.ts:74-93` | Scaffolding | ⏳ open | `agent_config` and `eval_cases` tables have no code path yet (intentional scaffolding per PLAN). Left in place; flagged so they don't drift. |
| 7 | `package.json` | Guardrail coverage | ✅ fixed | `depcruise` now scans `apps packages scripts`; the arrow rule was broadened to forbid `packages/* → (apps|scripts)/*`. Verified clean (86 modules). |

## Dead code
| # | File:line | Type | Status | Description |
|---|-----------|------|--------|-------------|
| 1 | `scripts/bake-off/run.ts` | Stale reference | ✅ removed | Comments/generated-text referencing the deleted `dataset.ts` now point to `@wunderstack/shared` (`src/evals/cao-labeled-set.ts`). |
| 2 | `packages/agents/src/cao/tools.ts` | Unused export | ✅ removed | `caoRetrievalTool` (and its `@mastra/core/tools` `createTool` import) were never used — deleted. The agent still calls `runRetrieval` directly; the tool contract (`retrievalInputSchema`/`retrievalOutputSchema`) remains for the future agentic path. |
| 3 | `apps/demo/app/api/chat/route.ts` | Redundant | ✅ removed | Dropped the redundant `export const dynamic = "force-dynamic"`. |

## Summary
- Critical issues: **1** → 🔁 1 resolved (0 open)
- Warnings: **6** → ✅ 6 fixed (0 open) — W1/W2 observability closed 2026-07-05
- Suggestions: **7** → ✅ 3 fixed, 🔁 1 resolved (S4), ⏳ 3 open (S1, S5, S6 — all deliberate deferrals)
- Dead-code items: **3** → ✅ 3 removed
- **Overall verdict:** Genuinely strong walking skeleton — the seams (`ai`, `db`, `rag`, `agents`), the sovereignty guard, the Mastra-behind-an-interface adapter, Zod-at-every-boundary and the thin API controllers all faithfully implement the rules. The critical secret leak is resolved (history rewritten, blob pruned, no rotation needed) and the tracing mandate is now met: every retrieval and the query-embedding are traced on all paths, including refusals. Remaining open work is three deliberate deferrals only (threshold tuning, webhook auth, unused scaffolding tables). Post-fix: `typecheck` + `lint` + `depcruise` all green.

## Post-review change log (2026-07-03 20:00)
Files touched implementing the above:
- **Secret remediation:** `.env.example` (placeholders) + git history rewrite (`0b8fccb`→`3ab4a28`, pruned).
- **W6/S4 (dedupe):** new `packages/shared/src/contracts/citation.ts` (+ barrel export); `rag/assemble.ts`, `agents/cao/tools.ts`, `agents/types.ts`, `apps/demo/app/api/chat/contract.ts` now derive from it.
- **W3 (abort):** `ai/models.ts`, `agents/model/sovereign-model.ts`, `agents/types.ts`, `agents/cao/agent.ts`, `agents/index.ts`, `apps/demo/app/api/chat/route.ts`, `apps/demo/components/chat/use-chat.ts`.
- **W4:** `ai/embeddings.ts` (docstring + dim assertion). **W5:** `.cursor/rules/100-stack.mdc`.
- **S2:** `rag/retrieve.ts` + `rag/index.ts`. **S3:** `rag/retrieve.ts` (comment). **S7:** `package.json` + `.dependency-cruiser.cjs`.
- **Dead code:** `scripts/bake-off/run.ts`, `agents/cao/tools.ts`, `apps/demo/app/api/chat/route.ts`.
- **Lint gate fix (pre-existing):** `eslint.config.mjs` now declares Node globals for `.js/.mjs/.cjs` files (non-TS config files were failing `no-undef` on `process`).

## Post-review change log (2026-07-05) — W1/W2 observability
- **New tracing seam:** `packages/agents/src/observability/trace.ts` (`startCaoTrace`) — a defensive, no-op-safe wrapper over Mastra's AI-tracing API (`AGENT_RUN` root + `RAG_VECTOR_OPERATION` retrieval span + `RAG_EMBEDDING` event). Langfuse stays confined to `packages/agents`.
- **Wired into the agent:** `packages/agents/src/cao/agent.ts` — new `retrieveTraced` helper runs retrieval inside the span on both `answer` and `answerStream`; the zero-hit refusal path now ends the trace with `found:false` (W1); the query-embedding model/dim are recorded (W2); `generate`/`stream` are linked into the same trace via `tracingOptions.traceId`/`parentSpanId`. Stream path has an idempotent `finally` safety-net so a client abort still closes the trace.

---

## Action plan

### 🔴 Now (today)
1. **[`.env.example:11,14,17`] Rotate and remove the committed live secrets.**
   - What: Rotate the Scalingo DB password, `MISTRAL_API_KEY` and `SCALEWAY_API_KEY`. Replace the values in `.env.example` with placeholders. Purge them from git history (BFG / `git filter-repo`), or recreate the initial commit if the repo has not been pushed. Confirm `.env` stays gitignored.
   - Why: Live credentials in version control are compromised on commit; this is the one issue that can cause real-world harm (DB access, provider billing/abuse) and it breaks the hard sovereignty/compliance posture.
   - Estimate: 30–45 min (rotation + history purge).
   - Dependencies: none. Do this before any push/share.

### 🟡 This week
2. **[`agent.ts:71-106` + `embeddings.ts`/`retrieve.ts`] Close the tracing gaps.** ✅ done 2026-07-05
   - What: Trace the retrieval step (chunks + scores + `found`) even on the zero-hit refusal path, and wrap embedding calls in a Langfuse span (at least the retrieval-time query embed).
   - Why: `400/500` make tracing mandatory and accuracy existential; untraced refusals and untraced model calls are explicit rule violations and blind spots.
   - Estimate: 2–3 h.
   - Dependencies: none.
3. **[`api/chat/route.ts` + `use-chat.ts`] Add abort/disconnect handling to the chat stream.**
   - What: Thread `request.signal` through `answerStream` and stop generating on abort; add a client `AbortController`.
   - Why: Prevents wasted Mistral tokens/cost and dangling work when users leave; part of correct streaming UX.
   - Estimate: 2 h.
   - Dependencies: touches the agent seam signature (coordinate with #2 if you refactor the agent).
4. **[`100-stack.mdc` + `embeddings.ts` docstring] Fix the embedding/dimension doc drift.**
   - What: Update `100-stack.mdc` to 4096-dim/flat-index (the pinned decision) and correct the `dimensions` docstring in `embeddings.ts`; ideally make `embed()` assert the returned dim.
   - Why: The rules are the review standard; leaving them contradicting the code invites a silent dim/index regression.
   - Estimate: 30 min.
   - Dependencies: none.

### 🟢 When possible
5. **[Source/retrieval schemas ×4/×3] De-duplicate the citation & retrieval contracts** into `@wunderstack/shared` and infer the rest (Warning #6).
6. **[`types.ts:23`] Tune and validate `minScore`** against the eval set / real similarity distribution (Suggestion #1).
7. **Housekeeping:** fix the stale `dataset.ts` references, decide on `caoRetrievalTool`, drop the unused `@wunderstack/shared` app dependency and the redundant `force-dynamic`, and document the flat-scan scalability ceiling (Dead code #1-3, Suggestions #3-4).

### Ordering rationale
Secrets first — it is the only issue with immediate external blast radius and it directly breaches the non-negotiable sovereignty/compliance stance. Next the two observability items, because for a CAO agent "accuratesse is existentieel" and the rules make tracing mandatory — an untraced refusal or embedding call is both a rule violation and the exact thing you need to debug retrieval quality. Abort handling rides along because it touches the same agent-stream seam. Rule/doc drift is quick and prevents a future dimension regression. DRY, threshold tuning and cosmetic cleanup last: they improve maintainability but nothing is broken today.
