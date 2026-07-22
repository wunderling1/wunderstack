# Wunderstack Status
_Gegenereerd: 2026-07-19 · Audit-methode: statische verificatie (geen test-runs) · branch: `fix/citation-pipeline`_

> **Update 2026-07-21 (branch `fix/eval-gate-enforcement`).** De gates worden nu bijgehouden in het
> vier-lagen-model (G1–G4); het enige levende gate-document is `docs/eval/GATE-ARCHITECTURE.md`.
> Een volledige eval-run op deze branch is **integraal groen** (`eval-report.json` → `passed: true`).
> §4.2 hieronder is herschreven naar G-termen en die verse run. Rode-gate-uitspraken elders in dit
> document (§1, §5, §7, §9, §10) horen bij de oudere `fix/citation-pipeline`-snapshot en zijn op deze
> branch achterhaald.

> Legenda: ✅ Done (feit, bewijs benoemd) · 🟡 Claimed done / discrepantie · 🔵 In progress (deels bewijs) · ⚪ Not started · ❓ Onduidelijk/niet gevonden · ⚠️ Requires test run.
> Labels bij claims: `feit` (geverifieerd in code) · `schatting` (afgeleid uit sterke signalen) · `aanname` (plan zegt het, geen bewijs gevonden).

## 1. Samenvatting (max 10 regels)
- De **CAO-agent v1 (Fase 0–8)** staat end-to-end: retrieval → rerank → LLM → gestreamd antwoord met geverifieerde citaties, getraceerd in Langfuse. `feit`.
- **Fase 9–12** (antwoord-evals, reranker, CAO-chunking, grounding, vertrouwens-UI) en **Fase 13 UI-fluency** (status-events, skeleton, token-streaming) zijn geïmplementeerd. `feit`.
- De **eval-hardening (P1–P8 / E0–E13)** is grotendeels doorgevoerd; **E13 (hard-fact runtime-guard + `derived`-cases + answer-baseline)** is nu wél aanwezig — dit weerspreekt de oudere audit `docs/audit/eval-hardening-audit.md`. `feit`.
- **KRITIEK:** de laatst vastgelegde eval-run (`packages/agents/eval-report.json`, 2026-07-18) is **`"passed": false`**. Gate B2, Gate C en Gate F falen. De branchnaam en diagnose-dumps bevestigen dat dit actief WIP is. `feit`.
- **Buiten repo, niet te verifiëren:** GitHub branch-protection/merge-queue, Scalingo-deploy, Langfuse-dashboard, nightly DB-gate-resultaat. `aanname`/handmatig.
- **Bewust NOT in v1:** multi-tenancy, Postgres RLS, Auth.js, tweede agent/Supervisor — geen van deze is gebouwd (conform de regels). `feit`.
- Er bestaat **geen `PLAN-v3` / "Fase 13–16" productie-hardening-plan** in de repo; die scope-aanname uit de audit-opdracht is niet terug te vinden. `feit`.

## 2. Delta sinds vorige STATUS.md
Geen eerdere `docs/STATUS.md` gevonden (glob `docs/STATUS.md` → 0 treffers). Dit is de **eerste** status-audit; geen delta te berekenen. `feit`.

Wél een belangrijke delta t.o.v. de bestaande audit-documenten (`docs/audit/eval-hardening-audit.md`, `docs/audit/UI-AUDIT-v1.md`), die tegen oudere commits/working-trees zijn geschreven:
- E13 was daar **NOT IMPLEMENTED**; nu **geïmplementeerd** (`packages/agents/src/cao/hard-facts.ts` + guard in `agent.ts:138`). `feit`.
- E7 answer-baseline was daar **absent**; nu **aanwezig** (`baseline.json` bevat een `answer`-sectie). `feit`.
- Corpus is nu **v4** (was v3), met 3 `derived`-cases toegevoegd. `feit`.
- Nieuw sinds de audits: de eval is nu **rood** (Gate B2/C/F), zichtbaar in `eval-report.json`. `feit`.

## 3. Plan-inventaris (gevonden planbestanden + scope + conflicten)

| Bestand | Scope / labels | Claim in doc | Opmerking |
|---|---|---|---|
| `PLAN.md` | **Fase 0–8** — CAO-agent v1 walking skeleton | impliciet afgerond | `feit` |
| `PLAN-v2.md` | **Fase 9–12** — kwaliteit & vertrouwen (evals op antwoordniveau, reranker, CAO-chunking, grounding, vertrouwens-UI) + backlog uit audit 2026-07-10 | vervolg op v1 | `feit` |
| `PLAN-eval-gates.md` | **P1–P8** — eval-gates hard maken | kop zegt "UITGEVOERD (7 jul 2026)" | Gebruikt **P-nummering**, niet E-nummering |
| `PLAN-ui-fluency.md` | **Fase 13.1–13.3** — UI die snel *voelt* (status-event, skeleton, token-streaming) | uitvoerplan | Dit is de enige "Fase 13" in de repo |
| `docs/audit/eval-hardening-audit.md` | **E0–E13** — compliance-audit (geen plan) | audit-verdicten | Zegt zelf: `PLAN-eval-hardening.md` (E0–E12) **bestaat niet** |
| `docs/audit/UI-AUDIT-v1.md` | UI-architectuur-audit (items 1–7, OPEN 1–13) | audit | Gebruikt geen "UI-0–UI-6" |
| `eval-gate-audit.md` (root) | eerdere eval-gate-audit | audit-artefact | historisch |

**Conflicten / mismatches met de audit-opdracht (`feit`):**
1. **`E0–E13`-labels bestaan alleen in een auditdoc + commit-messages**, niet in een plan-of-record. Het feitelijke plan gebruikt **P1–P8** (`PLAN-eval-gates.md`). Mapping P↔E is nergens formeel vastgelegd.
2. **`UI-0 – UI-6` bestaat niet.** De UI-scope leeft als **Fase 13.1–13.3** (`PLAN-ui-fluency.md`) plus audit-items 1–7 (`UI-AUDIT-v1.md`).
3. ~~**`PLAN-v3` / "Fase 13–16" bestaat NIET** als document.~~ **Achterhaald (2026-07-21):** `PLAN-v3.md` bestaat nu (toegevoegd in `a9299a1`) en definieert Fase 13–17 (productie-hardening, OOMT go-live, multi-tenancy, procurement pack). Let op: "Fase 13" is in de repo-code UI-fluency; in PLAN-v3 is het productie-hardening — de naam-collisie hieronder blijft gelden.
4. **Twee "Fase 13"-betekenissen**: de audit-opdracht bedoelt productie-hardening; de repo bedoelt UI-fluency. Naam-collisie.

## 4. Status per onderdeel

### 4.1 CAO-agent core (Fase 0–8)

| Fase | Onderdeel | Status | Bewijs (pad + check) |
|---|---|---|---|
| 0 | Monorepo-scaffold + guardrails | ✅ | `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml` (depcruise-stap `ci.yml:42`). `feit` |
| 1 | Datalaag `packages/db` | ✅ | `packages/db/src/schema.ts` (documents/chunks/agent_config/eval_cases), `migrations/0000_init.sql`, pgvector-kolom via `EMBEDDING_CONFIG.dim`. `feit` |
| 2 | AI-naad `packages/ai` | ✅ | `packages/ai/src/models.ts` (Mistral, `streamText` aanwezig), `embeddings.ts` (Scaleway). `feit` |
| 3 | Embedding bake-off | ✅ | `scripts/bake-off/results.md`, config gepind in `packages/shared/src/config/embedding.ts` (qwen3-embedding-8b @4096). `feit` |
| 4 | Ingestion | ✅ | `migrations/0001_add_embedding.sql`; ingest-scripts (idempotent, `documents.contentHash`), `0002_document_idempotency.sql`. `feit` |
| 5 | Retrieval `packages/rag` | ✅ | `retrieve.ts`, `rerank.ts`, `assemble.ts`, `rewrite.ts`, `index.ts` (rewrite→retrieve→rerank→assemble). `feit` |
| 6 | CAO-agent `packages/agents` | ✅ | `packages/agents/src/cao/agent.ts` (één Mastra `Agent`, seam via `types.ts`), tools + Langfuse. `feit` |
| 7 | API + demo-UI + widget | ✅ | `apps/demo/app/api/chat/route.ts`, `app/(demo)/page.tsx`, `app/widget/page.tsx`, `api/webhook/route.ts`. `feit` |
| 8 | Observability + evals als CI-poort | ✅ | `packages/agents/src/evals/cao.eval.ts` + eval-stap in `ci.yml:66`; Langfuse `observability/langfuse.ts`. `feit` |

Aanvullend (Fase 9–12, PLAN-v2):
- Reranker actief (naad ingevuld): `packages/ai/src/rerank.ts` + `packages/rag/src/rerank.ts` (status reranked/skipped/failed). ✅ `feit`
- CAO-specifieke chunking + structuurmetadata: `migrations/0003_add_structure_metadata.sql`, `chunks.chapter/article/lid/sourceRef/chunkType`. ✅ `feit`
- Grounding/antwoordcontract + clarify: `cao/prompt.ts`, `cao/clarify.ts` (`detectClarification`). ✅ `feit`
- Vertrouwens-UI + feedback-loop: `components/chat/citation.tsx`, `feedback.tsx`, `starters.tsx`, `api/feedback/route.ts`, `scripts/eval/harvest-feedback.ts`. ✅ `feit`

### 4.2 Eval & gates (vier-lagen-model G1–G4)

Canoniek document: **`docs/eval/GATE-ARCHITECTURE.md`** (het enige levende gate-document; oude
labels Gate A–D/B2/F, E0–E13 en P1–P8 leven alleen nog in Bijlage A daarvan).

**Feitelijke gates in de code** (`cao.eval.ts` `main()`), in G-termen:

| Laag | Subgate (oud label) | Wanneer | Vereisten |
|---|---|---|---|
| **G1** CONTRACT | prompt & clarify + fund-scoping (Gate A + Gate D-contract) | altijd | geen keys |
| **G2** GEDRAG | retrieval + rerank + `multi-turn` (Gate B + B2), answer-level (Gate C) + regressie | same-repo PR/push/merge | Scaleway + Mistral |
| **G3** PRODUCTIE | echte pipeline (Gate B-integration), fund-correctness (Gate F), isolation (Gate D-integration) | nightly | DB + Scaleway (+ Mistral) |
| **G4** RUNTIME | hard-fact-guard in `verifyAndBuild` (`hard-facts.ts`) | elk antwoord | — |

**Invarianten** (infrastructuur, geen gates — geborgd via unit tests + CI-config; zie
`GATE-ARCHITECTURE.md §4`): eval-scoort-productiemodel (E1), skip≠pass (E0/E8), één
verified-answer-seam, judge-robuustheid (E2/P3b), golden-set-schema (E3/E12), shared assemble (E4),
K-alignment (E6), baseline-integriteit (E7 + guard in beraad), run-artefact (E9), fixture-hygiëne
(E10). Alle `feit` (geverifieerd in code). Restpunten: Langfuse dataset-push (E9 stap 2) niet
geïmplementeerd; `sourceRef`-formaat-residu (E4); citationCorrectness=1-op-refusals (E3). `feit`.

**Actuele gate-uitslag (verse `pnpm test`-run 2026-07-21, branch `fix/eval-gate-enforcement`,
`eval-report.json` → `"passed": true`):** `feit`. Lokaal met `DATABASE_URL`, dus inclusief de
nightly DB-integratiegates. Config: `judgeSamples 1` lokaal (CI gebruikt 3).

| Laag / subgate | Uitslag | Kernmetrics |
|---|---|---|
| G1 — contract (A + D-contract) | ✅ PASS | 13/13 checks |
| G2-retrieval (B) | ✅ PASS | hit@1 95.8%, recall@3/5 100%, MRR 0.979, rerank 0 failed, delta ≥ 0 |
| G2 `multi-turn` (B2) | ✅ PASS | 4/4 elliptical cases gedetecteerd + geretrievd (etd-029/030/d02/d03) |
| G2-answer (C) | ✅ PASS | hardHall 100%, softFaith 100%, relevance 96.8%, citCorrect 100%, completeness 90.6%, refusalCalib 100%, citVerif 100%, orphan 0%, dangling 0%, over/under-refusal 0% |
| G2-answer regressie | ✅ PASS | alle metrics binnen ±0.05 van baseline |
| G3-pipeline (B-integration) | ✅ PASS | hit@1 95.8%, minScore-guard 3/3 leeg @ 0.48 |
| G3-fund [etd] (F) | ✅ PASS | hit@1 95.7%, refusal-guard 3/3 leeg @ 0.48 |
| G3-isolation (D-integration) | ✅ PASS | 0 cross-fund leakage over 3 fondsen (demo, etd, eval-fixtures) |

> De baseline (`baseline.json`, corpus v4) is gezond: alle answer-metrics boven de G2-floors. Dit
> weerspreekt de oudere `fix/citation-pipeline`-snapshot (§7 #4), waar de baseline onder de lat lag.

### 4.3 UI (Fase 13.1–13.3 / "UI-fluency"; de labels "UI-0 – UI-6" bestaan niet)

| Fase | Onderdeel | Status | Bewijs |
|---|---|---|---|
| 13.1 | `status`-event door de naad | ✅ | `types.ts` `CaoStreamEvent` status-variant; `agent.ts:295,315,316` yield searching/retrieved/generating; `contract.ts` `chatStatusPhases`. `feit` |
| 13.2 | Skeleton, gefaseerde status, progressieve bronnen, optimistisch | ✅ | `components/chat/message-list.tsx` (`AnswerSkeleton`, `phaseLabel`, `aria-live`), `use-chat.ts` (`phase`-seed), `citation.tsx` (candidate-prop). `feit` (per `UI-AUDIT-v1.md` §B.3; componenten bestaan) |
| 13.3 | Echte token-streaming | ✅ | `packages/ai/src/models.ts` `streamText`; `model/sovereign-model.ts` `doStream` (echte stream, geen gefakete delta); `agent.ts:331` reader-loop. `feit` |

Overige UI-onderdelen aanwezig: chat-container (`chat.tsx`), composer (`composer.tsx`), markdown + klikbare `[n]`-markers (`markdown.tsx`), feedback (`feedback.tsx`), fund-selector/theming (`fund-selector.tsx`, `lib/fund-theme.ts`), embeddable widget (`app/widget/page.tsx`). ✅ `feit`.

Bekende UI-gaten (uit `UI-AUDIT-v1.md`, nog open): `citationVerificationFailed` reist mee maar wordt niet gerenderd; `needsClarification` ongebruikt in UI; geen frontend-teststack; a11y-gaten (marker-knoppen zonder `aria-label`). 🔵 `feit` (afwezigheid geverifieerd via grep in audit).

### 4.4 Productie & go-live (PLAN-v3 / "Fase 13–16" — bestaat niet als plan)

**Achterhaald (2026-07-21):** `PLAN-v3.md` bestaat inmiddels (toegevoegd in `a9299a1`) en definieert Fase 13–17 (productie-hardening / OOMT go-live / multi-tenancy / procurement pack). De onderstaande items blijven beoordeeld op wat de **code + regels** waarmaken (een plan is nog geen implementatie): `feit`. Procurement is nu ook gedekt door de claim↔gate-kruistabel in `docs/eval/GATE-ARCHITECTURE.md` (Bijlage B).

| Onderdeel | Status | Bewijs / zoekpoging |
|---|---|---|
| Multi-tenancy / data-plane per fonds | ⚪ Not started (bewust) | `schema.ts:82` comment "multi-tenancy is out of scope"; fund-isolatie is app-laag (`retrieve.ts` filtert op `fund`). `feit` |
| Postgres RLS (portal-isolatie) | ❓ niet gevonden | Grep `create policy`/`enable row level security` over hele repo → **0 treffers**. Isolatie loopt via app-query + Gate D. `feit` |
| Auth.js / auth-middleware | ⚪ Not started (bewust) | Grep `next-auth`/`@auth/` → 0 in code; auth is een no-op naad (`apps/demo/proxy.ts`). `feit` |
| OOMT go-live | ❓ niet in repo verifieerbaar | "OOMT" komt niet voor in code; go-live-config = extern (§8). `feit` |
| Procurement pack | ❓ niet gevonden | Geen procurement-document in `docs/`. `feit` |
| Tweede agent + Supervisor-pattern | ⚪ Not started (bewust) | Alleen `cao/`-agent in `packages/agents/src`; comment `agent.ts:29`. `feit` |
| Streaming hard-fact flash (backlog) | 🔵 bekend, niet opgelost | `PLAN-v2.md:131`; guard vuurt na generatie (`agent.ts:358`). `feit` |

## 5. Agents-overzicht

| Agent | Purpose | Model/config | Tools | Eval-coverage (golden-set refs) | Status |
|---|---|---|---|---|---|
| **CAO-agent** (`cao`) | RAG-vraag→antwoord over CAO-tekst, met geverifieerde citaties en refusal onder drempel | Mistral via soevereine naad; generator `mistral-small-2603`, judge `mistral-large-2512`; temp 0 / maxTokens 1024 (`generation.ts`); embeddings qwen3-embedding-8b @4096 | Retrieval-tool (`cao/tools.ts`, Zod-contract) via `@wunderstack/rag`; hard-fact-guard, citation-verificatie | `golden-set.base.jsonl` (31 cases) + `golden-set.etd.jsonl` (26 cases); Gates A/B/B2/C/D/F | 🔵 Werkend maar eval **rood** (Gate B2/C/F falen, `eval-report.json`). `feit` |

Geen andere agents gevonden in `packages/agents/src` (alleen `cao/`). Geplande "tweede agent" / Supervisor: `❓ gepland, niet gevonden` (bewust buiten scope). `feit`.

## 6. Golden sets (per bestand)

De golden sets zijn **handmatig gecureerd** (E10-beleid, review-log `fixtures/golden-set.REVIEW.md`). Er is **geen `candidate`/`validated`-veld** in de JSONL zelf — "validated" = opgenomen in de fixture na review; "candidate" leeft apart in de harvest-output (`scripts/eval/harvest-feedback.ts`, JSONL van thumbs-down voor menselijke review). `feit`.

| Bestand | # cases | Categorieën | Snapshot-versie |
|---|---|---|---|
| `packages/agents/src/evals/fixtures/golden-set.base.jsonl` | **31** | 22 in_scope · 3 refusal · 3 table · 3 derived | `GOLDEN_CORPUS_VERSION = "4"` |
| `packages/agents/src/evals/fixtures/golden-set.etd.jsonl` (fund) | **26** | 22 in_scope · 3 refusal · 1 table | `FUND_SET_META.etd.corpusVersion = "etd-1"` |
| `packages/agents/src/evals/fixtures/golden-passages.jsonl` | **31** passages | text/table | v4 |

Fixture-integriteit bewaakt via `GOLDEN_FIXTURE_HASH` (sha256 over beide base-bestanden) vs `baseline.json.fixtureHash`. `feit`.

## 7. Discrepanties (plan/doc zegt X, code toont Y)

1. **Eval is rood terwijl `PLAN-eval-gates.md` "UITGEVOERD / groen" claimt.** `eval-report.json` (2026-07-18) = `"passed": false` (Gate B2, C, F falen). `feit`. → grootste discrepantie.
2. **`docs/audit/eval-hardening-audit.md` markeert E13 als NOT IMPLEMENTED**, maar E13 (hard-fact-guard, shared regex, `derived`-category, cases) is nu **wel** aanwezig. `feit`. (Audit is verouderd t.o.v. deze branch.)
3. **Audit markeert E7 answer-baseline als absent**, maar `baseline.json` heeft nu een `answer`-sectie. `feit`.
4. **Recorded answer-baseline ligt deels onder de Gate C-drempels** (bv. faithfulness 0.784 < 0.80; citationVerification 0.903 < 0.98; hardHallucination 0.968 < 0.98; underRefusalRate 0.333 > 0.10). Een baseline die onder de harde gate-lat ligt betekent dat Gate C niet groen kan zijn op deze corpus/branch. `feit`.
5. **Audit-opdracht verwacht labels `E0–E13`, `UI-0–UI-6`, `PLAN-v3 Fase 13–16`**; de repo gebruikt `P1–P8`, `Fase 13.1–13.3`. `PLAN-v3.md` bestaat inmiddels wél (sinds `a9299a1`). `feit`.
6. **E10 corpusversie is "4" (plan zei bump naar "2").** Bewuste deviatie, gedocumenteerd in `golden-set.ts`. `feit`.
7. **`sourceRef`-formaat-divergentie** tussen eval-fixture-adapter (`"Artikel 5.2"`) en prod-ingest `buildSourceRef` (`"Artikel 5, lid 2"`). **Geaccepteerd (Fase 6, 2026-07-21):** geen citatie-matching-impact — `sourceRef` is nergens matching-sleutel; het echte formaat draait nachtelijk in G3. Zie `docs/eval/GATE-ARCHITECTURE.md` §4.5. `feit`.

## 8. Externe checks (buiten repo, handmatig te controleren)
> Nooit als done/not-done gemarkeerd — alleen handmatig te controleren.
- **GitHub branch-protection + merge-queue**: `verify` als required check, "require up to date", admin-bypass uit. CI-kant staat (`ci.yml:9,79`); repo-setting niet uit de repo te zien. → `gh api repos/{owner}/{repo}/branches/main/protection`.
- **Nightly Gate B-integration / Gate F resultaat** tegen de staging-DB (`DATABASE_URL` alleen op `schedule`). → nightly `eval-report.json`-artefact.
- **Langfuse EU dashboard**: tracing-config, dataset-run push (E9 niet in code), productie-temperature-trace (E1).
- **Scalingo deploy** van `apps/demo` (buildpack/start-command/env; geen `Procfile` in repo; branch `fix/scalingo-deploy-boot`).
- **Golden-set co-creation-sessie** met fonds-experts (proces-doc `docs/golden-set-cocreation.md` bestaat; sessie-artefact niet).
- **Mistral-modelversies** (`mistral-small-2603`, `mistral-large-2512`) nog beschikbaar/gepind.

## 9. Open eindjes & risico's
1. **Eval rood op de werk-branch** (`fix/citation-pipeline`): Gate B2 (elliptisch-detectie op etd-029/030), Gate C (relevance/completeness/citation-verification/dangling-markers/under-refusal + completeness-regressie), Gate F (refusal-guard 0/3 probes leeg bij minScore 0.35). Blokkeert een groene merge naar `main`. `feit`.
2. **Under-refusal 33%** in de baseline: de agent antwoordt te vaak waar hij zou moeten weigeren — direct betrouwbaarheids-/compliance-risico voor een CAO-agent. `feit`.
3. **Fund-refusal-drempel (minScore 0.35) te laag** voor de ETD-fund: out-of-corpus vragen halen toch hits (Gate F). Raakt de "verzint niets"-belofte per fonds. `feit`.
4. **Answer-baseline onder de gate-lat** → Gate C is structureel niet groen te krijgen zonder óf de agent te verbeteren óf de baseline/drempels te herzien. `feit`.
5. **E-werk deels alleen op branch, niet op `main`** (audit noemde uncommitted E11/E12; huidige branch bevat de fixes maar is niet `main`). Merge-risico. `schatting`.
6. **Branch-protection nog niet aantoonbaar aan** → "skipped ≠ passed" leunt op een repo-setting die niet geverifieerd is. `aanname`.
7. **Langfuse dataset-run push (E9 stap 2) niet geïmplementeerd** → eval-trend leeft alleen in het lokale JSON-artefact. `feit`.

## 10. Voorgestelde volgende acties (max 5, geprioriteerd)
1. **Maak de eval weer groen** (Gate C eerst): pak under-refusal (33%), dangling-markers en citation-verification aan — dit is de kern van de `fix/citation-pipeline`-branch. Draai daarna `pnpm turbo run test` om §4.2 te bevestigen (⚠️ requires test run).
2. **Fix Gate F refusal-guard**: herzie de fund-`minScore` (0.35) of de out-of-corpus-probes zodat ≥2/3 probes 0 hits geven. `feit`-onderbouwd.
3. **Fix Gate B2**: `isElliptical`/`detectClarification` zo dat etd-029/030 als elliptisch worden herkend, of herlabel de cases.
4. **Herijk de answer-baseline ná de fixes** (`workflow_dispatch` → `write-baseline`, `EVAL_JUDGE_SAMPLES=3`) en commit de reviewde waarden — nu ligt de baseline onder de gate-lat.
5. **Zet branch-protection + merge-queue aan** en verifieer met `gh api …/branches/main/protection`; werk daarna de verouderde `docs/audit/eval-hardening-audit.md` bij (E7/E13 zijn inmiddels done).
