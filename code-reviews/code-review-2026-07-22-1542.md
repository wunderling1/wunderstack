# Code Review — 2026-07-22 15:42

## Scope
- **Time window:** since 1 day ago (default) — 2026-07-21 15:42 → now
- **Branch:** `fix/eval-gate-enforcement`
- **Uncommitted included:** yes (staged, unstaged, and untracked)
- **Commits in scope:** 2
- **Changed files:** 17 committed + ~50 tracked-uncommitted + a large set of untracked new files (5 new apps/packages, 5 migrations, docs)

> Note: the review standard is the existing code + `.cursor/rules/*.mdc`, `AGENTS.md`,
> `docs/PRODUCT_SPEC.md`, and the plans (`docs/plans/PLAN-ui-ecosystem.md`,
> `PLAN-gate-restructure.md`). The bulk of the substance is **uncommitted**: a large UI-ecosystem
> refactor (D13–D17) that carves `apps/demo` → `apps/runtime` (API-only), promotes the demo UI to
> `apps/playground`, and adds `apps/dashboard`, `apps/marketing`, `packages/{tenant,analytics,ui,embed}`.

## Changed files

### Commit `de75d7c` — 19 hours ago — ce1zer
> feat(evals): gate-restructure Fase 5-6 — G4 buffer-to-verify seam + docs/claims-hygiene

### Commit `c73ee2f` — 21 hours ago — ce1zer
> feat(evals): gate-restructure Fase 2-4 — typed registry, baseline write-guard, threshold provenance + answerable-only citationCorrectness

Committed files (both commits, 17 total):
- `.cursor/rules/700-evals.mdc`, `PLAN-eval-gates.md`, `PLAN-gate-restructure.md`, `docs/STATUS.md`, `docs/audit/eval-hardening-audit.md`, `docs/eval/GATE-ARCHITECTURE.md`
- `packages/agents/src/cao/agent.ts` (+72/-…), `packages/agents/src/cao/agent.test.ts` (new)
- `packages/agents/src/evals/answer-floors.ts` (new), `answer-floors.test.ts` (new), `gates.ts` (new), `gate-registry.test.ts` (new), `cao.eval.ts`, `judge.ts`, `judge.test.ts`, `report-writer.ts`, `fixtures/baseline.json`

### Uncommitted — staged (pure `git mv`, functionally identical)
- 37 files renamed `apps/demo/**` → `apps/runtime/**` (0 content change on the staged side). Move-only, correct per §0.3 of the plan.

### Uncommitted — unstaged (substantive)
- **Runtime carve-out (UI strip):** deletions of `apps/runtime/app/(demo)`, `app/widget`, `app/globals.css`, `components/chat/*`, `components/ui/button.tsx`, `lib/{fund-theme,utils}.ts`, `public/widget/*` — runtime is now API-only.
- **Runtime features:** `apps/runtime/app/api/chat/route.ts` (+120), `api/feedback/route.ts` (+8), `lib/fund-scope.ts`, `lib/rate-limit.ts`, `next.config.mjs`, `package.json`, `layout.tsx`, `app/page.tsx` (health page).
- **DB:** `packages/db/src/{schema.ts (+100),client.ts (+30),index.ts}`.
- **Agents:** `cao/agent.ts`, `cao/prompt.ts` (framing/tone rewrite), `observability/trace.ts`, `types.ts`, `index.ts`.
- **Shared:** `env.ts`, `index.ts`, `config/generation.ts`.
- **Tooling/rules:** `.dependency-cruiser.cjs`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `Procfile`, `package.json`, `.env.example`, `.cursor/rules/200-architecture.mdc`, `AGENTS.md`.

### Uncommitted — untracked (new)
- **Apps:** `apps/runtime/{AGENTS.md, app/api/config, app/embed.js, lib/cors.ts, lib/embed-auth.ts}`, `apps/playground/**`, `apps/dashboard/**`, `apps/marketing/**`.
- **Packages:** `packages/tenant/**`, `packages/analytics/**`, `packages/ui/**`, `packages/embed/**`, `packages/db/src/tenant-config.ts`, `packages/shared/src/contracts/tenant-config.ts`.
- **Migrations:** `0005_interaction_events.sql`, `0006_analytics_reader_rls.sql`, `0007_analytics_reader_policy.sql`, `0008_hot_ezekiel.sql` (users), `0009_foamy_dorian_gray.sql` (tenant_config) + snapshots.
- **Rules/docs/scripts:** `.cursor/rules/{250-move-protocol,ui-boundaries}.mdc`, `docs/decisions/*`, `docs/plans/*`, `docs/audit/AUDIT-app-inventory.md`, `scripts/check-ui-boundaries.sh`, `scripts/embed-test/`, `scripts/ingest/demo-corpus/`.

## Critical issues

None. No sovereignty breach (default path stays Mistral/Scaleway, no US provider added; new work only adds session/env tags to Langfuse), no auth bypass, no committed secrets, no SQL string-building, no `any`, no `dangerouslySetInnerHTML`.

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| — | — | — | No critical issues found | — |

## Warnings

| # | File:line | Category | Description | Suggestion |
|---|-----------|----------|-------------|-----------|
| 1 | working tree (whole changeset) | Architecture / process | The working tree mixes a pure rename (`apps/demo`→`apps/runtime`, staged) with a large refactor + 5 brand-new apps/packages + 5 migrations (unstaged/untracked). `250-move-protocol.mdc` is explicit: "Verplaatsen en refactoren nooit in dezelfde PR … één soort verandering per PR; elke PR groen op de gates." | Land as separate PRs: (1) the `git mv` rename alone, (2) runtime UI-strip, (3) each new package/app + its migration. Keep each intermediate state green and deployable. |
| 2 | `packages/embed/src/embed-app.tsx:60`, `:~138` | Correctness / Zod boundary | External responses are consumed with type assertions: `GET /config` via `.then((data: EmbedConfig \| null) …)` and the NDJSON stream via `JSON.parse(raw) as ChatEvent`. `300-typescript.mdc` requires Zod on "antwoorden van externe API's". A malformed/hostile `/config` (e.g. `theme.primary`) flows unvalidated into `themeStyle()` and into a `color-mix(... ${primary} ...)` CSS string. | Define local Zod schemas in `packages/embed` (it can't import server-only `@wunderstack/shared`) and `safeParse` both the config payload and each stream event; drop malformed lines/config. |
| 3 | `apps/marketing/app/agents/[slug]/page.tsx:17-18`; `apps/dashboard/lib/release-manifest.ts:74`; `apps/dashboard/app/(admin)/admin/embed/page.tsx:15`; `.env.example` (`AUTH_SECRET`, `RUNTIME_URL`, `EMBED_SCRIPT_BASE`, `EMBED_PUBLIC_KEY`) | Consistency / Zod boundary | New env vars are read via raw `process.env.X ?? "…"` in the new apps, bypassing the established single-parse Zod pattern in `packages/shared/src/env.ts` (`300-typescript.mdc`: "parse `process.env` één keer via een Zod-schema, exporteer typed config"). | Add a small per-app typed env module (Zod) for the app-only vars, or extend the shared schema where appropriate; fail loud at boot rather than silently defaulting to `""`. |
| 4 | `packages/db/migrations/0007_analytics_reader_policy.sql` | Security / data isolation | The RLS policy is `FOR SELECT TO PUBLIC USING (true)` — no per-tenant row restriction. The plan's Fase 3 DoD ("Fund-rol ziet uitsluitend eigen tenant-data") is enforced **only** at the app layer (the fund page scopes by `session.user.tenantId`, which is currently correct). There is no DB-level defense in depth. | Acceptable for single-tenant v1, but note the assumption loudly and add a per-tenant RLS predicate before any instance serves more than one tenant/fund. |
| 5 | `apps/runtime/lib/cors.ts`; `apps/runtime/lib/embed-auth.ts:36-50` | Security (scope clarity) | The CORS allowlist is **browser-enforced only** — the server still executes and streams even for a non-allowlisted origin (the browser just can't read it), and the tenant key is public by design. So origin+key are not a server-side authorization gate; abuse is bounded only by per-IP / per-key rate limits and `RUNTIME_DAILY_CAP`. This matches the code's own comments, but the audit-style comments elsewhere frame `#2` as authorization. | Keep it, but relabel: CORS here is "don't render on random sites," not access control. Ensure `RUNTIME_DAILY_CAP` is actually set on tenant zero (denial-of-wallet is the real control). |

## Suggestions

| # | File:line | Category | Description |
|---|-----------|----------|-------------|
| 1 | `packages/shared/src/config/generation.ts:21` | Consistency | `maxTokens` raised 1024→2048 with good rationale, but the comment used to say it mirrors `@wunderstack/ai`'s `DEFAULT_MAX_OUTPUT_TOKENS`. Confirm the agent passes `GENERATION_CONFIG` explicitly and that the two literals can't silently diverge (add a test or a cross-reference comment on the ai-side constant). |
| 2 | `packages/embed/src/embed-app.tsx:26` vs `packages/shared/src/contracts/tenant-config.ts:44` | DRY / drift | `DEFAULT_ARTICLE_50` NL string is duplicated (embed can't import shared — legitimate), but two hand-maintained copies of a compliance (Art. 50) string will drift. Add a build-time equality check or a shared JSON asset both consume. |
| 3 | `packages/embed/src/embed-app.tsx:~190` | RAG faithfulness / UX | `CitationBlock` is hardcoded `verification="verified"`, ignoring `citationVerificationFailed` from the stream. Fine today (failed markers are stripped server-side), but it couples the trust UI to that assumption. Consider threading the flag through. |
| 4 | `packages/embed/src/embed-app.tsx` (`turns.map`) | React | `key={index}` on the message list; use a stable per-turn id to avoid reconciliation surprises if the list is ever mutated in place. |
| 5 | `apps/dashboard/lib/corpus.ts:16-23` | UX edge case | Corpus overview derives the fund from `interaction_events`, so a freshly-ingested corpus with zero events shows an empty panel. Consider a fallback (tenant→fund via `@wunderstack/tenant`) so the panel isn't empty on day one. |
| 6 | `packages/db/migrations/0006_*.sql` + `0007_*.sql` | Migrations | 0006 (CREATE ROLE approach) is fully superseded by 0007 on managed Postgres. Both are idempotent so it's safe, but a short note in `GATE-ARCHITECTURE`/decision doc that 0006 is a no-op on Scalingo would save a future reader. |

## Dead code

| # | File:line | Type | Description |
|---|-----------|------|-------------|
| 1 | `apps/runtime/lib/fund-scope.ts:28` | Unused export | `availableFunds()` exists for a UI fund-selector, but `apps/runtime` is now API-only (no UI). It is only consumed by `apps/playground`'s own copy. Remove it from the runtime lib (keep the `resolveFundScope` authorization function). |

## Summary
- Critical issues: 0
- Warnings: 5
- Suggestions: 6
- Dead-code items: 1
- **Overall verdict:** Strong, disciplined work — the DB schema (embedding-metadata columns, idempotency hash, indices), the best-effort analytics contract, the thin controllers, the admin server actions that re-check auth server-side, constant-time scrypt, and the extended boundary tooling (dependency-cruiser + ESLint + CI) all match the rules well. No sovereignty or security must-fix. The one thing that genuinely needs attention is **process, not code**: a rename, a UI strip, five new apps/packages and five migrations are stacked in a single working tree, which the move-protocol rule forbids. Split it, add Zod at the two remaining external boundaries (embed responses, app env), and this is landable.

---

## Action plan

### 🔴 Now (today)
1. **[working tree] Split the changeset per the move-protocol.**
   - What: commit the staged `git mv` rename as its own PR (functionally identical, green); then a runtime-UI-strip PR; then one PR per new package/app (`tenant`, `analytics`, `ui`, `embed`, `dashboard`, `marketing`, `playground`) each carrying its own migration.
   - Why: `250-move-protocol.mdc` — "Verplaatsen en refactoren nooit in dezelfde PR"; keeps every step green/deployable and reviewable.
   - Estimate: 60–90 min (mechanical, plus re-running gates per slice).
   - Dependencies: none (do first — it makes everything below reviewable in isolation).

2. **[packages/embed/src/embed-app.tsx] Zod-validate embed's external responses.**
   - What: local Zod schemas for the `GET /config` payload and each NDJSON `ChatEvent`; `safeParse` and drop malformed data.
   - Why: `300-typescript.mdc` — validate external API responses; the embed runs on third-party pages and currently trusts `as` casts, incl. a value injected into a CSS `color-mix`.
   - Estimate: 30 min.
   - Dependencies: none.

### 🟡 This week
3. **[new apps env] Typed, Zod-parsed env per app.**
   - What: small per-app env module (Zod) for `AUTH_SECRET`, `RUNTIME_URL`, `EMBED_SCRIPT_BASE`, `EMBED_PUBLIC_KEY`, `LANGFUSE_BASE_URL`; fail loud at boot.
   - Why: consistency with `packages/shared/src/env.ts`; silent `?? ""` defaults hide misconfiguration (e.g. an empty `AUTH_SECRET`).
   - Estimate: 30–45 min.

4. **[migration 0007 / analytics] Document (and plan) DB-level tenant isolation.**
   - What: record that fund→own-tenant isolation is app-layer only in v1; add a per-tenant RLS predicate before a second tenant shares a DB.
   - Why: Fase 3 DoD + sovereignty defense-in-depth.
   - Estimate: 15 min doc now; RLS work deferred to multi-tenant.

5. **[apps/runtime/lib/fund-scope.ts] Remove `availableFunds()` from the API-only runtime.**
   - What: delete the unused export (keep it in `apps/playground`).
   - Why: dead code in an API-only surface; `apps/runtime/AGENTS.md` says "Geen UI."
   - Estimate: 5 min.

### 🟢 When possible
6. **[embed] Thread `citationVerificationFailed` into `CitationBlock`; use stable `key`.** — small trust/robustness polish.
7. **[shared/embed] De-duplicate the Article 50 default string** with a build-time equality check.
8. **[dashboard/corpus.ts] Fallback fund resolution** so the corpus panel isn't empty before the first event.

### Ordering rationale
Split the mega-changeset first: it is a hard rule violation and, more practically, it makes every other finding reviewable in a small green PR instead of one 100-file blob. Then close the two real boundary gaps (embed response validation, app env parsing) because they are the only places the "Zod op elke grens" rule is actually bent. The isolation note and dead-code/polish items are low-risk and can follow the plan's phase order.
