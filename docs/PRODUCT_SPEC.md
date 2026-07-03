# PRODUCT_SPEC.md — Wunderstack (CAO-agent boutique-infra, v1)

> **Fase 2 (PRD).** Dit document bevriest de scope vóór er code komt. Het beschrijft het
> systeem, de mappenstructuur en de kernfunctionaliteit. De afdwingbare bouwregels staan
> in `.cursor/rules/*.mdc`; dit document zegt *wat* we bouwen, die zeggen *hoe*.
> Wijzig scope hier eerst, niet ad hoc in code.

---

## 1. Doel & context

**Wunderstack** is de agent-infrastructuur voor een AI-boutique gericht op Nederlandse
O&O fondsen, losstaand van Qonvo/BullyLink/The Bully Agency maar koppelbaar. De infra draagt een groeiende
**catalogus van fonds-overstijgende agents** die één keer worden gebouwd en per fonds via
configuratie worden uitgerold.

**Eerste agent:** de **CAO-agent** — een RAG-agent die vragen over CAO-teksten beantwoordt,
met traceerbare bronvermelding. Accuratesse is existentieel: een fout antwoord over een CAO
is een bestuurlijk risico voor het fonds.

**v1-doel:** de CAO-agent end-to-end live in een publieke demo op de eigen site, getraceerd
en getoetst — als bewijs dat de primitives kloppen (walking skeleton), niet als af platform.

---

## 2. Systeemoverzicht

De levensloop van één vraag:

```
Kanaal van het fonds (widget / REST API)
        │  vraag
        ▼
apps/demo  ─ dunne controller: Zod-validatie → delegeren → streamen
        │
        ▼
packages/agents  ─ CAO-agent (Mastra achter een eigen naad, Supervisor-pattern)
        │
        ├── packages/rag ── retrieve → [rerank later] → assemble context
        │        │
        │        ▼
        │   packages/db (Drizzle) → Postgres + pgvector  (Scalingo)
        │        ▲
        │        └── embeddings via packages/ai → Scaleway (EU)
        │
        └── packages/ai ── LLM-call → Mistral (default, soeverein)
        │
        ▼
   gestreamd antwoord terug omhoog
        │
   Langfuse EU  ─ traceert elke stap (retrieval-chunks, scores, model, tokens, latency)
```

Aparte, asynchrone flow (de enige background-job in v1):

```
CAO-bronbestanden → ingestion-worker → chunking → embeddings (Scaleway) → pgvector
```

---

## 3. Scope

### In scope (v1)
- Embedding bake-off op echte NL CAO-tekst → definitieve embeddingkeuze.
- Ingestion-pipeline: CAO-documenten inladen, chunken, embedden, opslaan.
- Retrieval-pipeline met open rerank-naad.
- CAO-agent (Mastra, Supervisor-pattern) met Mistral, streaming antwoord + bronvermelding.
- Publieke demo-UI op de eigen site + embeddable widget + REST/webhook-API.
- Langfuse-tracing overal; klein eval-setje dat regressies blokkeert.
- Single-tenant, publiek (geen auth).

### Expliciet buiten scope (non-goals v1)
Multi-tenancy · auth op de demo · reranker · Temporal/LangGraph/losse runtime · interne
AI-gateway-service · Inngest · Supabase Auth/RLS · meerdere agents · klant-specifieke
deployments. Auth en reranker krijgen wél een naad, maar worden niet gebouwd.

---

## 4. Architectuurprincipes (samenvatting)

Volledige regels in `.cursor/rules/`. Kern: **naden, geen systemen** · **soeverein-by-default**
(fondsdata nooit by default naar een niet-EU-model) · **pijl-regel** (apps→packages) ·
**regel van drie** · **control-plane (agent-code) vs data-plane (fonds-config)** ·
**alle code Engels**, packages onder `@wunderstack/*`.

---

## 5. Mappenstructuur

```
.
├── .cursor/rules/            # 000-core, 100-stack, 200-architecture, 300-typescript,
│                             # 400-data-rag, 500-agents  (Fase 1)
├── AGENTS.md
├── docs/
│   └── PRODUCT_SPEC.md        # dit bestand
├── apps/
│   └── demo/                  # Next.js 16
│       ├── app/
│       │   ├── (demo)/        # publieke demo-UI (chat)
│       │   └── api/
│       │       ├── chat/      # POST: vraag → agent, streamt antwoord
│       │       └── webhook/   # inkomende LMS/fonds-webhooks
│       ├── components/        # chat-UI (shadcn/ui)
│       ├── public/widget/     # embeddable widget (script/iframe build-target)
│       └── middleware.ts      # auth-naad: no-op (publiek) in v1, pluggable per deployment
├── packages/
│   ├── ai/                    # model-abstractie: Mistral default, routing-naad, embeddings
│   ├── agents/                # CAO-agent def; Mastra verstopt achter eigen interface
│   ├── rag/                   # retrieve → [rerank later] → assemble
│   ├── db/                    # Drizzle schema + client + migraties (enige DB-toegang)
│   └── shared/                # Zod-schemas, types, config, env-parsing
├── scripts/
│   ├── ingest/                # ingestion-worker (corpus → embeddings)
│   └── bake-off/              # embedding-vergelijking (dubbelt als eval-start)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 6. Kernfunctionaliteit — de CAO-agent

### 6.0 Stap nul: embedding bake-off  *(eerste bouwstap, blokkeert de embeddingkeuze)*
- Kandidaten: `qwen3-embedding-8b` @ 2000 dim en `bge-multilingual-gemma2` (beide Scaleway/EU).
  Optioneel referentie-benchmark met een US-model puur om de kwaliteitskloof te *meten* —
  niet om te gebruiken.
- Corpus: een representatieve set echte NL CAO-passages + een handmatig gelabelde set
  vraag→juiste-passage.
- Meet: semantische recall / hit-rate op de juiste passage. Kies op meetbare kwaliteit,
  met soevereiniteit als harde randvoorwaarde.
- Output: gekozen model + dimensie, vastgelegd in config. Dit setje wordt de basis van de
  eval-suite.

### 6.1 Ingestion  *(async, enige background-job)*
- Input: CAO-documenten (PDF/tekst) uit object storage.
- Stappen: parse → chunk (met overlap, structuurbewust) → embed (Scaleway) → opslaan in
  pgvector met chunk-metadata én embedding-metadata (model/dim/versie).
- Idempotent en herhaalbaar; re-embed is een expliciete, bewuste operatie.

### 6.2 Retrieval
- Query → embed (zelfde model/dim als corpus) → vector-search in pgvector (hnsw/ivfflat).
- Structuur `retrieve → [rerank later] → assemble`: de rerank-stap is nu een lege pass-through
  zodat `bge-reranker-v2-m3` er later inschuift zonder refactor.
- Assemble: top-k chunks + bronmetadata als context voor de agent.

### 6.3 Antwoord
- CAO-agent (Mastra, Supervisor-pattern) krijgt de context, roept Mistral aan via `packages/ai`.
- Antwoord bevat **bronvermelding** (welke CAO-passage). Streamt terug via de API.
- Geen bron gevonden boven een drempel → de agent zegt dat expliciet, verzint niets.

### 6.4 Koppelvlak
- **Embeddable widget:** script/iframe die de publieke `/api/chat` aanroept. Op de eigen site
  én insluitbaar. Geen koppeling ín de eigen sites — alles via de API.
- **REST + webhooks:** `/api/chat` (vraag→gestreamd antwoord) en `/api/webhook` (LMS/fonds).
- Alle inputs/outputs Zod-gevalideerd.

### 6.5 Observability & evals
- Langfuse-trace op elke retrieval-, model- en agent-call (chunks, scores, tokens, latency).
- Eval-suite draait vóór elke wijziging aan prompt/retrieval/model; regressie blokkeert release.

---

## 7. Datamodel (schets, Drizzle)

- **documents** — `id, sector/fonds, titel, bron_uri, versie, ingested_at`
- **chunks** — `id, document_id, ordinal, content, metadata(jsonb),
  embedding vector, embedding_model, embedding_dim, embedding_version`
  *(embedding-metadata per rij zodat re-embed detecteerbaar is)*
- **agent_config** — `agent_key, fonds_key, config(jsonb)` *(control/data-plane; v1 = één rij, publiek)*
- **eval_cases** — `id, vraag, referentie/verwachte_passage, tags`

Tracing leeft in Langfuse (extern), niet in dit schema.

---

## 8. Deployment- & auth-model

- **Demo's op de eigen site = publiek, geen auth.** Dit is de default deployment-modus.
- **Auth is een naad, geen platformaanname.** `apps/demo/middleware.ts` is in v1 een no-op
  (publiek). Per deployment/agent kan er later een auth-middleware (Auth.js of anders) in,
  zonder de agents of API te herschrijven.
- **Klant-agents:** auth per usecase verschillend — sommige publiek, sommige achter login.
  Dat is puur deployment-configuratie op de bestaande naad, geen nieuwe architectuur.

---

## 9. Soevereiniteit & compliance (kort)

Default request-pad volledig EU: Scalingo (FR) · Scaleway embeddings (EU) · Mistral (FR) ·
Langfuse EU. Geen US-provider in het default data-/inferentie-pad. Fondsdata nooit by default
naar een niet-EU-model; een stille US-fallback is verboden. AVG dichttimmeren blijft
organisatorisch/contractueel; soevereiniteit is de troef erbovenop.

---

## 10. Definition of Done (v1)

1. Bake-off gedraaid; embeddingmodel + dimensie vastgelegd in config.
2. Ingestion laadt een echte CAO-set in pgvector, herhaalbaar.
3. Publieke demo beantwoordt CAO-vragen met bronvermelding, gestreamd.
4. Widget insluitbaar; `/api/chat` + `/api/webhook` werken, Zod-gevalideerd.
5. Elke call getraceerd in Langfuse.
6. Eval-suite draait en blokkeert regressies in CI.
7. Auth-naad aanwezig als no-op; pijl-regel + TS-strict + Zod-grenzen CI-afgedwongen.

---

## 11. Openstaande beslissingen

- **Embeddingmodel:** definitief ná de bake-off (6.0).
- **Chunking-strategie:** grootte/overlap bepalen tijdens ingestion-werk, valideren via evals.
- **Reranker:** uitgesteld; naad staat klaar.

---

## 12. Vervolg — Fase 3 (PLAN.md)

Na goedkeuring van deze PRD: de implementatie opknippen in chronologische, kleine stappen
met exacte bestandspaden per stap (o.a. monorepo-scaffold → db + schema → ingestion + bake-off
→ retrieval → agent → API + widget → observability + evals), uitgeschreven in `PLAN.md`.
