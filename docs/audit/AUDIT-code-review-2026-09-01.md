# Code Review — 2026-09-01 20:20

## Scope
- **Time window:** last 24 hours (`--since="1 day ago"`, default)
- **Branch:** `main` (current)
- **Uncommitted included:** yes
- **Commits in scope:** 17 (all authored by ce1zer, 2026-09-01 13:14–16:16 +0200)
- **Changed files:** 165 unique (158 in commits + 7 additional uncommitted paths)
- **Standards:** existing patterns, `.cursor/rules/*.mdc`, `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/plans/PLAN.md`, plus accepted IA decisions (`DECISION-dashboard-ia.md` S7, `DECISION-dashboard-indeling.md`)
- **Untracked (noted, not reviewed as product code):** `.cursor/settings.json` (Figma plugin flag), `claude/verificatie-gate-h1.md`
- **Report location:** `docs/audit/AUDIT-code-review-2026-09-01.md` (filed alongside `AUDIT-dashboard-indeling-2026-09-01.md`).

This window is the dashboard-indeling / turn-outcome slice: classified events, fund console IA, conversation grouping, knowledge-gap signals, corpus fingerprint approval, embed session stability, and a reduced-motion token. Uncommitted work is a Next.js 16.2.9 → 16.3.4 bump plus sidebar icons and a prefetch-loop fix.

## Changed files

Grouped per commit. Line counts are `--numstat` (insertions / deletions).

### Commit `03f6ebe` — 2026-09-01 13:14:57 +0200 — ce1zer
> feat(dashboard): fund console on classified turn outcomes

Large IA + outcome-layer slice (~100 files). Highlights:

- **Dashboard routes / chrome:** fund + admin console pages (`gesprekken`, `signalen`, `instellingen`, agent corpus/publication/scenarios), `components/chrome/*`, `components/fund/*` (overview, conversations, signals, settings, corpus, publication), `lib/*` loaders/nav/period, `middleware.ts`
- **Runtime:** `apps/runtime/app/api/chat/route.ts`, `lib/chat-stream.test.ts`, `lib/mcp-ask-cao.test.ts`, `lib/mcp-server.ts`
- **Agents:** `packages/agents/src/runtime/create-agent.ts` (+ tests/eval), `packages/agents/src/types.ts`
- **Analytics:** `conversations.ts`, `outcomes.ts`, `signals.ts`, `retrieval-strength.ts`, `event.ts`, `corpus.ts`, `index.ts` (+ tests)
- **DB:** `packages/db/src/fund-ddl.ts`, `fund-environment.ts`, `schema/fund/interaction-events.ts`, `agent-instances.ts`, `scripts/db/migrate-fund-schemas.ts`
- **Shared:** `packages/shared/src/contracts/interaction-outcome.ts`, `chat.ts`, `browser.ts`
- **Docs:** `docs/decisions/DECISION-dashboard-indeling.md`, `IMPLEMENTATIEPROMPT-dashboard-indeling.md`, `docs/audit/AUDIT-dashboard-indeling-2026-09-01.md`

Removed: `activity-panels.tsx`, `area-tab-nav.tsx`, `kpi-tiles.tsx`, `top-bar.tsx`, `lib/fund-tabs.ts` (+ test).

### Commit `9cb68e1` — 2026-09-01 13:19:02 +0200 — ce1zer
> fix(analytics): coerce measurementStartedAt to a Date
- `packages/analytics/src/outcomes.ts` (+9 / -2)

### Commit `110822c` — 2026-09-01 13:37:02 +0200 — ce1zer
> fix(dashboard): read admin overviews from the outcome layer
- `apps/dashboard/AGENTS.md` (+3 / -2)
- `apps/dashboard/app/(admin)/admin/funds/page.tsx` (+17 / -21)
- `apps/dashboard/app/(admin)/admin/page.tsx` (+36 / -39)
- `apps/dashboard/lib/admin-overview.ts` (new, +44)
- `apps/dashboard/lib/admin-overview.test.ts` (new, +83)
- `packages/analytics/src/outcome-activity.ts` (new, +78)
- `packages/analytics/src/outcomes.ts` (+29 / -12)
- `packages/analytics/src/index.ts` (+2)
- `packages/analytics/src/fund-environment.integration.test.ts` (+12 / -1)

### Commit `c6ea9dc` — 2026-09-01 14:00:28 +0200 — ce1zer
> chore(agents): drop dead turn-outcome imports
- `packages/agents/src/cao/agent.test.ts` (+1 / -1)
- `packages/agents/src/types.ts` (+1 / -7)

### Commit `2595ac2` — 2026-09-01 14:00:41 +0200 — ce1zer
> fix(analytics): keep exercise turns out of the outcome layer
- Dashboard overview + admin-overview loaders/tests
- `apps/runtime/lib/instance-scope.ts` (+22 / -4) + test
- `apps/runtime/lib/mcp-server.ts` (+5 / -4)
- `packages/analytics/src/event.ts` (+12 / -4) + tests
- `packages/analytics/src/conversations.ts` (+34 / -1)
- `docs/decisions/DECISION-dashboard-indeling.md` (+11 / -6)
- `packages/analytics/AGENTS.md` (+5)

### Commit `86bb3a7` — 2026-09-01 14:12:01 +0200 — ce1zer
> fix(dashboard): show each agent its own corpus version
- `apps/dashboard/components/fund/overview.tsx` (+1 / -1)
- `apps/dashboard/lib/overview-load.ts` (+5 / -2)
- `apps/dashboard/lib/overview.ts` (+8)
- `packages/analytics/src/corpus.ts` (+4)

### Commit `c0ca0a0` — 2026-09-01 14:14:26 +0200 — ce1zer
> docs(decisions): define the corpus fingerprint (A5)
- `docs/decisions/DECISION-dashboard-indeling.md` (+32 / -6)

### Commit `8e806b7` — 2026-09-01 14:25:33 +0200 — ce1zer
> feat(analytics): approve a corpus by fingerprint, not by one document version
- `apps/dashboard/app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/actions.ts` (+8 / -14)
- `apps/dashboard/components/fund/agent-corpus-panel.tsx` (+24 / -14)
- `apps/dashboard/components/fund/approve-corpus-form.tsx` (+13 / -8)
- `apps/dashboard/lib/agent-profile.ts` (+23 / -9)
- `apps/dashboard/lib/agent-tabs.test.ts` (+26 / -7)
- `packages/analytics/src/corpus.ts` (+28) + `corpus.test.ts` (new, +56)
- `packages/analytics/src/index.ts` (+6 / -1)
- `docs/decisions/DECISION-dashboard-indeling.md` (+4 / -3)

### Commit `b5a0d59` — 2026-09-01 14:34:29 +0200 — ce1zer
> fix(dashboard): ask decideAccess who may switch funds
- `apps/dashboard/lib/switcher-options.ts` (+5 / -6)
- `apps/dashboard/lib/switcher-options.test.ts` (+13)

### Commit `18ffc8b` — 2026-09-01 14:34:29 +0200 — ce1zer
> fix(ui): give nav pills and sidebar links the house focus ring
- `apps/dashboard/components/chrome/dashboard-sidebar.tsx` (+8 / -5)
- `packages/ui/src/primitives/nav-pills.tsx` (+6 / -1)

### Commit `793c375` — 2026-09-01 14:34:47 +0200 — ce1zer
> fix(dashboard): count knowledge gaps, not refused turns
- `apps/dashboard/components/fund/overview.tsx` (+16 / -6)
- `apps/dashboard/lib/overview-load.ts` (+7)
- `packages/analytics/src/signals.ts` (+26 / -10)
- `packages/analytics/src/index.ts` (+1)
- `packages/analytics/src/fund-environment.integration.test.ts` (+42 / -1)

### Commit `fa30a03` — 2026-09-01 14:42:43 +0200 — ce1zer
> test(analytics): assert the read layer by running it, not by reading it
- `packages/analytics/src/fund-environment.integration.test.ts` (+63 / -1)
- `packages/analytics/AGENTS.md` (+9)
- `apps/dashboard/lib/existing-routes.test.ts` (+84 / -43)
- `apps/dashboard/lib/overview-d6.test.ts` (+16 / -7)
- `.github/workflows/ci.yml` (+4 / -3)
- Tests that dropped regex-on-source assertions: `conversations.test.ts`, `outcomes.test.ts`, `signals.test.ts`

### Commit `50ea3de` — 2026-09-01 15:44:46 +0200 — ce1zer
> docs(decisions): define vraag and gesprek, and where a conversation ends
- `docs/decisions/DECISION-dashboard-ia.md` (+4 / -1)
- `docs/decisions/DECISION-dashboard-indeling.md` (+68 / -1)

### Commit `8137f2b` — 2026-09-01 15:45:13 +0200 — ce1zer
> feat(analytics): make a conversation a real unit and count questions everywhere
- `packages/analytics/src/conversation-boundary.ts` (new, +107) + test (new, +109)
- `packages/analytics/src/conversations.ts` (+231 / -66) + tests
- Dashboard gesprekken pages, conversation-cards/detail, overview, admin-overview, loaders

### Commit `df52df2` — 2026-09-01 15:45:23 +0200 — ce1zer
> fix(embed): keep one session id per tab instead of one per mount
- `packages/embed/src/embed-app.tsx` (+37 / -5)

### Commit `0f393fe` — 2026-09-01 16:04:36 +0200 — ce1zer
> chore(repo): enforce an allowlist-only root in CI
- `scripts/check-root.sh` (new, +58)
- `.github/workflows/ci.yml` (+3)
- `.gitignore` (+4)
- `AGENTS.md` (+9)
- `package.json` (+1)

### Commit `12791fb` — 2026-09-01 16:16:18 +0200 — ce1zer
> fix(ui): make the skeleton pulse a token so reduced motion reaches it
- `apps/dashboard/components/fund/panel-skeleton.tsx` (+9 / -4)
- `packages/ui/src/styles.css` (+15)
- `packages/ui/src/tokens/primitive.css` (+2)
- `packages/ui/src/tokens/semantic.css` (+4)

### Uncommitted changes
- `apps/dashboard/components/chrome/dashboard-sidebar.tsx` (+30 / -3) — Lucide nav icons; `prefetch={!item.selected}` to stop force-dynamic reload loops
- `apps/dashboard/components/fund/agent-tab-nav.tsx` (+1 / -1) — `prefetch={!selected}`
- `apps/dashboard/components/fund/period-picker.tsx` (+1) — `prefetch={false}`
- `apps/dashboard/package.json` (+2 / -1) — `lucide-react`, `next` 16.2.9 → 16.3.4
- `apps/marketing/package.json`, `apps/playground/package.json`, `apps/roleplay/package.json`, `apps/runtime/package.json` — same Next bump
- `pnpm-workspace.yaml` (+12) — `minimumReleaseAgeExclude` for `next@16.3.4` and `@next/swc-*`
- `pnpm-lock.yaml` (+230 / -193)

## Critical issues

Bugs, security or sovereignty problems that must be fixed now.

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| 1 | `packages/db/src/fund-environment.ts:75-80` + `packages/db/src/fund-ddl.ts:160-180` | Correctness / schema | Fresh funds record `0003_turn_outcome` as applied but never run `turnOutcomeAlterSql`. `createFundEnvironment` uses `provisionDdl(..., false)` → `createEventsExplicitSql`, which creates `outcome` / `outcome_reason` / `retrieved_count` / `top_score` **without** `interaction_events_outcome_check`. Existing funds get the CHECK via `scripts/db/migrate-fund-schemas.ts:54-60`. New funds will never: the ledger already says 0003 is done. The test at `fund-environment.test.ts:51` asserts the record statement and therefore locks the hole in. App Zod still validates inserts; the DB contract this slice introduced does not. | Bake the CHECK (and column defaults) into `createEventsExplicitSql` **or** append `turnOutcomeAlterSql` to `provisionDdl`. Keep recording 0003 only after that SQL is actually in the provision path. Add a test that the provision SQL contains `interaction_events_outcome_check`. |

No sovereignty findings in this window: LLM/embedding calls stay behind `packages/ai`; Mastra stays inside `packages/agents`; chat/MCP remain thin Zod controllers; fund reads go through `@wunderstack/analytics` + `withFundSchema`.

## Warnings

Not direct bugs, but they hurt quality, consistency or scalability.

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| 1 | `apps/dashboard/app/(fund)/gesprekken/` (and admin twin), `signalen/`, `instellingen/`; `apps/dashboard/lib/fund-nav.ts:6-9`; `apps/dashboard/components/fund/overview.tsx:26-27` | Consistency (S7 / 000-core) | Route **folders**, nav **segments**, and TS identifiers (`gesprekken`, `signalen`, `instellingen`) are Dutch. `DECISION-dashboard-ia.md` S7: “Routes English (`/admin/funds`, `fundKey`); UI Dutch.” `000-core.mdc` requires English file and folder names. The indeling prompt and `apps/dashboard/AGENTS.md` documented the Dutch URLs, so the code matches one decision and breaks another. | Rename segments to `conversations`, `signals`, `settings`. Keep Dutch in labels only. Add redirects from the Dutch paths. Rename `OverviewHrefs.gesprekken` → `conversations`, etc. Treat this as a dedicated PR (move protocol: rename first, no behaviour change). |
| 2 | `packages/analytics/src/conversations.ts:41, 302-308, 403-416`; `apps/dashboard/lib/overview-load.ts:164` | Scalability / correctness | `getConversationVolume` caps at `CONVERSATION_TURN_SCAN_CAP` (5000) and returns `truncated`, but overview discards the flag. Questions on the tile come from exact SQL (`getOutcomeBreakdown`). Past the cap: exact questions ÷ undercounted conversations → inflated vragen-per-gesprek — the opposite of the parked-tab fix. Measured volume today is 224 rows, so this is a landmine, not a live lie. `listConversations` has no `truncated` at all. | Plumb `truncated` into `OverviewModel` and show a measurement caveat. Add `truncated` on `ConversationList`. Until paging (audit O-5), assert `!truncated` in the integration test that claims tile = list. |
| 3 | `packages/agents/src/runtime/create-agent.ts:231-239` | RAG faithfulness | After hard-fact and citation-coupling guards, markerless model prose is served (`found: true`) while analytics writes `refused/no_coverage`. The comment at 245-248 documents the split. Hard facts and `[n]` markers are blocked; `"Ja, dat mag volgens de CAO."` is not. PRODUCT_SPEC: below threshold the agent should say it cannot find it instead of fabricating. Embed UI keys off `found`, so the user sees a normal answer. | For claimless output, serve `notFoundMessage` and `found: false` (same as empty retrieval), or treat any assertive sentence without a verified citation as `guard_citation_coupling`. Keep the analytics classification. Add a pipeline test with markerless soft prose. |
| 4 | `apps/dashboard/lib/conversations.ts:123-131`; `apps/dashboard/components/fund/conversation-detail.tsx:32-38`; `conversation-cards.tsx:110` | UX / claim mismatch | Comment says the permalink “lands on” the shared question. `conversationPermalink` emits `/gesprekken/{uuid}` with **no** `#v-{id}` hash, and the detail view never `scrollIntoView`s. `id="v-{uuid}"` + `highlightId` only restyle the row. | Emit `…/${id}#v-${id}` from `conversationPermalink`, and on mount scroll/focus the matching element. |
| 5 | `packages/analytics/src/signals.ts:224-236` vs `218-225` | Correctness | Comment on `countKnowledgeGaps` claims the same drop rules as the list. The list applies `.slice(0, SIGNAL_LIST_LIMIT)` (50); the count does not. Integration equality holds only while gaps ≤ 50. | Return `{ total, items }` and print `total` on the overview, or apply the same cap and document it. Add a test with > 50 groups. |
| 6 | `packages/analytics/src/conversation-boundary.ts:20-36, 75-106` | Conversation boundary | Docs: MCP/API = one question per conversation. `groupIntoConversations` keys only on `(sessionId, agentId, gap)`. Unthreaded labelling is post-hoc. Correctness depends on writers emitting unique `sessionId`s. No regression test for a reused MCP session id. | If `channel` is on the row, force a new group per turn for `UNTHREADED_CHANNELS`. Add a shared-session MCP fixture. |
| 7 | Uncommitted `pnpm-workspace.yaml` + `apps/*/package.json` | Stack policy (100-stack) | `next` 16.2.9 → 16.3.4 via `minimumReleaseAgeExclude` (released ~1 day ago). 100-stack: do not pin days-old releases in a walking skeleton; verify the current stable version before upgrading. Direct `lucide-react` added to dashboard (ask-before-adding). The prefetch fix in the same uncommitted diff is a real bugfix and should land independently of the version bump. | Split: (a) prefetch `false` / `!selected` — merge. (b) Next bump — confirm the CVE/need, keep the exclude temporary, or wait out the age gate. (c) Lucide — accept explicitly in the PR, or key icons without a new dashboard dependency if `@wunderstack/ui` can re-export the set. |
| 8 | Uncommitted `apps/dashboard/components/chrome/dashboard-sidebar.tsx:20-27` | Fragility | `NAV_ICONS` is keyed by **Dutch UI labels**. A label copy change silently drops the icon. | Key by `href` / `segment`, not display string. |
| 9 | `apps/dashboard/components/fund/agent-corpus-panel.tsx:118` | UI correctness | Gate result always uses `Chip variant="refusal"`, including pass/unknown. | Map result → `verified` / `caution` / `refusal`. |
| 10 | `packages/db/src/schema/fund/interaction-events.ts:39` vs `packages/db/src/fund-ddl.ts:175, 362` | Consistency | Drizzle schema uses `real("top_score")`; explicit DDL and the 0003 ALTER use `double precision`. Fresh vs migrated funds can differ. | Pick one type in both paths (prefer `double precision` to match the ALTER). |
| 11 | `apps/dashboard/lib/settings-load.ts:50`; admin `updateCorsAction` origin split | Zod boundary | `fund.theme as SettingsTheme` skips runtime parse. CORS origins are split with no URL/origin schema. | Parse theme with the shared Zod schema; validate each origin (scheme + host) before `updateTenantConfig`. |
| 12 | `apps/dashboard/components/chrome/dashboard-sidebar.tsx:57-87` | Accessibility | Mobile drawer: no focus trap, no Escape-to-close, no `role="dialog"` / `aria-modal`. Backdrop and close control are real `<button>`s with labels — that part is good. | Dialog pattern: trap focus, Escape, restore focus to the menu button. |

## Suggestions

Non-urgent improvements.

| # | File:line | Category | Description |
|---|-----------|----------|-------------|
| 1 | `packages/analytics/src/retrieval-strength.ts:13-24`; copies in `outcomes.ts:173-175` and `signals.ts:115-123` | Consistency | `deriveRetrievalStrength` is only used in tests. Live SQL duplicates the 0.6 threshold. Drift risk. Assert SQL filters against the TS helper, or generate predicates from one module. |
| 2 | `packages/analytics/src/conversations.ts:331-384` | Pagination | Merge of up to 50 grounded + 50 exercise, then re-slice to 50 by time, can hide all exercises when grounded traffic is busy while `exerciseTotal` stays correct. Interleave, or give each kind its own section/limit. |
| 3 | `packages/db/src/schema/fund/interaction-events.ts:50-54` | Indexes | Queries filter `occurred_at` (± `agent_id` / `outcome`) inside a fund schema. Leftmost prefix `(tenant_id, occurred_at)` does not help a pure time scan. Fine at 224 rows; add `(occurred_at)` or `(agent_id, occurred_at)` when windows grow. |
| 4 | `packages/analytics/src/corpus.ts:31-37` | Fingerprint | Approval CAS is sound. Hash omits `agentKey` (caller must filter) and truncates to 12 hex chars (~48 bits). Include `agentKey` in the material; store the full hash even if the UI shows 12 characters. |
| 5 | `packages/analytics/src/kpi.ts:336` | Date coercion | `getAgentActivity` does `new Date(row.lastOccurredAt)` without the NaN guard used for `measurementStartedAt`. Reuse `asDate`. |
| 6 | `apps/dashboard/lib/overview-load.ts:102-141` | Perf | Per grounded agent: extra `getOutcomeBreakdown` + `getRecentInteractions` (N+1). Exercise `sessionCount` is fund-wide, reused on every exercise instance. Batch in analytics; key sessions by agent when a second exercise agent exists. |
| 7 | `apps/dashboard/app/(fund)/page.tsx` (and gesprekken/signalen) | Auth edge | Layout redirects unauthenticated users; pages `return null` without `tenantId`. If layout/page ever diverge, the screen is blank. `redirect("/login")` or `decideAccess`. |
| 8 | `apps/dashboard/middleware.ts:4-15` | Auth seam | Middleware only sets `x-pathname`; auth is layout-only. Intentional for the chrome, easy to miss on a new route. Document in `apps/dashboard/AGENTS.md`. |
| 9 | `packages/embed/src/types.ts` (vs shared `chat.ts`) | Contract lag | Embed local event type still omits `turnOutcome` / `retrievedCount` / `topScore`. Zod strips unknowns so the widget works; the “must stay in sync” comment is stale. |
| 10 | `packages/agents/src/runtime/create-agent.ts:41` | TypeScript | `hits[0]!.score` after a length guard. Narrow instead of `!` (300-typescript). |
| 11 | `packages/db/src/fund-ddl.ts:363` | Migrations | `UPDATE … SET outcome = 'unknown'` rewrites every historical row. Correct for D3 cold-start; a deploy-order race against already-classified writes would wipe them. Ledger prevents a second run. |
| 12 | `apps/dashboard/components/fund/overview.tsx:302-324` vs `lib/conversations.ts:137-148` | Duplication | Local `OutcomeChip` mapping duplicates `outcomeChipVariant` / `outcomeLabel`. |
| 13 | `packages/analytics/src/signals.ts:38-39` | Dormant | `theme` filter on a never-filled column. Leave exported and mark dormant in `AGENTS.md`, or drop until a classifier exists. |
| 14 | Uncommitted prefetch comments | Docs | The force-dynamic prefetch loop fix is non-obvious. One line in `apps/dashboard/AGENTS.md` will save the next person. |

## Dead code

| # | File:line | Type | Description |
|---|-----------|------|-------------|
| 1 | `packages/analytics/src/outcomes.ts:250-252` (`index.ts:66`) | Unused export | `countOutcome` is exported and never referenced (not even in tests). Delete or use it in unit tests instead of hand-built counts. |
| 2 | `packages/analytics/src/retrieval-strength.ts:13` | Unused production path | `deriveRetrievalStrength` is re-exported and test-only; live paths copy the logic in SQL (see suggestion 1). |
| 3 | Uncommitted `dashboard-sidebar.tsx` `MenuIcon` / `CloseIcon` | Overlap | Inline SVGs remain while Lucide is being added for nav. Use Lucide `Menu`/`X` or keep the SVGs and skip Lucide if the icon set stays this small. |

Commented-out code, stray `console.log`, and leftover turn-outcome imports from `c6ea9dc` were not found in the reviewed paths.

## Summary
- Critical issues: 1
- Warnings: 12
- Suggestions: 14
- Dead-code items: 3
- Overall verdict: Strong walking-skeleton slice — outcome classification, conversation grouping, knowledge-gap counting, corpus fingerprint CAS, and the embed session-per-tab fix are coherent and well tested. Fix the fresh-fund CHECK hole before the next provision. Dutch route segments conflict with S7. Do not bundle the Next 16.3.4 age-gate bypass with the prefetch bugfix.

What went well (not in the tables):
- Write path Zod (`writableTurnOutcomeSchema`); exercise agents rejected at the event boundary (`2595ac2`).
- Knowledge gaps = grouped literal question, refused + reason + retrieval `none`, `HAVING ≥ 3` — not refused-turn counts (`793c375`), proven in integration.
- `measurementStartedAt` Date coercion (`9cb68e1`) and “assert the query by running it” (`fa30a03`).
- Fund switcher gated by `decideAccess(..., "admin")` (`b5a0d59`).
- Chat/MCP stay thin controllers; instance fund cannot be overridden by the client.
- Reduced-motion pulse is a token (`12791fb`); nav focus rings match the house pattern (`18ffc8b`).
- Corpus approve form re-derives the fingerprint server-side (CAS), so a stale tab cannot pin the wrong corpus.

---

## Action plan

Concrete, prioritized steps to resolve the issues, grouped by priority with a time estimate and dependencies.

### 🔴 Now (today)

1. **`packages/db/src/fund-ddl.ts:160-180` Put the outcome CHECK on the fresh-fund path**
   - What: Add `interaction_events_outcome_check` (and align `top_score` type with the ALTER) to `createEventsExplicitSql`, **or** append `turnOutcomeAlterSql` inside `provisionDdl`. Keep `recordMigrationSql(..., 0003)` only after that SQL is actually emitted. Extend `fund-environment.test.ts` to assert the CHECK is in the provision statements.
   - Why: The next `createFundEnvironment` will stamp 0003 done and skip the migrator forever. Zod is not a substitute for the constraint this slice introduced.
   - Estimate: 25 min
   - Dependencies: none. Do this before any new fund is provisioned.

2. **Uncommitted: land the prefetch fix without the Next bump**
   - What: Commit `prefetch={!selected}` / `prefetch={false}` on sidebar, agent tabs, and period picker as their own change. Leave `next@16.3.4` + `minimumReleaseAgeExclude` + `lucide-react` out until the age/security need is explicit.
   - Why: The reload loop is a real UX bug. Bypassing the release-age gate for a one-day-old Next patch conflicts with 100-stack and is unrelated.
   - Estimate: 20 min (split) + 15 min (decide whether 16.3.4 is required)
   - Dependencies: none

### 🟡 This week

3. **`apps/dashboard/app/(fund)/gesprekken/` (and twins) English route segments (S7)**
   - What: `git mv` folders to `conversations`, `signals`, `settings`; update `FUND_NAV_ITEMS` and href helpers; add redirects from the Dutch URLs; rename TS identifiers (`gesprekken` → `conversations`). No behaviour change in the same PR (250-move-protocol).
   - Why: Accepted IA rule S7 and 000-core both require English routes/filenames. Dutch belongs in labels only.
   - Estimate: 2–3 h
   - Dependencies: none, but do not mix with outcome/CHECK work

4. **`packages/agents/src/runtime/create-agent.ts:231-239` Do not serve markerless claims as answers**
   - What: Align serve path with analytics: claimless / no verified citation → `notFoundMessage`, `found: false`, keep `refused("no_coverage")`. Add a pipeline test with assertive prose and no `[n]`.
   - Why: CAO accuracy is existential. Analytics already calls this a refusal; the embed still shows a normal answer.
   - Estimate: 1.5 h
   - Dependencies: product confirm that G4’s marker/hard-fact-only rule should tighten

5. **`apps/dashboard/lib/overview-load.ts:164` Surface `truncated`**
   - What: Put `volume.truncated` on `OverviewModel` and the gesprekken list. Show a measurement note when the 5000-row scan cap is hit. Assert `!truncated` in the integration test that claims tile = list.
   - Why: Past the cap the adoption ratio silently inflates. Cheap to tell the truth now; paging (O-5) can wait.
   - Estimate: 45 min
   - Dependencies: none

6. **`apps/dashboard/lib/conversations.ts:123-131` Permalink actually lands on the question**
   - What: Append `#v-${id}` in `conversationPermalink`; `scrollIntoView` + focus the highlighted row on the detail page.
   - Why: The comment and A6 claim a landing target; styling-only highlight fails on long conversations.
   - Estimate: 45 min
   - Dependencies: none (survives the English-route rename if you use the helper)

7. **`packages/analytics/src/signals.ts:232` Make gap count match the list contract**
   - What: Either return `{ total, items }` and show `total` on overview, or document that the tile is “shown gaps” and slice the count. Test > `SIGNAL_LIST_LIMIT`.
   - Why: S11a promised the number you click through to.
   - Estimate: 30 min
   - Dependencies: none

8. **Small UI honesty**
   - What: Gate chip variants (`agent-corpus-panel.tsx:118`); key sidebar icons by segment not label; Zod-parse `fund.theme` and CORS origins.
   - Why: Pass/unknown looking like a refusal, and icons vanishing on copy edits, are cheap to get wrong in front of a fund admin.
   - Estimate: 45 min
   - Dependencies: Lucide landing or not (icon-key fix is independent)

### 🟢 When possible

9. **`packages/analytics/src/conversation-boundary.ts:75` Enforce unthreaded in the grouper**
   - What: Split MCP/API turns even if `sessionId` is reused. Add a shared-session test.
   - Estimate: 1 h

10. **DRY retrieval strength + drop `countOutcome`**
    - What: One source for the 0.6 threshold; delete or use `countOutcome`.
    - Estimate: 45 min

11. **Conversation paging (audit O-5)**
    - What: Replace the 50/5000 soft caps with a cursor. Until then the truncated flag (item 5) is the mitigation.
    - Estimate: 4–6 h
    - Dependencies: item 5

12. **Indexes and N+1**
    - What: `(occurred_at)` / `(agent_id, occurred_at)` when windows grow; batch per-agent breakdowns in analytics.
    - Estimate: 2 h
    - Dependencies: evidence that a window exceeds current 224-row volume

13. **Mobile drawer a11y + layout `redirect` instead of `null`**
    - Estimate: 1.5 h

14. **Embed event types + `hits[0]!` narrowing**
    - Estimate: 30 min

### Ordering rationale

Close the provision CHECK first so a new fund cannot be created without the outcome contract. Split the uncommitted prefetch fix from the Next age-gate bypass so a one-day-old compiler bump does not ride along with a UX fix. Then the S7 route rename as its own move-only PR (it touches many paths and should not mix with behaviour). Serve-path faithfulness next: analytics already tells the truth, the user-facing answer does not. After that, the measurement caveats (`truncated`, permalink scroll, gap-count contract) so the dashboard does not over-claim. Pagination, indexes, and DRY retrieval strength wait until volume or a second repetition forces them.
