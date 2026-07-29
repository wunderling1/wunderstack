# Code Review — 2026-07-29 14:39

## Scope
- **Time window:** last 24h (`SCOPE_SINCE="1 day ago"`) — **no commits** in that window; fell back to uncommitted + staged changes only
- **Branch:** `fix/eval-gate-enforcement` (current)
- **Uncommitted included:** yes
- **Commits in scope:** 0 (nearest commits are ~7 days old, outside the window)
- **Changed files:** 79 unique paths (49 modified unstaged, 14 staged renames, 16 untracked)
- **Note:** Report saved under `docs/reviews/` to match the staged docs reorganization (`code-reviews/` → `docs/reviews/`). A copy also lives at `code-reviews/` per the review protocol.

## Changed files

### Uncommitted changes (working tree) — 2026-07-29 — local WIP
> No commit authors/timestamps (uncommitted). Theme: chat-stream robustness, G4 citation coupling, multi-query follow-up retrieval, grounded follow-up chips, UI primitives, docs path cleanup.

#### Runtime / stream robustness
- `apps/runtime/app/api/chat/route.ts` (+115 / −~70 net refactor)
- `apps/runtime/lib/chat-stream.ts` (new, +128)
- `apps/runtime/lib/chat-stream.test.ts` (new, +232)
- `apps/runtime/app/api/chat/contract.ts` (+5)
- `apps/runtime/app/api/webhook/contract.ts` (+2 / −2 comment path)
- `apps/runtime/package.json` (+test:unit, tsx)
- `apps/runtime/proxy.ts` (comment path)
- `apps/runtime/next-env.d.ts` (auto-generated path flip)

#### Agents / CAO
- `packages/agents/src/cao/agent.ts` (+192 / −~40)
- `packages/agents/src/cao/agent.test.ts` (+131)
- `packages/agents/src/cao/condense.ts` (+50)
- `packages/agents/src/cao/condense.test.ts` (+23)
- `packages/agents/src/cao/generate-answer.ts` (+119)
- `packages/agents/src/cao/generate-answer.test.ts` (+113)
- `packages/agents/src/cao/prompt.ts` (+11 — `UNVERIFIABLE_MESSAGE`)
- `packages/agents/src/cao/tools.ts` (+3)
- `packages/agents/src/cao/verify-citations.ts` (+6)
- `packages/agents/src/cao/suggest-follow-ups.ts` (new, +198)
- `packages/agents/src/cao/suggest-follow-ups.test.ts` (new, +64)
- `packages/agents/src/types.ts` (+11)
- `packages/agents/src/index.ts` (comment path)
- `packages/agents/src/observability/trace.ts` (+55 — `startModelCall`)
- `packages/agents/src/evals/answer-floors.ts` (+5)
- `packages/agents/src/evals/cao.eval.ts` (+240)
- `packages/agents/src/evals/gates.ts` (+2 / −2)

#### AI / RAG / shared
- `packages/ai/src/models.ts` (+28 — `REQUEST_TIMEOUT_MS`)
- `packages/rag/src/index.ts` (+43 — multi-query retrieve)
- `packages/rag/src/retrieve.ts` (+6 — `additionalQueries`)
- `packages/rag/src/passage.ts` (+78 — overlap/heading dedup)
- `packages/rag/src/merge-chunks.ts` (new, +19)
- `packages/rag/src/merge-chunks.test.ts` (new, +34)
- `packages/shared/src/env.ts` (+6)
- `packages/shared/src/env.test.ts` (+24)
- `.env.example` (+17)

#### Playground / embed / UI
- `apps/playground/components/chat/use-chat.ts` (+92)
- `apps/playground/components/chat/chat.tsx` (+40 / −~20)
- `apps/playground/components/chat/message-list.tsx` (+118)
- `apps/playground/components/chat/starters.tsx` (+75)
- `apps/playground/components/chat/follow-ups.tsx` (new, +42)
- `apps/playground/components/chat/fund-selector.tsx` (+12)
- `apps/playground/lib/fund-theme.ts` (+69)
- `apps/playground/lib/runtime-api.ts` (new, +14)
- `apps/playground/app/page.tsx`, `app/widget/page.tsx`, `app/ui/page.tsx`, `app/api/chat/contract.ts`, `AGENTS.md`, `proxy.ts`, `next-env.d.ts`
- `packages/embed/src/embed-app.tsx` (+31), `packages/embed/src/types.ts` (+4)
- `packages/ui/src/index.ts` (+32), `styles.css`, `tokens/semantic.css`
- `packages/ui/src/primitives/{accordion,breadcrumbs,checkbox,pill,radio-group,select,tabs,textarea}.tsx` (new)
- `apps/dashboard/app/(admin)/admin/embed/page.tsx` (+5 — Textarea)
- `docs/golden-set-cocreation.md`, `pnpm-lock.yaml`

### Staged changes — docs reorganization (renames only, 0 line delta)
- `eval-gate-audit.md` → `docs/audit/eval-gate-audit.md`
- `PLAN*.md` → `docs/plans/PLAN*.md` (7 plans)
- `code-reviews/*` → `docs/reviews/*` (5 reviews + latest)
- `security-audits/*` → `docs/security/*` (2 audits)

## Critical issues

Bugs, security or sovereignty problems that must be fixed now.

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| 1 | `apps/runtime/lib/chat-stream.ts:22-24` | Correctness / Streaming | `isTerminalChatEvent` treats `citations` as terminal, which **stops NDJSON heartbeats** while the agent still awaits `maybeSuggestFollowUps` and then emits `followups` + `done` (`agent.ts:576-593`). Client inactivity watchdog defaults to 20s (`use-chat.ts:54-62`) and keys off *any* bytes including heartbeats. A slow/stalled follow-up call (>20s silence) aborts the fetch: answer may already be shown, but **`done`/`traceId`/`followups` are lost** (no feedback, no chips). Turn budget (45s) and provider timeout (60s) are both longer than the client inactivity window. | Narrow “terminal for heartbeat purposes” to `done` \| `error` only (or keep heartbeats until `done`). Add a regression test: citations → slow gap → followups → done must still emit heartbeats and must not trip the client watchdog. Optionally emit `done` (with `traceId`) immediately after citations and send follow-ups as a best-effort post-`done` event — or raise client inactivity / keep heartbeats through the follow-up phase. |

## Warnings

Not direct bugs, but they hurt quality, consistency or scalability.

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| 1 | `packages/rag/src/index.ts:30-47` | Performance | Extra retrieval queries for elliptical follow-ups run **sequentially** (`await` in a loop). Each call embeds + searches; multi-turn latency roughly doubles before generation even starts, eating the 45s turn budget. | `Promise.all` the distinct rewritten queries (same `fund`/`topK`/`minScore`), then `mergeRetrievedChunks`. Cap `additionalQueries` length in Zod (e.g. `.max(2)`). |
| 2 | `apps/playground/lib/fund-theme.ts:59-73` | Architecture (control-plane vs data-plane) | Fund-specific starters for `elektronische-detailhandel` were removed; every fund now inherits the same large `DEFAULT_STARTER_CATEGORIES`. Violates “fund configuration = data” / white-label theming that this file previously expressed. | Restore per-fund `starterCategories` (or a partial override) for ETD; keep the shared default only as fallback. |
| 3 | `packages/agents/src/cao/suggest-follow-ups.ts:15` | Consistency / cost | Follow-ups use floating alias `mistral-small-latest`. Prior eval/sovereignty hygiene pins generator/judge to dated ids (`mistral-small-2603` / `mistral-large-2512`). A silent upstream retarget of `-latest` changes production behaviour without a deliberate bump. | Pin `FOLLOW_UP_MODEL = "mistral-small-2603"` (still EU / in `MODEL_REGISTRY`). |
| 4 | `apps/playground/components/chat/use-chat.ts:56-62` | Consistency (Zod-on-env) | `NEXT_PUBLIC_CHAT_INACTIVITY_MS` is parsed ad-hoc with `Number(...)`; server twin vars go through `packages/shared` Zod (`env.ts:91-96`). Documented in `.env.example` but not schema-validated. | Add an optional Zod coerce in a client-safe config helper, or document that public Next env is intentionally local-validated and mirror the same bounds (positive, max). |
| 5 | `packages/agents/src/evals/cao.eval.ts:369-391` | Performance / cost (evals) | `rankPassageIdsForQueries` re-embeds **all** `goldenPassages` on every call, and embeds each query sequentially. `multiTurnServeChecks` + condensation checks will amplify Scaleway spend/latency. | Embed the passage corpus once per gate run; batch or parallelize query embeds; reuse vectors across cases. |
| 6 | `packages/agents/src/cao/agent.ts` ↔ `cao.eval.ts` | Architecture | Eval imports `verifyAndBuild` from `agent.ts`, which also constructs the Mastra `Agent`. Couples the meetlat to the full agent module (Mastra load / future circular risk). `700-evals.mdc` wants careful, intentional eval edits — this is fine if deliberate, but the seam is fat. | Extract `verifyAndBuild` / `settledAnswerBody` into a small `verify-and-build.ts` (or similar) that both agent and eval import. |
| 7 | Chat contracts ×3 | Consistency | `followups` was added in parallel to `apps/runtime/.../contract.ts`, `apps/playground/.../contract.ts`, and `packages/embed/src/types.ts`. Drift risk already known; third copy increases it. | Acceptable under rule-of-three *debt*, but add a single shared Zod schema in `@wunderstack/shared` (or a tiny `@wunderstack/chat-contract`) on the next touch — or a CI check that the three discriminators stay equal. |
| 8 | `apps/playground/next-env.d.ts`, `apps/runtime/next-env.d.ts` | Dead / noise | Auto-generated Next path flip (`.next/types` → `.next/dev/types`). Easy to commit by accident and churn across machines. | Revert from the commit / keep gitignored or restore HEAD before committing. |
| 9 | `packages/ui` new primitives vs `PLAN-ui-ecosystem.md` Fase 2 | Scope | Fase 2 DoD asks to finish **Table** + **Dialog** (+ trust-pattern reorder). WIP adds Accordion, Tabs, Breadcrumbs, Checkbox, Radio, Pill, Select, Textarea — several only used on the `/ui` preview. Select/Textarea have real consumers (fund selector, dashboard CORS); the rest look anticipatory. | Ship Select + Textarea (+ token `--radius-input`) with consumers; park Accordion/Tabs/Breadcrumbs/Radio/Checkbox/Pill until a real screen needs them, or update the plan DoD explicitly. |

## Suggestions

Non-urgent improvements.

| # | File:line | Category | Description |
|---|-----------|----------|-------------|
| 1 | `apps/playground/components/chat/message-list.tsx:47-52` | UX honesty | Progress step for `generating` is labelled “Bronvermelding controleren” while generation+repair still dominate that phase (comment admits cosmetic). Prefer “Antwoord formuleren” / split a real verify phase later. |
| 2 | `apps/playground/components/chat/use-chat.ts:40-41` | Dead state | `retrievedCount` is still written from `status` events but no longer rendered after the checklist redesign. |
| 3 | `packages/agents/src/cao/suggest-follow-ups.ts:192` | Duplication | `addUsage` exists here and (privately) in `generate-answer.ts` with slightly different types. Fine under rule-of-three; merge on the third shared call site. |
| 4 | `apps/playground/components/chat/starters.tsx` / `follow-ups.tsx` | Design system | Category pills and follow-up chips reimplement pill styling instead of using new `@wunderstack/ui` `Pill` (or Button variants). |
| 5 | `packages/rag/src/passage.ts:115-181` | Correctness edge | Overlap dedup (`MIN_DEDUP_OVERLAP = 16`) is O(n·k) on passage length; fine for article-sized text. Consider a unit test with real overlapping chunk fixtures so a future chunker change doesn’t reintroduce duplicated citations. |
| 6 | `packages/agents/src/cao/agent.test.ts:155-165` | Test hygiene | `settledAnswerEvents` still constructs `found: true` with `citations: []` — allowed at the emit seam, forbidden after `verifyAndBuild`. OK if documented; optionally assert production callers never pass that combo. |
| 7 | Staged doc renames | Process | Renames are clean (0 delta). Commit them separately from behaviour WIP per `250-move-protocol.mdc` (move ≠ behaviour in the same PR). |

## Dead code

| # | File:line | Type | Description |
|---|-----------|------|-------------|
| 1 | `apps/playground/components/chat/use-chat.ts:40-41`, status handler ~254 | Unused state | `retrievedCount` set but never read by UI after checklist change. |
| 2 | `apps/playground/next-env.d.ts` / `apps/runtime/next-env.d.ts` | Generated churn | Should not be part of the feature diff. |
| 3 | — | — | No leftover `console.log` / TODO / `any` spotted in the new production paths reviewed (`suggest-follow-ups`, `chat-stream`, `merge-chunks`, `runtime-api`). Eval still uses intentional `console.log` progress (pre-existing pattern). |

## Summary
- Critical issues: 1
- Warnings: 9
- Suggestions: 7
- Dead-code items: 2–3
- Overall verdict: Strong, rule-aligned WIP — G4 citation coupling, stream timeouts, multi-query follow-up retrieval, and grounded follow-up chips are well tested and sovereign-by-default. Fix the **heartbeat/`citations`-as-terminal** interaction before shipping; then parallelize multi-query retrieve and restore per-fund starter data.

---

## Action plan

Concrete, prioritized steps to resolve the issues, grouped by priority with a time estimate
and dependencies.

### 🔴 Now (today)
1. **`apps/runtime/lib/chat-stream.ts:22` — Keep heartbeats until `done`/`error`**
   - What: Stop treating `citations` as heartbeat-terminal (or keep sending `\n` until `done`). Add a unit test for citations → delay → followups → done with heartbeats still firing; manually verify client inactivity does not fire during a slow follow-up.
   - Why: New follow-up phase introduced a silent gap after citations; client 20s watchdog is shorter than server budgets.
   - Estimate: 30–45 min
   - Dependencies: none

2. **Smoke the full stream path once heartbeats are fixed**
   - What: One playground turn that receives citations, followups, and done; confirm feedback (`traceId`) and chips render; confirm turn-budget timeout still emits a clean `error`.
   - Why: Guards against regressions in `pipeChatNdjsonStream` + `use-chat`.
   - Estimate: 20 min
   - Dependencies: waits on #1

### 🟡 This week
3. **`packages/rag/src/index.ts:30-47` — Parallelize additional retrievals**
   - What: `Promise.all` distinct queries; Zod-cap `additionalQueries`.
   - Why: Multi-turn latency and turn-budget headroom.
   - Estimate: 45–60 min
   - Dependencies: none (independent of #1)

4. **`packages/agents/src/cao/suggest-follow-ups.ts:15` — Pin follow-up model**
   - What: Use `mistral-small-2603` instead of `-latest`.
   - Why: Same pinning discipline as generator/judge; avoid silent retargets.
   - Estimate: 10 min
   - Dependencies: none

5. **`apps/playground/lib/fund-theme.ts` — Restore fund-specific starter categories**
   - What: Put ETD (and future funds) overrides back as data.
   - Why: Control-plane vs data-plane / white-label contract.
   - Estimate: 20–30 min
   - Dependencies: none

6. **Split commits: doc renames vs behaviour**
   - What: Land staged `docs/` renames in their own PR/commit; keep agent/RAG/UI WIP separate (`250-move-protocol.mdc`).
   - Why: Reviewability and green intermediate states.
   - Estimate: 15 min process
   - Dependencies: none

7. **Eval embed reuse in `rankPassageIdsForQueries`**
   - What: Embed golden passages once per multi-turn gate; reuse across cases/queries.
   - Why: Cost/latency of the new G2-multi-turn serve checks.
   - Estimate: 45–90 min
   - Dependencies: none

8. **Drop or quarantine unused UI primitives / `next-env.d.ts`**
   - What: Revert Accordion/Tabs/Breadcrumbs/etc. if no consumer yet; revert `next-env.d.ts` noise; keep Select/Textarea.
   - Why: Scope discipline vs PLAN-ui Fase 2 DoD.
   - Estimate: 30 min
   - Dependencies: none

### 🟢 When possible
9. **Extract `verifyAndBuild` seam for eval + agent**
   - What: Thin module both import.
   - Why: Keep Mastra behind the agents package without loading it from eval helpers.
   - Estimate: 1–2 h

10. **Unify chat event Zod schema**
    - What: One shared contract for runtime / playground / embed.
    - Why: Prevent `followups` (and future events) from drifting.
    - Estimate: 1–2 h

11. **Remove `retrievedCount` or show it again**
    - What: Delete the field or surface “N passages” in the checklist.
    - Why: Dead state cleanup.
    - Estimate: 15 min

12. **Use `Pill` for starters/follow-ups**
    - What: Replace local pill classes with `@wunderstack/ui` Pill where variants fit.
    - Why: Design-system consistency.
    - Estimate: 30 min

### Ordering rationale
Fix stream heartbeats first so follow-ups and `traceId` cannot be race-aborted by the client watchdog — that is user-visible and feedback-breaking. Parallel retrieval and model pinning next protect latency and sovereignty hygiene without blocking the ship. Fund starters and commit hygiene keep architecture/process clean. Eval cost and UI/schema cleanup can wait until the streaming path is solid.

---

**Positive notes (not findings):** Sovereignty path remains Mistral/EU (`FOLLOW_UP_MODEL` via `@wunderstack/ai`); Langfuse gets `startModelCall` for follow-ups; routes stay thin (logic in `chat-stream` + agents); Zod on new stream event and env knobs; G4 coupling + repair option-b + passage dedup are well unit-tested; playground stays off `@wunderstack/agents` and uses `runtimeApiHeaders` for tenant key.
