# PLAN.md — implementatieplan Wunderstack (CAO-agent boutique-infra, v1)

> **Fase 3.** Chronologisch implementatieplan, opgeknipt in kleine fasen. Elke fase heeft
> een doel, de exacte bestandspaden om te maken/wijzigen, en een Definition of Done (DoD).
> Leidend: `docs/PRODUCT_SPEC.md` (wat) en `.cursor/rules/*.mdc` (hoe).

## Zo voer je dit uit (Fase 4)
- **Eén fase tegelijk.** In Cursor: *"Refer to `@docs/plans/PLAN.md`. Ik ben klaar voor Fase X. Bouw
  alleen deze fase, volg de `.cursor/rules`, en ga niet door naar de volgende fase."*
- **Verifieer versies** vóór elke install (web search aan) — zie `100-stack.mdc`.
- **Alle code, namen en commits in het Engels**; packages onder `@wunderstack/*` (zie `000-core.mdc`).
- **Groen afsluiten:** elke fase eindigt met `typecheck + lint + test` groen en een commit.
- Ga pas door als de DoD van de vorige fase gehaald is.

---

## Fase 0 — Monorepo-scaffold + guardrails
**Doel:** lege, correct begrensde monorepo. Nog geen agent-code.

**Maken:**
- `package.json` (root, `packageManager: pnpm@11`), `pnpm-workspace.yaml`, `turbo.json`
- `tsconfig.base.json` (strict) + per-package `tsconfig.json`
- `eslint.config.mjs` (flat config) met `no-restricted-imports` voor de pijl-regel
- `.dependency-cruiser.cjs` (apps→packages afdwingen, packages→apps verbieden)
- `.github/workflows/ci.yml` (install, typecheck, lint, depcruise, test)
- Lege packages met `src/index.ts` + `package.json` (namen `@wunderstack/*`):
  `packages/shared/`, `packages/db/`, `packages/ai/`, `packages/rag/`, `packages/agents/`
- `apps/demo/` (Next.js 16 init, leeg)
- `packages/shared/src/env.ts` (Zod-parse van `process.env`, typed config export)
- `packages/shared/src/index.ts` (re-export env, types)
- `.env.example` (alle keys, geen waarden)

**DoD:** `pnpm i && pnpm turbo typecheck lint` groen; een import van `apps/demo` → `packages/*`
werkt, en een verboden import `packages/* → apps/*` faalt de lint/depcruise.

---

## Fase 1 — Datalaag (`packages/db`)
**Doel:** schema en migraties, klaar voor pgvector — maar de vectorkolom nog NIET (die
dimensie beslist de bake-off in Fase 3).

**Maken/wijzigen:**
- `packages/db/src/schema.ts` — tabellen `documents`, `chunks` (zónder vectorkolom),
  `agent_config`, `eval_cases`. Op `chunks` alvast: `embedding_model`, `embedding_dim`,
  `embedding_version` (nullable tot Fase 4).
- `packages/db/src/client.ts` — Drizzle-client (enige DB-toegang).
- `packages/db/drizzle.config.ts` — Drizzle Kit config.
- `packages/db/migrations/0000_init.sql` — gegenereerd; bevat `CREATE EXTENSION IF NOT EXISTS vector;`
- `packages/db/src/index.ts` — exporteert client + schema.
- `.env.example` — `DATABASE_URL` (Scalingo managed Postgres) toevoegen.

**DoD:** migratie draait tegen Scalingo Postgres; `pgvector` extensie actief; client typed
bruikbaar vanuit een ander package.

---

## Fase 2 — AI-naad (`packages/ai`)
**Doel:** één plek voor modellen en embeddings. Nodig vóór bake-off, ingestion én retrieval.

**Maken:**
- `packages/ai/src/models.ts` — LLM-abstractie, default = Mistral. Routing-naad aanwezig
  maar default-pad soeverein (zie `500-agents.mdc`).
- `packages/ai/src/embeddings.ts` — `embed(texts, model)` via Scaleway (EU), OpenAI-compatibel.
  Retourneert vector + `{model, dim, version}`.
- `packages/ai/src/index.ts`
- `.env.example` — `MISTRAL_API_KEY`, `SCALEWAY_API_KEY` toevoegen.

**DoD:** een testscript embed een string via Scaleway en doet een LLM-call via Mistral,
beide Zod-gevalideerd; geen niet-EU-provider in het default-pad.

---

## Fase 3 — Embedding bake-off (`scripts/bake-off`)  *← beslissingspoort*
**Doel:** empirisch de embeddingkeuze bepalen op echte NL CAO-tekst. Blokkeert Fase 4.

**Maken:**
- `scripts/bake-off/dataset.ts` — geladen CAO-passages + gelabelde vraag→juiste-passage-set.
- `scripts/bake-off/run.ts` — embed met kandidaten (`qwen3-embedding-8b` @2000, `bge-multilingual-gemma2`;
  optioneel US-referentie puur om de kloof te meten), meet recall/hit-rate.
- `scripts/bake-off/results.md` — uitkomst + gekozen model + dimensie + onderbouwing.
- `packages/shared/src/config/embedding.ts` — gekozen `{model, dim, version}` vastgelegd.

**DoD:** `results.md` bestaat met een meetbare winnaar; embeddingconfig vastgelegd; de
gelabelde set is herbruikbaar als start van de eval-suite (Fase 8).

---

## Fase 4 — Ingestion (`scripts/ingest`)
**Doel:** CAO-corpus → chunks → embeddings → pgvector. Enige async job in v1.

**Maken/wijzigen:**
- `packages/db/migrations/0001_add_embedding.sql` — voegt nu `chunks.embedding vector(<dim>)`
  toe op de gekozen dimensie + hnsw/ivfflat-index; maakt de metadata-kolommen NOT NULL.
- `scripts/ingest/parse.ts` — PDF/tekst → platte tekst.
- `scripts/ingest/chunk.ts` — structuurbewuste chunking (grootte/overlap; te tunen).
- `scripts/ingest/run.ts` — orkestreert parse→chunk→embed→opslaan; idempotent.

**DoD:** een echte CAO-set staat in pgvector met correcte embedding-metadata per rij;
herdraaien dupliceert niet.

---

## Fase 5 — Retrieval (`packages/rag`)
**Doel:** query → context, met open rerank-naad.

**Maken:**
- `packages/rag/src/retrieve.ts` — query embedden (zelfde model/dim) → pgvector-search top-k.
- `packages/rag/src/rerank.ts` — **pass-through** (identiteit) nu; naad voor `bge-reranker-v2-m3` later.
- `packages/rag/src/assemble.ts` — chunks + bronmetadata → context.
- `packages/rag/src/index.ts` — `retrieve → rerank → assemble` als één functie.

**DoD:** een testvraag levert relevante chunks + bronnen; pipeline-structuur staat, rerank
is een no-op die later inschuift zonder refactor.

---

## Fase 6 — CAO-agent (`packages/agents`)
**Doel:** de agent, met Mastra verstopt achter een eigen interface.

**Maken:**
- `packages/agents/src/cao/agent.ts` — CAO-agent: **één** Mastra `Agent` (geen Supervisor
  voor één agent; Supervisor-pattern pas bij de tweede agent). Gebruikt `packages/rag` + `packages/ai`.
- `packages/agents/src/cao/tools.ts` — retrieval-tool met Zod input/output-contract.
- `packages/agents/src/types.ts` — de eigen agent-interface (de naad; app importeert dit, niet Mastra).
- `packages/agents/src/index.ts`
- Langfuse-tracing bedraden op agent-/model-/retrieval-calls.

**DoD:** de agent beantwoordt een CAO-vraag met bronvermelding; zegt "niet gevonden" onder
de drempel i.p.v. te verzinnen; elke call verschijnt in Langfuse.

---

## Fase 7 — API + demo-UI + widget (`apps/demo`)
**Doel:** publieke demo, insluitbaar, dunne controllers.

**Maken:**
- `apps/demo/middleware.ts` — auth-naad als **no-op** (publiek).
- `apps/demo/app/api/chat/route.ts` — POST: Zod-validatie → agent → stream. Geen logica hier.
- `apps/demo/app/api/webhook/route.ts` — inkomende LMS/fonds-webhook, Zod-gevalideerd.
- `apps/demo/app/(demo)/page.tsx` — publieke chat-UI (shadcn/ui).
- `apps/demo/components/chat/*` — chatcomponenten.
- `apps/demo/public/widget/` + build-target — embeddable script/iframe die `/api/chat` aanroept.

**DoD:** publieke demo beantwoordt vragen gestreamd met bronnen; widget insluitbaar op een
externe testpagina; alle API-in/out Zod-gevalideerd; middleware laat alles door (publiek).

---

## Fase 8 — Observability + evals als CI-poort
**Doel:** kwaliteit bewaken, regressies blokkeren.

**Maken/wijzigen:**
- `packages/agents/src/evals/cao.eval.ts` — eval-suite op de gelabelde set uit Fase 3.
- `.github/workflows/ci.yml` — eval-stap toevoegen die faalt bij accuratesse-regressie.
- Langfuse-dashboards/tags controleren (retrieval-chunks, scores, tokens, latency).

**DoD:** eval draait in CI en blokkeert een prompt-/retrieval-/modelwijziging die de
accuratesse verlaagt; alle productiecalls getraceerd. → hiermee is de v1-DoD uit de PRD gehaald.

---

## Buiten v1 (naden staan klaar, niet bouwen)
Reranker activeren · auth-middleware per klantdeployment · multi-tenancy (data-plane per fonds) ·
tweede agent + Supervisor-pattern · klant-specifieke deploys. Elk hiervan = een aparte,
latere PLAN-uitbreiding, niet nu.
