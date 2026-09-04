# Audit fase 1 — `packages/*`

| Veld | Waarde |
|---|---|
| Datum | 2026-09-04 |
| Beoordelaar-SHA | `63205ed953172170d2381490e8ff06da56c069d1` (`origin/main`) |
| Branch (beoordeeld) | `main` |
| Omgeving | Read-only clone `/tmp/wunderstack-fase0-2026-09-04` op die SHA. Lokale checkout is `perf/dashboard-2026-09-01` @ `4bea381` plus een vuile worktree (~400 paden). De prompt eist: wijkt de worktree af, stop en meld het — daarna de clone lezen. Alle paden en regelnummers hieronder komen uit de clone. |
| Rubric | `docs/audit/RUBRIC-externe-review.md` (assen A/B-handhaving/F; C/D/E/G staan daar nog niet). Werkdefinities hieronder. |
| Rangschikking | Vanaf 2026-09-04: `docs/plans/PLAN-q4-gereedheid.md`. |
| DoD `git status` | **Niet haalbaar.** `git status --porcelain` toont de bestaande vuile tree plus dit bestand. Er is niets gecommit. |

**Acuut (D10), niet gefixt:** F1-01 — drie namen voor het schema. Toets 2026-09-04: **tak A** (zie onder F1-01); geen live verkeerd-fonds-read.

## Assen (werkdefinities voor deze fase)

| As | Wat ik heb gemeten |
|---|---|
| **B** | Interne grenzen: wie mag wat weten, wat de naam van een package belooft, wat depcruise niet afdwingt. |
| **C** | Domeintaal: één begrip, één naam, één betekenis, over schema / code / UI-contract. |
| **D** | Contracten: Zod op binnenkomende data, publieke typen die hun werk doen, `any`/`as`/`!`. |
| **E** | Tests en evals: belofte ↔ net, scorefuncties die een gate voeden, tests die bron als tekst matchen. |
| **G** | Passendheid bij vijf fondsen: overbouw (één implementatie) en onderbouw (driemaal hetzelfde). |

## Aandachtsverdeling

De beoordelaar leest geen negen packages in twee dagen. Ik heb niet gelijkmatig gelezen.

| Diepte | Package | Motivering |
|---|---|---|
| **Diep** | `agents` (~18k loc, 114 ts, 42 tests) | Het product. Steekproef (D6): `runtime/create-agent.ts` (vraag→antwoord+weigeren), `runtime/profile.ts` + `cao/`/`arbo/` tools en profiles, `runtime/parse-generation.ts` + `verifyAndBuild`, eval-scorers (`evals/judge.ts`, `answer-floors.ts`, `roleplay-floors.ts`), roleplay-naad (`schemas.ts`, `rubric.ts`, `session-store.ts`). **Niet** gelezen: elk golden JSONL, `latency-mcp.ts`, `sync-model-prices.ts`, de volledige `cao.eval.ts` (alleen floors en koppeling). |
| **Diep** | `db` (~4.6k loc, 53 ts, 13 tests) | Identiteit en isolatie. Gelezen: `ident.ts`, `agent-instances.ts`, `resolve-instance.ts`, `search-path.ts`, `fund-schema.ts`, `fund-lifecycle.ts` (theme), schema `interaction-events` / `funds` / `agent_instances`, de barrel. **Niet** tot de bodem: dumps, LTI, dashboard-users, grants-SQL — alleen als barrel-bewijs. |
| **Middel** | `analytics`, `rag`, `tenant` | Event-contract en schema-keuze; retrieval-isolatie; het hele tenant-package (97 regels). |
| **Licht** | `ai`, `shared`, `embed`, `ui` | Model-naad + provider-Zod; env/agent-keys/chat-contracten; embed-spiegel; UI-barrel + twee brontests. |

## Inventaris (clone `63205ed`)

Regels = alle `.ts`/`.tsx` inclusief tests. Exports = `package.json#exports`.

| Package | Bestanden | waarvan `*.test.ts(x)` | Loc | Publieke exports |
|---|---|---|---|---|
| `agents` | 114 | 42 | 17958 | `.`, `./evals/fund-ledger`, `./evals/golden-set` |
| `db` | 53 | 13 | 4621 | `.`, `./ident` |
| `analytics` | 23 | 10 | 3561 | `.` |
| `shared` | 32 | 10 | 2872 | `.`, `./browser` |
| `ui` | 31 | 2 | 1938 | `.`, `./styles.css` |
| `rag` | 11 | 3 | 1079 | `.` |
| `ai` | 8 | 2 | 910 | `.` |
| `embed` | 5 | 0 | 749 | `./embed.js` → `dist/embed.js` (geen src-barrel) |
| `tenant` | 2 | 1 | 97 | `.` |

Totaal ~9 packages, ~33732 regels TypeScript, 83 testbestanden, 0 tests in `embed`.

---

## Deel 1 — Verticale doorsnede

Eén echte gebruikersvraag (CAO, in-corpus) tot een gestreamd antwoord. Het pad begint in `apps/runtime` (buiten het register; ketenstart hieronder, oordeel in de bijlage). Daarna alleen packages. D8: dit is uit bron gevolgd, zonder draaiende omgeving.

### Antwoordpad

1. **`apps/runtime` (ketenstart, geen F1).** Route-handler parseert de chat-request en roept `agent.answerStream({ question, fund, history }, { sessionId, channel, userId, corpusVersion })`. `fund` is hier de corpus-sleutel die de runtime heeft gekozen.
2. **`packages/agents` — `getAgent(id)`** (`src/catalog.ts:35-48`). Neemt een catalog-id, lost `resolveRegisteredProfile` op, cached `createGroundedAgent(profile)`. Type over de grens: `GroundedAgent` (`src/types.ts`). Catalog-id = `profile.agentKey` (`catalog.ts:28`).
3. **`packages/agents` — `createGroundedAgent` → `answer` / `answerStream`** (`src/runtime/create-agent.ts:464-517` en de stream-tweeling ~605). Valideert `profile.questionSchema.parse(input)`, daarna `as AgentQuestion & { topK: number; minScore: number }` (`:466-469`). Type: `AgentQuestion` / `agentQuestionSchema` (`src/types.ts:19-45`) — velden `question`, `fund`, `history`, `topK`, `minScore`.
4. **Clarify (CAO alleen).** `profile.clarify?.(question)` (`create-agent.ts:488`). CAO: `detectClarification`. Arbo: `clarify: null`. Uitkomst: `found: false`, `turnOutcome: clarifiedOutcome()`, geen retrieval, geen LLM.
5. **Condenseren.** `resolveRetrievalQuestion` (`create-agent.ts:503` / definitie `:310`). Optioneel `condenseQuery` → `@wunderstack/ai` `generateText`. Type intern: `{ retrievalQuery, retrievalQueries, condensed }`.
6. **`profile.runRetrieval`.** CAO: `cao/tools.ts:68-77`. Arbo: `arbo/tools.ts:44-54`. Type: `RetrievalInput` — **gedefinieerd in** `cao/tools.ts:15-26`, hergebruikt via `runtime/profile.ts:4`. Bevat `query`, `fund`, `topK`, `minScore`. **Geen `agentKey`.** Die wordt in de wrapper hardcoded: CAO `"cao"` (`cao/tools.ts:74`), arbo `"arbo"` (`arbo/tools.ts:51`).
7. **`packages/rag` — `retrieveContext`** (`src/index.ts:21-23`). Valideert `retrieveInputSchema` (`rag/src/retrieve.ts:26-51`): nu wél `fund` + `agentKey`. Herschrijft de query (`rewriteQuery`), embedt, zoekt, rerankt, assembleert. Arbo heeft *daarvoor* al `rewriteArboQuery` gedraaid — tweede rewrite in `retrieveContext`.
8. **`packages/ai` — `embed`.** Queryvector. Provider-antwoord: embeddings-pad (licht gelezen; LLM-pad hieronder).
9. **`packages/db` — `retrieveFromVector` / `searchByVector`** (`rag/src/retrieve.ts:152-162`, `:177-236`). `searchPathForRetrieve` → `fundSchemaName(input.fund)` tenzij `searchPath` (`:143-145`). `withSearchPath(schemaName, …)` (`db/src/search-path.ts:19-27`). SQL-filter: `documents.fund = fund` **en** `documents.agentKey = agentKey` (`retrieve.ts:207`). Hits onder `minScore` eruit (`:236`). Type: `RetrievedChunk`.
10. **Lege hits → weigering** (zie weigeringspad). Anders **generatie:** `generateAnswerWithRepair` → Mastra `registered.generate` in `create-agent.ts` wikkelt `@wunderstack/ai` `generateText` / `streamText`. Type in: `ChatMessage[]` (`ai/src/models.ts:18-21`). Provider-JSON: `mistralResponseSchema.parse` (`models.ts:266`).
11. **Model-output.** `parseGenerationOutput` (`runtime/parse-generation.ts`): sentinel + Zod `rawModelCitationSchema` (`:10-26`). Daarna `verifyCitations` (verbatim + ellipsis). Daarna `verifyAndBuild` (`create-agent.ts:164-239`): hard-feit-wacht, citation-coupling, anders `answeredGrounded()` of `refused(…)`.
12. **Uit:** `AgentAnswer` / `AgentStreamEvent` (`types.ts:60-86`). `found` (serve-vlag) en `turnOutcome` (analytics-classificatie) naast elkaar. Citations: `Citation` uit `@wunderstack/shared` (`contracts/citation.ts:37`).
13. **`packages/analytics` — schrijven (apps-caller, contract hier).** `recordInteractionEvent` (`src/record.ts:16-41`): Zod `interactionEventInputSchema` (`event.ts:14-47`). Kolommen: `tenantId`, `agentId` (grounded key, niet `agentKey`), `fund`, platgeslagen `outcome` / `outcome_reason`. `withFundSchema(event.fund, …)` (`record.ts:40`) — schema weer afgeleid van het `fund`-veld.

### Weigeringspad (buiten corpus)

Het pad waarop de propositie rust. Zelfde keten tot stap 9. Dan, in `create-agent.ts:506-517`:

- `retrieval.hits.length === 0`
- antwoord = `profile.notFoundMessage` (CAO: niet-gevonden-tekst in `cao/prompt.ts`; niet opnieuw gelezen voor domeincorrectheid)
- `found: false`
- `turnOutcome: refused("no_coverage")`
- `citations: []`, `ZERO_RETRIEVAL`, `ZERO_USAGE`
- **geen LLM-call**

Andere weigeringen ná generatie, dezelfde `verifyAndBuild`:

| Voorwaarde | Pad | `turnOutcome` | Served tekst |
|---|---|---|---|
| Hard feit niet in grounding | `create-agent.ts:191-200` | `refused("guard_hard_fact")` | `notFoundMessage` |
| Substantief antwoord, 0 geverifieerde citations | `:206-215` | `refused("guard_citation_coupling")` | `unverifiableMessage` |
| Geen citations na strip (markerloos) | `:230-238` | `refused("no_coverage")` | `notFoundMessage` |

G4: stream buffert tot `verifyAndBuild` klaar is (`settledAnswerBody`); tokens lekken niet vóór de wacht.

### Hier moest ik raden

1. **Welke string is het schema?** `AgentQuestion.fund`, `fundSchemaName(tenantId)`, `ResolvedInstance.fundKey`, `ResolvedInstance.schemaName` (opgeslagen), `withFundSchema(fundKey)`, `getCorpusOverview(tenantId)`. Zonder de runtime te lezen is niet te zien of die vijf dezelfde string zijn. `packages/tenant` zegt van niet, als `TENANT_FUND` gezet is.
2. **Wie vult `AgentQuestion.fund`?** Het schema eist de string; de package vult hem niet. De caller (apps) kiest tussen `getTenantId()` en `tenantFund()`. Dat is raden vanuit packages alleen.
3. **`agentKey` op retrieval.** Het typed input van de agent heeft het veld niet; de waarde zit in een stringliteral in de tool-wrapper, terwijl `profile.agentKey` ernaast bestaat. Een nieuwkomer zoekt het op het verkeerde schema.
4. **`found` versus `turnOutcome`.** Commentaar in `types.ts:64-72` legt het uit; de namen doen dat niet. Analytics schrijft alleen `turnOutcome`. Dashboard-lezer die `found` zoekt, vindt een kolom `outcome`.
5. **`hits` versus `chunks`.** Retrieval-meta heeft `hits` (id+score); RAG geeft `chunks`. Lege-hit-check is `hits.length`.
6. **Catalog `id` versus `agentKey` versus event `agentId`.** `listAgents()` noemt het `id`; het is `profile.agentKey`; het event-log noemt het `agentId`; de documents-tabel noemt het `agentKey`.
7. **`getTenantConfig`.** Naam zegt “tenantconfig”; implementatie is `getInstance(tenantId, "cao")`. Met arbo in dezelfde catalogus is de naam een val.
8. **Arbo: dubbele rewrite.** `rewriteArboQuery` dan `retrieveContext` → `rewriteQuery`. Of de tweede no-op is, moet je beide herschrijvers lezen.
9. **`packages/tenant` bestaat, maar geen van de andere acht packages importeert het.** De 1-op-1-belofte leeft in een package dat de schema-bouwers niet zien.

---

## Deel 2 — Begrippenlijst

Afgeleid uit typen die een packagegrens oversteken en uit kolommen. Beoordeling: één betekenis, één naam — of niet.

| Begrip | Betekenis in code | Definitie (pad + regel) | Andere naam / andere betekenis | Oordeel |
|---|---|---|---|---|
| **tenant / TenantId** | Deployment-/instance-identiteit uit `TENANT` | `packages/tenant/src/index.ts:29-33` | `agent_instances.tenant_id`; `fundSchemaName(tenantId)` (`db/src/agent-instances.ts:15-16`) bouwt het **fysieke schema** uit deze string | Twee namen voor isolatie (`tenant` vs `fund_*` schema) |
| **fund** | “Klant-domeinwoord” volgens tenant-package | `tenant/src/index.ts:32-33`, mapping `TENANT_FUND` `:40-42`, `tenantFund` `:58-60` | `AgentQuestion.fund` = corpus-isolatiesleutel (`agents/src/types.ts:22-23`); `documents.fund`; `withFundSchema(fundKey)` leidt schema `fund_${fundKey}` af; analytics-event heeft **zowel** `tenantId` als `fund` (`analytics/src/event.ts:16-25`) | **Twee namen voor bijna hetzelfde, en één naam voor twee dingen** als override aanstaat. Zie F1-01 |
| **fundKey** | Control-plane sleutel; `assertFundKey` | `db/src/ident.ts:8-19` | `ResolvedInstance.fundKey: row.tenantId` (`resolve-instance.ts:61-62`) — **niet** `tenantFund()`. `ActiveFund.key` is `funds.key` | `fundKey` = `tenantId` in resolve; = domein-fund in tenant-override |
| **schemaName** | Fysiek Postgres-schema | `funds.schemaName` (`db/src/schema/control/funds.ts:14`); `agent_instances.schema_name` | `fundSchemaName()` **negeert** de opgeslagen kolom en deriveert `fund_${id}`. RAG default idem; override via `searchPath` bestaat wel | Opgeslagen vs afgeleid |
| **agentKey** | Instance- en corpus-sleutel `cao \| arbo \| roleplay` | `shared/src/config/agent-keys.ts:17-21` | Catalog `id` (`catalog.ts:28`); registry deprecateert lokaal `type AgentKey = GroundedAgentKey` (`runtime/registry.ts:17`) | Eén woord, twee typen in één package |
| **GroundedAgentKey** | Subset die `createGroundedAgent` draait | `agent-keys.ts:31-33` | — | Eén betekenis |
| **agentId** | Event-log: grounded key van wie antwoordde | `analytics/src/event.ts:23`; kolom `agent_id` (`db/.../interaction-events.ts:21`) | Elders `agentKey` / catalog `id` | Twee namen voor hetzelfde. F1-02 |
| **found** | Serve-vlag: modeltekst geserveerd vs vervangen | `agents/src/types.ts:64-68` | Niet gepersisteerd | Verdedigd naast `turnOutcome`; naam botst met “gevonden in corpus” |
| **turnOutcome / outcome** | Classificatie op beslismoment | `writableTurnOutcomeSchema` (shared); `AgentAnswer.turnOutcome` `types.ts:71-72` | DB-kolommen `outcome` + `outcome_reason` (`interaction-events.ts:32-34`); embed spiegelt als losse strings (`embed/src/types.ts:33-36`) | Object vs twee kolommen; embed `z.string()` i.p.v. enum |
| **Citation / ModelCitation / EmbedCitation** | UI-kaart vs modelclaim vs embed-spiegel | `shared/.../citation.ts:9-41`; embed `embed/src/types.ts:19-31` | Embed mag `shared` niet laden (env-parse) — commentaar in `embed/src/types.ts:4-16` | Twee namen, verdedigde fork. Drift-risico |
| **RetrievalInput** | Agent-tool input zonder `agentKey` | `cao/tools.ts:15-26`; geherëxporteerd `runtime/profile.ts:4, 36` | `RetrieveInput` in rag **heeft** `agentKey` (`retrieve.ts:43-44`) | Zelfde stap, twee contracten |
| **hits / chunks** | Score-lijst vs volledige chunks | `cao/tools.ts:40-41` vs `RetrievalOutput.chunks` `:59` | RAG `RetrievedChunk[]` | Twee woorden, één pool |
| **query / question / retrievalQuery** | Usertekst vs retrieval na condense | `AgentQuestion.question`; `RetrievalInput.query`; intern `retrievalQuery` | — | Hinderlijk, niet gevaarlijk |

---

## Deel 3 — Publiek oppervlak en contracten

### Wat is publiek? (manifest + importzijde)

Gezocht in de negen packages naar `from "@wunderstack/<pkg>/…"` (diep). **Geen treffers.** Consumenten importeren barrels of de **gedeclareerde** subpads.

| Package | Manifest | Wat andere **packages** importeren | Diep? |
|---|---|---|---|
| `agents` | `.` + eval-subpads | `@wunderstack/agents` niet door sibling packages (alleen apps/scripts). Barrel `src/index.ts` is de naad; commentaar `:1-4` belooft dat Mastra niet lekt | Nee binnen packages. Eval-subpads: scripts (bijlage) |
| `db` | `.` + `./ident` | `@wunderstack/db` barrel (rag, agents, analytics). `ident` is apart zodat DDL-quoting zonder client kan | Nee |
| `analytics` | `.` | Niet door andere packages | — |
| `shared` | `.` + `./browser` | Overal `@wunderstack/shared`. `./browser` is de env-vrije split | Nee |
| `rag` | `.` | agents, passage-re-export | Nee |
| `ai` | `.` | rag, agents | Nee |
| `tenant` | `.` | **Geen** van de andere acht | — |
| `embed` | alleen `./embed.js` (dist) | ui-primitives via `@wunderstack/ui` | Nee |
| `ui` | `.` + `styles.css` | embed | Nee |

De grens die **niet** bestaat is intern: `runtime/profile.ts` importeert types uit `cao/tools.ts`. Dat is geen package-grens, wel een naamgrens (“CAO-tools zijn het gedeelde retrieval-contract”).

### Is het oppervlak beschreven?

- **agents:** ja, tot op het commentaar in `types.ts` en `create-agent.ts`. Publieke functies hebben JSDoc; `GroundedAgent` is af te leiden zonder Mastra te kennen. Minpunt: `getAgent(id: string)` i.p.v. `GroundedAgentKey`.
- **db:** nee. De barrel (`src/index.ts`) exporteert client, schema, ruwe DDL-strings, grants, fund-lifecycle, LTI, users, dumps. Uit de publieke namen volgt niet wat een caller mag aanraken.
- **analytics:** ja — `interactionEventInputSchema` is het contract; tesnamen lezen als spec.
- **rag:** ja — `retrieveContext` JSDoc + Zod-velden.
- **ai:** ja — `generateText` / registry-commentaar. `sovereign: false`-pad is in commentaar, niet in tests.
- **shared:** gemengd. Env en agent-keys zijn helder; `caoLabeledPassages` in dezelfde barrel is bake-off-overblijfsel.
- **tenant:** ja, 97 regels, het commentaar *is* het oppervlak.
- **embed:** lokaal Zod, goed becommentarieerd waarom de fork bestaat.
- **ui:** props-in barrel; geen domeincontract.

### Waar wordt gevalideerd?

| Grens | Waar | Schema? |
|---|---|---|
| Env | `shared/src/env.ts:14+`; tenant-env `tenant/src/index.ts:20-25` | Zod |
| Agentvraag | `create-agent.ts:466` `questionSchema.parse` | Zod, daarna `as` |
| Retrieval (agent) | `cao/tools.ts:69` / `arbo/tools.ts:45` | Zod zonder `agentKey` |
| Retrieval (rag) | `retrieveInputSchema.parse` | Zod mét `agentKey` |
| Embeddings / LLM HTTP | `ai/src/models.ts` `mistralResponseSchema.parse` (`:266`), stream chunks `:347` | Zod |
| Model-proza + citation-JSON | `parseGenerationOutput` + `rawModelCitationSchema` | Zod op JSON; proza is `string`; daarna verbatim-verify |
| Eval-judge JSON | `evals/judge.ts` (fail-loud Zod, niet lijn-voor-lijn herlezen) | Zod |
| Roleplay-model JSON | `roleplay/schemas.ts:13-50`, `extractJsonObject` `:64` | Zod; score unbounded, clamp in `toScore` (commentaar `:27-30`) |
| Analytics write | `record.ts:23` | Zod; `agentId` = grounded enum |
| Analytics / DB **read** | Drizzle-rijen, `outcome` is `text()` | Geen Zod op read; `conversations.ts:311` `as TurnOutcomeValue` |
| `funds.theme` / instance `theme`/`texts` jsonb | `Record<string, unknown>`; `getFundTheme` `fund-lifecycle.ts:201` | Schrijven “validated by the caller” (`:204`); lezen **niet** |
| `sql.raw` + execute | `fund-schema.ts:59, 108, 134`; `search-path.ts:25` | Identifier via `quoteIdent`; resultaat `as unknown as Array<…>` |
| Chunk `metadata` jsonb | `RetrievedChunk.metadata` | ongetypt |
| Embed NDJSON / config | lokale Zod in `embed/src/types.ts` | Zod; `outcome: z.string()` ruimer dan shared |
| Bestanden (golden JSONL) | `evals/golden-set.ts` | parse + eigen schemas |

**Model-output is niet de ongevalideerde grens.** Citations gaan door Zod + verbatim-verify + `verifyAndBuild`. Wat wél open blijft: jsonb-thema, sql.raw-resultaten, roleplay `endReason as RoleplayEndReason` (`session-store.ts:185`), en de embed-uitkomststrings.

### `any` en ontsnappingen

`rg` in `packages/` op `: any`, `as any`, `@ts-expect-error`, `@ts-ignore`, `eslint-disable`: **geen treffers** op `63205ed`.

Wel `as`-casts. Ergste vijf:

1. `tx as unknown as Database` — `fund-lifecycle.ts:400`, `fund-environment.ts:177, 193`
2. `profile.questionSchema.parse(input) as AgentQuestion & { topK, minScore }` — `create-agent.ts:466` en `:605`
3. `execute(sql.raw(…)) as unknown as Array<…>` — `fund-schema.ts:59, 108`
4. `endReason: (row.endReason as RoleplayEndReason \| null)` — `session-store.ts:185`
5. `filter.outcome as TurnOutcomeValue` — `analytics/src/conversations.ts:311`

### Niet-null-asserties

`rg` op `!\.` en `!\[` in packages: geen productietreffers (alleen testhulp `release!: () => void` in `session-store.test.ts:36`). Wél `rewrittenQueries[0]!` in `rag/src/index.ts:51` — compiler overruled op een lijst die de loop zelf heeft gevuld.

---

## Deel 4 — Grenzen tussen packages

### Werkelijke graaf (uit `package.json` dependencies + imports)

```
shared  ←  ai, db, rag, agents, analytics
     ai  ←  rag, agents
     db  ←  rag, agents, analytics
    rag  ←  agents
     ui  ←  embed
 tenant  ←  (niemand in packages/)
analytics ←  (geen package-consumer)
  embed  ←  (geen package-consumer buiten ui)
 agents  →  ai, db, rag, shared
```

Geen pijl `packages → apps` (depcruise `no-packages-to-consumers`). Geen `embed → agents|db|rag|ai|analytics` (`no-embed-to-agents`).

### Hub

**`shared`** is waar alles naartoe wijst. Onderwerp: env, embeddings-pin, agent-keys, chat/citation/outcome-contracten, roleplay-publicatie. Dat is een kern. **Uitzondering:** `caoLabeledPassages` / `caoLabeledQueries` (`shared/src/index.ts:26-31`) — bake-off-materiaal in dezelfde barrel. Geen rommellade in z’n geheel; wél een zolderkamer.

**`db`** is de tweede magneet (rag, agents, analytics). Inhoud: data-toegang **en** DDL-strings **en** provisionering **en** LTI. Dat is ligging, niet één onderwerp. Zie F1-12.

**`agents`** is de dikke consument: orkestratie, evals, roleplay-persistentie via db. De naam “agents” dekt Mastra-verstoppen; hij dekt niet “dit package schrijft roleplay-sessions”.

### Afhankelijkheid die inhoudelijk schuurt

- `agents → db` voor `roleplay/session-store.ts` en `delivery-store.ts`: de agent-naad kent het fonds-schema. Verdedigbaar (één writer), maar het is geen dunne LLM-orkestratie meer.
- `runtime/profile.ts → cao/tools.ts` (types): de gedeelde pipeline is type-afhankelijk van de eerste specialisatie.
- `tenant` belooft de enige bron voor tenant↔fund (`250-move-protocol`: `packages/tenant — enige bron voor tenant↔fonds-mapping`). **Geen van de andere packages importeert het.** `db` bouwt schema’s zonder die mapping. Belofte zonder handhaving: F1-07.

### Belofte zonder depcruise-regel

| Belofte | Regel? |
|---|---|
| Mastra alleen in agents | Import-kant: ja (andere packages importeren geen `@mastra`). Geen cruiser-regel op `@mastra` in packages |
| DB alleen via `@wunderstack/db` | Gehouden in deze negen; `no-apps-to-fund-schema` bewaakt apps, niet of analytics SQL-strings intern houdt |
| 1-op-1 tenant = fund | Commentaar in `resolve-instance.ts:61` en `tenant/src/index.ts:3-5`. **Geen regel**, en de code van tenant **weerspreekt** de collapse zodra `TENANT_FUND` gezet is |
| UI kent geen agents | `no-ui-to-agents` — afgedwongen |
| Embed niet server-only | `no-embed-to-agents` — afgedwongen |
| `agentKey` op retrieval uit het profile | Geen type, geen regel; literal in tools |

---

## Deel 5 — Tests, en wat er niet getest is

### 1. Kaart (kort)

| Package | Testbestanden | Soort | CI (`turbo test:unit` in `.github/workflows/ci.yml:128`) |
|---|---|---|---|
| agents | 42 | unit + eval-invariants; `package.json#test` = `cao.eval.ts` (niet `test:unit`) | unit ja; Gate C/eval niet in dezelfde job |
| db | 13 | unit + isolatie; integration achter `GATE_DB` | unit ja; extra job filter db+analytics `:175-176` |
| analytics | 10 | unit; 1 integration `GATE_DB` | unit ja |
| shared | 10 | unit | ja |
| rag | 3 | unit (searchPath, rerank-status) | ja |
| ai | 2 | unit (`buildMistralRequestBody`) | ja |
| tenant | 1 | unit | ja |
| ui | 2 | unit, deels bron-als-tekst | ja |
| embed | **0** | — | niets te draaien |

### 2. Namen (steekproef van twintig)

Belofte-vorm (analytics, sterk): “a knowledge gap is a repeated question, not a refused turn”; “questions in one sitting are one conversation”; “exercise sessions are volume, never turns”; “rejects an exercise agent: a session is not an interaction event”; “is null for an empty corpus: nothing to approve is not a value”.

Functie-/invariante-vorm (agents/rag/ai): “derives EVAL_LLM_MODEL from DEFAULT_LLM_MODEL…”; “defaults to fund\_\<key\>”; “sends the stop sequences it was given”; “honours an explicit TENANT_FUND override”; “Chip carries --motion-state…”.

De reviewer die tesnamen als spec leest, leert het product uit analytics en de identiteitsbug uit tenant — niet uit hun ontmoeting.

### 3. Tests die bron als tekst matchen (binnen `packages/`)

| Pad | Wat |
|---|---|
| `analytics/src/signals.test.ts:15,57` | `readFileSync(signals.ts)` + `doesNotMatch(/openai\|summariz\|…/)` |
| `agents/src/evals/eval-model-coupling.test.ts:26-49` | regex op `cao.eval.ts` voor `EVAL_LLM_MODEL = …` — **bewuste invariant** (commentaar `:11-18`) |
| `agents/src/evals/gate-registry.test.ts:19` | leest `docs/eval/GATE-ARCHITECTURE.md` |
| `shared/src/browser.test.ts:11-14` | `browser.ts` mag `env` niet importeren |
| `ui/src/primitives/chip.test.ts:17` | class-strings in `chip.tsx` |
| `ui/src/tokens/reduced-motion.test.ts:19-20` | CSS-tokens |

Eerste is de zwakste (hernoem een helper, test rood, gedrag onveranderd). Eval-coupling en browser/env zijn invarianten die expres de bron lezen.

### 4. Beloftes zonder test

(Dit deel is expres langer dan 5.1–5.3. Groen CI bewijst deze claims niet.)

**Identiteit (de duurste).** `tenantFund` met `TENANT_FUND=elektronische-detailhandel` is getest (`tenant/src/index.test.ts:20-23`). `searchPathForRetrieve` default `fund_<fund>` is getest (`rag/src/retrieve.test.ts`). `instanceFromRow` zet `fundKey: row.tenantId` (`resolve-instance.ts:61-62`). **Geen test koppelt de drie.** Niemand faalt als de override een schema opent dat `fundSchemaName(getTenantId())` nooit aanmaakt. `listActiveFunds` levert `schemaName` uit `control.funds`; `withFundSchema` gebruikt die kolom niet (`fund-schema.ts:25-29`). Ongetest: “opgeslagen schemaName is het schema dat retrieval raakt.”

**`getTenantConfig` = CAO** (`agent-instances.ts:38-39`). Commentaar: back-compat. Geen test dat arbo-only tenants hier `null` krijgen terwijl `listInstances` rijen heeft. De naam belooft “de” config.

**90-dagen retentie.** Schema-commentaar `interaction-events.ts:12-13, 40` en `analytics/src/event.ts:38` claimen 90 dagen. In `packages/` is geen DELETE-job, geen test op leeftijd. De belofte is documentatie op een kolom.

**Soeverein-by-default.** `models.ts:10-13, 233-236` weigert `sovereign: false`. `packages/ai` tests (`models.test.ts`) dekken alleen `stop`-sequences. Registry bevat vandaag uitsluitend `sovereign: true`, dus de guard kan in de praktijk niet zakken — en is niet getest. Zelfde patroon in `rerank.ts:76-78`.

**`agentKey` uit het profile, niet uit een literal.** `cao/tools.ts:74` vs `caoProfile.agentKey`. Een kopie-fout (`"cao"` in de arbo-wrapper) zou retrieval op de verkeerde corpus zetten. Geen test dat `runRetrieval` het profile-key gebruikt; arbo/cao tests kunnen groen zijn met de literal.

**Dubbele arbo-rewrite.** Geen test dat `rewriteArboQuery` + `rewriteQuery` idempotent is, of dat expansions niet dubbel vuren.

**`found`/`turnOutcome` voor writers.** Pipeline-tests checken `refused("no_coverage")` (`turn-outcome-classification.test.ts`, `cao/agent.test.ts`). Geen package-test dat `recordInteractionEvent` hetzelfde object schrijft als `answer()` teruggeeft — de writer zit in apps.

**Retention van `getFundTheme`.** Schrijfzijde “caller validates with tenantThemeSchema” (`fund-lifecycle.ts:204`). Leeszijde cast. Geen test dat een corrupte jsonb-rij faalt in plaats van `{}` of garbage naar CSS te sturen. Embed valideert theme wél lokaal; de db-read niet.

**`copyPublicCorpusIntoFund`.** Bestaat nog (`fund-schema.ts:101`). Commentaar: no-op als public-tabellen weg zijn. Geen test dat callers dit niet meer als happy path gebruiken.

**Embed-contract-pariteit.** Commentaar eist gelijke discriminators met `chatEventSchema` (`embed/src/types.ts:15-16`). Nul tests, dus drift is stil.

**Roleplay `didPass` vs model `isPassed`.** `rubric.ts:51-57` zegt: wij rekenen, niet het model. `roleplayReviewOutputSchema` heeft `isPassed: z.boolean()` (`schemas.ts:46`). Geen test in de steekproef dat production `didPass(computeWeightedScore(…), threshold)` gebruikt en `isPassed` van het model negeert. (Als de reviewer dat in apps vindt: bijlage.)

**`funds.theme` vs instance `theme`.** Schema zegt instance-theme is legacy unused (`funds.ts:9`). Geen test die schrijven naar de verkeerde kolom vangt.

### 5. Scoring en drempels — kan hij zakken?

| Functie | Meet | Bereik | Gate | Kan zakken? |
|---|---|---|---|---|
| `scoreHardHallucination` `judge.ts:390-401` | Elk load-bearing feit letterlijk in grounding; 1 of 0 per case | Case: {0,1}; aggregate gemiddelde | Floor `0.98` (`answer-floors.ts:24`) | **Ja.** Eén verzonnen feit in ~50 cases duwt ~0.98. Naam zegt “score”; het is een binary fail. Meet wat de commentaar belooft, niet een graduele hallucinatiegraad |
| `scoreCitationVerification` `judge.ts:191-242` | Parsebaar block + niets gestripped + geen ongedekte `[n]` | Case {0,1}; count-gate `maxUnverifiedCount: 1` (`answer-floors.ts:53`) | Ja, count | **Ja.** Eén stochastische slip toegestaan; twee falen. Rate is trend, niet de gate (commentaar `:49-50`) |
| `orphanRate` / dangling | Marker zonder kaart / kaart zonder marker | 0–1 | `maxOrphanRate: 0` | **Ja.** Eén wees is rood |
| `scoreRefusalCalibration` `judge.ts:371-378` | Weigert iff fixture `refusal` | {0,1} | `refusalCalibration: 0.9` | **Ja** |
| LLM `faithfulness` / `relevance` / `completeness` | Judge-prompt, 0–1 | Ruis rond de floors (`relevance: 0.84` expres onder 0.85 wegens noise, `:26-29`) | Ja | **Ja**, en de drempel is bewust naast de ruis gezet — kan zakken, kan ook flaky rood |
| Langfuse `citation-verification-rate` `create-agent.ts:328-336` | `verificationFailed ? 0 : 1` | {0,1} per trace | Observatie, geen merge-gate | Ja per turn; geen CI-gate |
| `deriveRetrievalStrength` `analytics/.../retrieval-strength.ts:13-24` | hits=0 → none; topScore &lt; 0.6 → weak; anders strong | drie labels | **Geen merge-gate**; dashboard | **Ja** (0.59 vs 0.60). Naam klopt. Niet “bijna altijd max” |
| `computeWeightedScore` `roleplay/rubric.ts:63-78` | Σ(score×weight)/weightSum, 1 decimaal; 0 als niets gescoord | 0–10 (scores ongeclamped in schema, clamp elders) | `didPass` vs authored `passThreshold` | **Ja.** Exclusie van unsored criteria kan de drempel *makkelijker* halen — dat is gedocumenteerd, geen verborgen 10 |
| `didPass` `:82-83` | `weightedScore >= passThreshold` | boolean | LMS-cijfer | **Ja** |
| Roleplay floors `roleplay-floors.ts:37-99` | o.a. `maxPersonaBreakCount: 0`, `maxPassFlipCount: 0`, `minInRoleScore: 0.9` (judge) | counts / means | G2-roleplay | **Ja** waar count=0; `minInRoleScore` en `maxEndFlagMismatchCount: 1` hebben speelruimte |

Geen van de merge-gates is een functie die in de praktijk altijd het maximum teruggeeft. `scoreHardHallucination` aggregaat 0.98 bij N≈50 **is** krap: de drempel is geen decor.

---

## Deel 6 — Abstractie versus vijf fondsen

Per item: één implementatie? Tweede gebruiker in de repo? Verdedigd?

| Abstractie | # impl | Tweede gebruiker in repo? | Verdedigd? | Oordeel |
|---|---|---|---|---|
| `AgentRuntimeProfile` / `createGroundedAgent` | 1 factory | **Ja:** `cao` + `arbo` (`registry.ts:27-30`) | `DECISION-shared-agent-runtime` in commentaar `profile.ts:8` | Geen bevinding — regel van drie niet geschonden; tweede agent bestaat |
| `createCaoAgent` / `createArboAgent` | wrappers van 2 regels | Call-sites smoke/latency; catalog gebruikt `getAgent` | “retained for smoke/latency” (`cao/agent.ts:18`) | Licht: derde naam voor dezelfde factory. F1-09 |
| `AnswerGenerate` injectie (eval vs Mastra) | 1 naad | Eval + productie | Commentaar `create-agent.ts:533-535` | Verdedigd, twee callers |
| `TENANT_FUND` map | 1 echte entry `demo: demo` | Override via env is de “tweede”; mapping zelf groeit niet | Commentaar `tenant/src/index.ts:36-38` | Abstractie op verwachting van N fondsen; n=5 kan env-override. Conflict met db-collapse: F1-01, niet deze rij |
| `pickUnkeyedInstance<T>` | 1 | Demo-resolutie | Commentaar `resolve-instance.ts:21-24` | Verdedigd (D1) |
| Embed lokale Zod-spiegels | 1 set | Alleen embed | `embed/src/types.ts:4-16` | Verdedigd; tweede “gebruiker” is onmogelijk (env). Drift: F1-10 |
| `copyPublicCorpusIntoFund` | 1 pad | Public-corpus-tijdperk | Commentaar no-op | Dode abstractie. Licht G |
| `new Agent` + `new Mastra` per `createGroundedAgent` | 1 product | Cache per catalog-id | Walking skeleton, Mastra achter naad | Verdedigd door v1-regels |
| `caoLabeledPassages` in `shared` | 1 set | Bake-off / scripts? | Geen reden in de barrel | Shared als zolder. Licht G |
| `withFundContext` alias van `withSearchPath` | 1 | Twee namen | Commentaar track B | Licht, hinderlijk |
| `AgentKey = GroundedAgentKey` in registry | alias | Eval-compat | `@deprecated` `registry.ts:11-16` | Licht C, zit in F1-02 |
| Roleplay `extractJsonObject` vs judge `extractJsonPayload` | 2 parsers | Beide model-JSON | Commentaar in schemas.ts | Bijna drie; niet helemaal |

**Het omgekeerde — driemaal hetzelfde:**

- `cao/tools.ts` en `arbo/tools.ts`: retrieval-wrapper, hit-schema, meta-schema, `fullChunkContent`-mapping. Verschil: literal `agentKey`, arbo-rewrite + expansions. Had één functie met `agentKey` uit het profile gemoeten. F1-08.
- Citation-hit-vormen: agent-tools, rag `RetrievedChunk`, shared `Citation` — drie lagen, deels gerechtvaardigd (verificatie heeft full text).
- `getTenantConfig` naast `getInstance` + `listInstances`: oude één-agent-wereld naast de twee-agent-catalogus.

---

## Deel 7 — Per package, in één alinea

**`agents`.** Dit is waar de boutique zijn geld verdient, en het leest ook zo: `verifyAndBuild` is een geredeneerde wacht, niet een wrapper om `generateText`. De eval-scorers en floors zijn het sterkste stuk TypeScript in de negen packages — ze zeggen wat een groen CI hier wél mag betekenen. Het package is te groot (evals, roleplay-IO, Mastra, catalogus in één barrel) en de retrieval-types wonen nog bij CAO, maar een senior zou schrijven: *de substantie zit hier, en ze is serieus.*

**`db`.** Bekwaam en gevaarlijk tegelijk: `quoteIdent`/`assertFundKey` zijn de juiste paranoia, search_path is expliciet géén security boundary, en `instanceFromRow` zegt hardop dat tenant id de fund key is. De barrel dumpt DDL, grants en lifecycle naast de client. Een senior: *dit is een data-laag die ook een operatie-toolkit werd; de identiteit is een commentaar, geen invariant.*

**`analytics`.** De tesnamen zijn de beste specificatie in de repo; `interactionEventInputSchema` weigert roleplay als event. Daarna glijdt het: `getCorpusOverview(tenantId)` voedt `withFundSchema`, `agentId` waar de rest `agentKey` zegt. Een senior: *dit team kan producttaal, en het deelt die taal niet met db/tenant.*

**`rag`.** Klein, leesbaar, één pijplijn, Zod op de ingang, schemaName als bewijs van welk pad gezocht is. De `rewrittenQueries[0]!` is het enige compiler-overrule. Een senior: *dit is het pakket dat een walking skeleton belooft en waarmaakt.*

**`tenant`.** Zevenennegentig regels die het enige begrip definieren waar vijf fondsen op rusten — en geen sibling importeert het. De tests bewijzen een split die `db` dichtklapt. Een senior: *helder, en architectonisch wees.*

**`ai`.** Dunne soevereine naad, provider-JSON door Zod, stop-sequences getest omdat ze ooit stil ontbraken. De soeverein-guard zelf is dood codepad tot iemand `sovereign: false` registreert. Een senior: *juiste naad, tests volgen incidenten, niet de hoofdbelofte.*

**`shared`.** Noodzakelijke kern (env, keys, citations, outcomes) plus labeled CAO-passages in dezelfde export. `./browser` is de juiste split voor embed. Een senior: *zonder dit package cycli; met de eval-set erin is het nét geen rommel.*

**`embed`.** Eerlijk over waarom het `shared` niet mag raken; lokale Zod op een vijandige pagina. Nul tests op de discriminator-belofte. Een senior: *de fork is volwassen beargumenteerd en vervolgens onbewaakt.*

**`ui`.** Props-in primitives, chip- en reduced-motion-tests die bron/CSS lezen omdat het productregels zijn. Geen fondskennis, zoals beloofd. Een senior: *in deze audit het minst interessante package, en dat is een compliment.*

Kwaliteitsverschil: **agents (runtime + evals) steekt eruit.** **tenant en de identiteitsnaad tussen tenant/db/rag blijven achter** — niet omdat de code slordig is, maar omdat drie heldere verhalen naast elkaar staan. **embed** blijft achter op tests, niet op ontwerp.

---

## Bevindingen

Weegregel: 1× `blokkerend` (max 3), 3× `zwaar` op 14 = 21% (max een derde). `pas bij groei` nergens blokkerend.

### F1-01 — tenant, fund en schema zijn drie verhalen

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/tenant/src/index.ts:57-60`; `packages/db/src/resolve-instance.ts:61-62`; `packages/db/src/agent-instances.ts:15-16`; `packages/db/src/fund-schema.ts:25-29`; `packages/rag/src/retrieve.ts:143-145`; `packages/analytics/src/record.ts:40`; `packages/analytics/src/corpus.ts:69-73` |
| As | C |
| Ernst | `blokkerend` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Eén canonieke string voor het fysieke schema, en één test die `tenantFund()`, `fundSchemaName` en retrieval-search_path dezelfde waarde geven — of de override schrappen. |

**Rapportzin:** *Ik kan niet vaststellen welk Postgres-schema een vraag van OOMT raakt: tenant.ts test een TENANT_FUND-split, db bouwt fund_${tenantId} en noemt dat de fund key, rag zoekt in fund_${vraag.fund}.*

**Toets 2026-09-04:** `TENANT_FUND` is unset op de enige draaiende Scalingo-app (`wunderstack`; sleutel ontbreekt in de env) én in de lokale `.env` (`TENANT=oomt`).
**Bewijs:** `control.funds` rij `oomt` heeft `schema_name=fund_oomt`; answered-rij `545add2e-7f8f-4480-98cb-2d25c352cb35` (2026-09-03 20:35 UTC) staat in dat schema met `tenant_id=oomt` en `fund=oomt`.
**Conclusie: tak A** — drie namen, één string `fund_oomt`. Geen verkeerd-fonds-read. Ernst in dit register ongewijzigd; remediatie als `zwaar`.

**Gesloten 2026-09-04:** `TENANT_FUND` verwijderd; `tenantFund(id) === id`; identiteitstest in `packages/rag/src/fund-identity.test.ts`; `assertStoredSchemaName` op list/create.

### F1-02 — dezelfde agent, drie identifiers

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/shared/src/config/agent-keys.ts:17-35`; `packages/agents/src/catalog.ts:28`; `packages/agents/src/runtime/registry.ts:17`; `packages/analytics/src/event.ts:23`; `packages/db/src/schema/fund/interaction-events.ts:21` |
| As | C |
| Ernst | `zwaar` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Eén naam in schema, event-contract en catalogus (`agentKey` of `agentId`, niet beide). |

**Gesloten 2026-09-04:** event/Zod/JS `agentKey`; kolom `agent_id` blijft (`DECISION-agent-id-column.md`); catalog `id` ongewijzigd.

### F1-03 — `getTenantConfig` is de CAO-rij

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/db/src/agent-instances.ts:34-39` |
| As | C |
| Ernst | `zwaar` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | De CAO-default uit de naam halen of de functie laten falen als `agentKey` ertoe doet — arbo staat al in `AGENT_PROFILES`. |

**Gesloten 2026-09-04:** `getTenantConfig` verwijderd; gebruik `getInstance(tenantId, agentKey)`.

### F1-04 — jsonb theme/texts ongelezen ongevalideerd

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/db/src/fund-lifecycle.ts:193-201` (commentaar write-validatie `:204`); `packages/db/src/schema/control/funds.ts:16`; `packages/db/src/schema/control/agent-instances.ts:31-32` |
| As | D |
| Ernst | `zwaar` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Dezelfde theme-schema’s op de leesgrens toepassen die de caller op schrijven belooft. |

**Gesloten 2026-09-04:** `parseStoredFundTheme` / `tenantThemeSchema` op get/update (`fund-lifecycle.ts`).

### F1-05 — tests die broncode matchen

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/analytics/src/signals.test.ts:15,57`; ook `packages/ui/src/primitives/chip.test.ts:17`; `packages/shared/src/browser.test.ts:11` (die laatste twee zijn productregels) |
| As | E |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | `signals.test.ts:57` vervangen door een import van de verboden symbolen of schrappen; brontests alleen houden waar de constraint de bron *is*. |

### F1-06 — 90-dagen retentie is een commentaar

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/db/src/schema/fund/interaction-events.ts:12-13,40`; `packages/analytics/src/event.ts:38` |
| As | E |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | De retentiebelofte aan een job of een test hangen, of de claim uit het schema halen. |

**Gesloten 2026-09-04:** 90-dagenclaim uit code-commentaar; DECISION blijft beleidsbron (niet geautomatiseerd).

### F1-07 — `packages/tenant` is niet de mapping die db/rag gebruiken

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/tenant/src/index.ts:3-5,36-42` (belofte); geen `from "@wunderstack/tenant"` in de andere acht packages (zelf gezien, grep op clone) |
| As | B |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Of db/rag importeren de mapping, of de documentaire “enige bron”-claim schrappen; depcruise bewaakt dit niet. |

**Gesloten 2026-09-04:** tenant = fund 1-op-1; rag-identiteitstest koppelt tenant + `fundSchemaName` + `searchPathForRetrieve`; kolom blijft denormalized copy.

### F1-08 — CAO- en arbo-retrievalwrappers zijn kopieën

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/agents/src/cao/tools.ts:15-90`; `packages/agents/src/arbo/tools.ts:7-74`; types geïmporteerd in `runtime/profile.ts:4` |
| As | G |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Eén wrapper die `profile.agentKey` doorgeeft; `agentKey` hoort op `RetrievalInput`. |

**Gesloten 2026-09-04:** `runGroundedRetrieval` + verplicht `agentKey` op input; pipeline geeft `profile.agentKey` mee (`runtime/retrieval.ts`).

### F1-09 — drie factories voor twee profielen

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/agents/src/cao/agent.ts:18-20`; `packages/agents/src/arbo/agent.ts:17-18`; `packages/agents/src/catalog.ts:46`; barrel `src/index.ts:7-8` |
| As | G |
| Ernst | `licht` |
| Geldt | `pas bij groei` |
| Aanbeveling | Wrappers laten of barrel beperken tot `getAgent` / `createGroundedAgent`. |

### F1-10 — embed-contract zonder pariteitstest

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/embed/src/types.ts:4-16,33-36,40`; 0 `*.test.ts` in `packages/embed` |
| As | D |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Discriminators en citation-velden tegen `@wunderstack/shared/browser` (of een gedeeld enum) laten falen bij drift. |

**Gesloten 2026-09-04:** `packages/embed/src/contract-parity.test.ts` vs `@wunderstack/shared/browser`.

### F1-11 — parse + `as` wist de schema-inferentie

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/agents/src/runtime/create-agent.ts:466-469` en `:605` |
| As | D |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | `z.output` van `questionSchema` als inputtype van de pipeline gebruiken, geen intersectie-cast. |

### F1-12 — `@wunderstack/db` barrel is een operatie-dump

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/db/src/index.ts:1-54` (en verder: users, LTI, dumps) |
| As | G |
| Ernst | `licht` |
| Geldt | `pas bij groei` |
| Aanbeveling | Request-pad (client, schema, search_path, instances) scheiden van provisioner-SQL in het publieke oppervlak. |

### F1-13 — soeverein-guard ongetest

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/ai/src/models.ts:226-237`; tests: `packages/ai/src/models.test.ts` (alleen `buildMistralRequestBody`) |
| As | E |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Eén unit-test die een `sovereign: false`-registratie op `resolveModel`/`generateText` weigert. |

**Gesloten 2026-09-04:** `assertSovereignModel` + test-only `withTestModelRegistry` (`sovereign: false`).

### F1-14 — roleplay `endReason` ongevalideerd uit de rij

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/agents/src/roleplay/session-store.ts:185` |
| As | D |
| Ernst | `licht` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Kolomwaarde door `roleplayEndReasonSchema` halen, niet casten. |

**Gesloten 2026-09-04:** `roleplayEndReasonSchema.safeParse` in `loadSession`; analytics outcome filter via `z.enum(turnOutcomes)`.

---

## Bijlage — buiten `packages/` (ongenummerd, invoer fase 2–4)

- Chat-entry en `fund`-keuze: `apps/runtime` route + `lib/agent.ts` vullen `AgentQuestion.fund` en later `recordInteractionEvent({ tenantId, fund, agentId })`. Of die twee strings gelijk zijn, is een app-vraag die F1-01 waar of onschadelijk maakt.
- `.env.example:35-37` documenteert `TENANT=oomt` + `TENANT_FUND=elektronische-detailhandel` — dezelfde split als `tenant/src/index.test.ts`.
- `docs/runbooks/RUNBOOK-nieuw-fonds.md` noemt `TENANT_FUND=<fund-domeinnaam>`.
- Scripts importeren `@wunderstack/agents/evals/fund-ledger` (gedeclareerd subpad; diepe consument buiten packages).
- `apps/` schrijft analytics; package-test dekt de write-shape, niet de mapping vanuit `AgentAnswer`.
- Roleplay HTTP (`POST /api/roleplay/review`) zou moeten bewijzen dat `didPass` het model-`isPassed` overrulet — dat pad is apps.

---

## Wat het oordeel het hardst beweegt, per eenheid kosten

Maximaal acht, effect/kosten.

1. **Eén identiteitstest** die `getTenantId`, `tenantFund`, `fundSchemaName` en `searchPathForRetrieve` naast elkaar zet (F1-01). Zonder die test blijft de rest van `db`/`rag` onleesbaar voor een nieuwkomer.
2. **`getTenantConfig` hernoemen of laten falen** (F1-03). Twee minuten, haalt een val onder arbo weg.
3. **`agentKey` op `RetrievalInput` uit het profile** (F1-08 + raden-lijst 3). Kleine diff, stopt een stille corpus-verwisseling.
4. **`agentId` in het event-contract gelijk trekken met `agentKey`** (F1-02). Documentatie-plus-type, geen gedrag als de kolom mee verandert — of een alias in Zod.
5. **Theme-schema op `getFundTheme`** (F1-04). Zelfde schema als write; white-label is fonds 2 t/m 5.
6. **Embed discriminator-test** (F1-10). Voorkomt een stille widget-breuk zonder shared te importeren (`./browser` bestaat).
7. **Soeverein-unit-test** (F1-13). De hoofdbelofte van `ai` heeft nu alleen commentaar.
8. **Retentieclaim schrappen of schedulen** (F1-06). AVG-zin op een kolom zonder job is erger dan geen zin.

Einde fase 1. Geen code gewijzigd.
