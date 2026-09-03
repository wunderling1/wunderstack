# Notitie — nulmeting voortgangsweergave

Datum: 2 september 2026
Status: inspectie (PR-0). Geen code gewijzigd.
Aanleiding: `IMPLEMENTATIEPROMPT-voortgangsweergave.md` — PR-0 is een inspectie met
goedkeuringspoort. Deze notitie is die poort.

Alles hieronder is nagetrokken in de code, met pad + regelnummer. Waar de implementatieprompt
een aanname doet die niet klopt, staat dat er expliciet bij.

---

## 1. Waar wordt de driestappenlijst gerenderd, en wat stuurt hem aan?

**Eén plek, en die is app-lokaal in de playground:**

- `apps/playground/components/chat/message-list.tsx:92-142` — `AnswerSkeleton`, de verticale
  driestappenlijst (cirkel + label per stap).
- `apps/playground/components/chat/message-list.tsx:243` — de enige render-plek; alleen als
  `waiting` (streaming én nog geen tekst, regel 163).
- `apps/playground/components/chat/message-list.tsx:70-80` — `progressSteps()` bouwt de drie
  stappen met vaste iconen (`Search`, `ListChecks`, `ShieldCheck`).
- `apps/playground/components/chat/message-list.tsx:83-86` — `activeStepIndex()`: index van de
  actieve stap; `-1` valt terug op de eerste stap.
- `apps/playground/components/chat/message-list.tsx:64-68` — `DEFAULT_PROGRESS_STEPS`
  ("CAO doorzoeken" / "Passages beoordelen" / "Bronvermelding controleren").

**Aangestuurd door events, niet door een timer.** Er is geen `setTimeout`/`setInterval` in het
pad. De keten is:

- `packages/agents/src/runtime/create-agent.ts:647` — `status: searching`, vóór retrieval.
- `packages/agents/src/runtime/create-agent.ts:671-676` — `status: retrieved`, mét `count` en
  `topScore`, ná retrieval.
- `packages/agents/src/runtime/create-agent.ts:677` — `status: generating`, vóór de generatie.
- `apps/playground/components/chat/use-chat.ts:242-247` — de client zet `phase` op het
  ontvangen event.

Eén nuance: `apps/playground/components/chat/use-chat.ts:182` zet `phase: "searching"`
**optimistisch** bij verzenden, vóór enig server-event. Dat is de enige regel op het scherm die
vandaag niet uit een gemeten gebeurtenis komt. Onder B1 moet die weg of een eigen, eerlijke
"vraag verstuurd"-status krijgen.

De stappen zijn dus event-gestuurd, maar **grofmazig**: drie vaste fasen, geen enkel gegeven
over *wat* er doorzocht of gevonden is. De labels zijn bovendien tenant-configuratie, niet
code — zie vraag 6.

## 2. Wat zendt het chat-streamcontract vandaag uit?

Bron van waarheid: `packages/shared/src/contracts/chat.ts:48-86` (`chatEventSchema`, een
`discriminatedUnion` op `type`). De runtime re-exporteert hem via
`apps/runtime/app/api/chat/contract.ts`; de playground via
`apps/playground/app/api/chat/contract.ts`; de embed houdt een **losse spiegel** in
`packages/embed/src/types.ts:40-46` e.v. (mag `@wunderstack/shared` niet importeren).

| event | schema | regel |
|---|---|---|
| `status` | `{ type, phase: enum(searching\|retrieved\|generating), count?: int≥0, topScore?: 0..1 \| null }` | `chat.ts:49-56`, fasen op `:43` |
| `text` | `{ type, delta: string }` | `chat.ts:57` |
| `citations` | `{ type, found: bool, needsClarification: bool, turnOutcome: writableTurnOutcomeSchema, retrievedCount: int≥0, topScore: 0..1\|null, citations: citationSchema[], citationVerificationFailed: bool, answer: string }` | `chat.ts:58-69` |
| `followups` | `{ type, questions: string[≤3] }` | `chat.ts:70-74` |
| `done` | `{ type, usage: {promptTokens, completionTokens, totalTokens}, traceId: string\|null }` | `chat.ts:75-84` |
| `error` | `{ type, message: string }` | `chat.ts:85` |

Terminal/final-regels: `apps/runtime/lib/chat-stream.ts:25-35` (`citations|done|error` is
terminaal; `done|error` is final). De robuustheid (hartslag, beurtbudget, terminaal-garantie)
zit in `apps/runtime/lib/ndjson-stream.ts:70-136`.

## 3. Op welk moment zijn de retrieval-hits bekend, en wat staat er dan in scope?

`packages/agents/src/runtime/create-agent.ts:650`:

```
const retrieval = await retrieveTraced(profile, trace, { fund, topK, minScore, ...query });
```

Vanaf regel 650 is `retrieval` (type `RetrievalOutput`,
`packages/agents/src/cao/tools.ts:59-63`) in scope, met:

- `retrieval.hits` — `retrievalHitSchema`, `packages/agents/src/cao/tools.ts:28-33`:
  **alleen** `chunkId`, `ordinal`, `score`, `title`. **Geen** `article`, `chapter`, `sourceRef`
  of `heading`. Hieruit is geen leesbaar label te maken; `title` is de documenttitel
  ("CAO Metalektro 2026"), niet "Artikel 27 — Vakantie".
- `retrieval.chunks` — `RetrievedChunk[]` mét `structure` (`chapter`, `article`, `lid`,
  `sourceRef`) en `content`. Dit is de enige bruikbare bron voor een label.
- `retrieval.citations` — `Citation[]`-placeholders voor **alle** hits, gebouwd in
  `packages/rag/src/assemble.ts:43-60`.
- `retrieval.fullChunkContent`, `retrieval.context`, `retrieval.timings`.
- `retrieval.hits.length === 0` wordt op `create-agent.ts:652-668` afgehandeld als
  `refused("no_coverage")` — die tak zendt vandaag **geen** `status: retrieved` uit.
- Signalen: `retrievalSignalsFromHits(retrieval.hits)` op `create-agent.ts:670` levert
  `retrievedCount` + `topScore` (functie: `create-agent.ts:34-47`).

**Boven/onder `minScore` bestaat op dit punt niet meer.** Het filter zit in de retrieval-laag:
`packages/rag/src/retrieve.ts:236` (`.filter((hit) => hit.score >= minScore)`), vóór rerank.
Alles wat de agent bereikt is per definitie boven de drempel. Gevolg voor de reeks:

- `hits[].above` uit PR-1 zou **altijd `true`** zijn: een veld dat niets meet. Onder B1 hoort
  het er dan niet in.
- **D2 ("doorgestreepte passages onder de drempel") is vandaag niet te bouwen** zonder een
  wijziging in `packages/rag` (het gefilterde deel meeteruggeven). Dat is een retrieval-PR, geen
  UI-PR, en hij zit niet in de reeks.

Tweede vondst: `packages/rag/src/rerank.ts:92` vervangt `score` door de **relevanceScore van de
reranker**. De `score` die de agent na rerank ziet staat dus niet op dezelfde schaal als de
`minScore` waarmee gefilterd is. Een client-zichtbare drempelvergelijking zou een appel met een
peer vergelijken.

## 4. Bestaat er één functie die van een hit een leesbaar label maakt?

**Nee — en er zijn vandaag al twee paden die uit elkaar lopen.**

- Het "goede" label: `deriveHeading()` in
  `packages/agents/src/runtime/build-citations.ts:62-81`, met
  `extractArticleTitle()` op `:84-95` en `HEADING_REGEX` op `:55`. Dit levert
  "Artikel 12, lid 2 — Vakantie". Het is **niet geëxporteerd** en loopt **alleen** voor
  citaties (`buildVerifiedCitations`, `:11-53`), dus alleen voor chunks die het model heeft
  geciteerd.
- Het zwakke label: `packages/rag/src/assemble.ts:57` zet voor álle hits
  `heading: hit.structure.sourceRef` — dus "Artikel 12" zonder titel, en `null` als er geen
  structuur gedetecteerd is.
- De chip rendert: `apps/playground/components/chat/citation.tsx:19-22` —
  `heading ?? sourceRef ?? title`. De embed doet het net anders:
  `packages/embed/src/embed-app.tsx:305` — `sourceRef ?? heading ?? title` (**omgekeerde
  voorkeur**; twee surfaces, twee labels voor dezelfde bron).

PR-1 regel 2 ("`hits[].label` gebruikt DEZELFDE labelfunctie als de citatiechips") vraagt dus
om werk dat de reeks niet benoemt: `deriveHeading` uit `build-citations.ts` lichten naar één
geëxporteerde labelfunctie, en `assemble.ts:57` + `citation.tsx` + `embed-app.tsx` daarop
zetten. Dat is een eigen, kleine PR vóór PR-1 — anders bouwen we het derde labelpad in plaats
van één bron.

## 5. Welke waarde schrijft analytics weg als outcome, en is die beschikbaar als de stream sluit?

- Beslispunt: `packages/agents/src/runtime/create-agent.ts:164-239` (`verifyAndBuild`) —
  `refused("guard_hard_fact")` op `:196`, `refused("guard_citation_coupling")` op `:211`,
  `answeredGrounded()` op `:223`, `refused("no_coverage")` op `:234`. De clarify-tak levert
  `clarifiedOutcome()` op `:634`, de lege-retrieval-tak `refused("no_coverage")` op `:658`.
- Waarden: `packages/shared/src/contracts/interaction-outcome.ts:46-58`
  (`writableTurnOutcomeSchema`): `answered | refused | clarified | error`, elk met een
  `outcomeReason`.
- Wegschrijven: `apps/runtime/app/api/chat/route.ts:210-229`. `resolvedOutcome` (`:210-214`)
  neemt `event.turnOutcome` van het `citations`-event over (opgevangen op `:196-197`), of
  `errored("timeout")` / `errored("provider_error")` als de stream faalde.

**Ja, dezelfde waarde is beschikbaar als de stream sluit — hij zit er zelfs al op de lijn.**
`turnOutcome` staat in het contract op `packages/shared/src/contracts/chat.ts:62`. De client
negeert hem: `apps/playground/components/chat/use-chat.ts:257-264` leest alleen `found` en
`needsClarification`; `packages/embed/src/embed-app.tsx:177-183` leidt `refused` af uit
`!found && !needsClarification` — precies de tweede classificatie in de UI die B5 verbiedt.

Consequentie voor de reeks: PR-1 hoeft **geen** `outcome`-veld toe te voegen aan het terminale
event. Het werk is (a) `turnOutcome` doorzetten naar client-state, (b) de afgeleide
`refused`-berekening in de embed schrappen. Eén uitzondering: de `error`-uitkomst wordt pas ná
de stream bepaald (`route.ts:210-214`) en komt dus nooit als `turnOutcome` over de lijn; de
client heeft daar alleen het `error`-event. Dat is precies de vierde toestand van PR-5, en die
is dus met bestaande gegevens te bouwen.

## 6. Wordt het component gedeeld tussen embed en playground?

**Nee. Het bestaat op vier manieren, en de gedeelde versie heeft nul consumenten.**

- `packages/ui/src/trust-patterns/answer-progress.tsx:29-85` — `AnswerProgress`, een
  props-in trust-pattern met een `steps`-array, `activeId`, density-`size`, en inline SVG
  (Lucide-vrij, zodat de embed hem kan gebruiken). Geëxporteerd op
  `packages/ui/src/index.ts:98-101`. **Geen enkele consument in de repo** — de enige andere
  vermelding is `docs/decisions/DECISION-ui-density.md:43`.
- `apps/playground/components/chat/message-list.tsx:92-142` — `AnswerSkeleton`, een
  bijna regel-voor-regel duplicaat van `AnswerProgress`, maar met Lucide-iconen.
- `packages/embed/src/embed-app.tsx:174-189` — `applyEvent` heeft **geen** `status`-tak; de
  embed toont tijdens het wachten `"…"` (`:295`). De embed is het oppervlak dat op de site van
  het fonds staat en heeft dus vandaag de zwakste wachtervaring.
- `apps/roleplay/components/transcript.tsx:30-34` — een derde variant ("Antwoordt…" +
  `Loader2`), buiten scope van deze reeks maar wel de vierde stijl voor hetzelfde probleem.

Daarbovenop is de labelset **tenant-data**, niet code:
`packages/shared/src/contracts/tenant-config.ts:71-77` (`statusLabels`, strikt drie velden),
gevuld in `apps/runtime/app/api/config/route.ts:14-25` (defaults per agent) en `:77`
(override uit `agent_config`). Ook `scripts/ingest/oomt-instances.ts:74-75` zaait ze.

Dit is de belangrijkste structurele bevinding: een event-gestuurde weergave heeft geen drie
configureerbare fase-labels meer nodig. `statusLabels` als strikt drieveldenobject is een
contract dat de nieuwe weergave in de weg zit; het moet in dezelfde beweging herzien of
uitgefaseerd worden, anders configureren fondsen labels die niets meer aansturen.

**D4 is hiermee beslist:** het component hoort in `packages/ui`, en de samenvoeg-PR is
`AnswerProgress` de eerste echte consument geven — niet een vijfde variant bouwen.

---

## De vier aannames uit de implementatieprompt

| aanname | verdict |
|---|---|
| "het chatcontract kent vandaag alleen tokens, citaties en een terminaal event — geen retrieval- of verificatie-events" | **Onjuist.** Er is al een `status`-event met `phase`, `count` en `topScore` (`chat.ts:49-56`), en het terminale `citations`-event draagt al `turnOutcome`, `retrievedCount` en `topScore` (`chat.ts:58-69`). Wat mist is **per-hit** informatie en een `verify`-event. |
| "`verifyAndBuild` geeft `notFoundMessage` + `found: false` waar analytics `refused/no_coverage` schrijft" | **Klopt.** `create-agent.ts:230-238`, plus de lege-retrieval-tak op `:652-668`. |
| "de drie stappen worden client-side afgeleid uit streamvoortgang of uit een timer, niet uit retrieval-data" | **Half onjuist.** Geen timer: de stappen komen uit echte `status`-events (`create-agent.ts:647`, `:671`, `:677`). Wél waar dat ze niet uit retrieval-*data* komen — de fase is grofmazig, en de eerste stap is optimistisch client-side (`use-chat.ts:182`). |
| "het component leeft in de embed-widget en wordt door playground hergebruikt" | **Onjuist, en omgekeerd.** Het component leeft app-lokaal in de playground (`message-list.tsx:92`); de embed heeft er geen. De gedeelde versie in `packages/ui` bestaat wel en wordt door niemand gebruikt (vraag 6). |

## Overige blokkerende bevindingen

1. **`mockup-loading-states.html` bestaat niet in de repo.** PR-3 ("bouw naar
   mockup-loading-states.html") en D1/D3 ("kalibreren op de mockup") hebben geen bron. Het
   bestand moet erbij komen (in `tmp/` of `docs/design/`) of de reeks moet zonder visuele
   referentie beslist worden.
2. **PR-1's verbod op scores naar de client is vandaag al overtreden.** `topScore` staat in het
   publieke contract op `chat.ts:55` én `:64` en gaat dus nu al naar elke embed-client. Ofwel het
   verbod geldt alleen voor de nieuwe velden — dan is B1/PR-1 inconsistent met wat er staat —
   ofwel `topScore` moet uit het contract. Dat laatste raakt `route.ts:192-199`
   (analytics leest hem van het event) en vergt eerst een server-side alternatief.
3. **CI verbiedt animaties in `apps/**`.** `scripts/check-motion.sh:103-123` (Rule 4) faalt op
   `@keyframes` en op elke `animate-*`/`transition-*`-utility onder `apps/`. De glans van PR-3
   (`background-clip: text`) kán dus niet in de playground-app wonen; hij moet als token/klasse
   in `packages/ui/src/styles.css` + het gedeelde component. Extra reden voor D4 → `packages/ui`.
   Reduced motion is daar al geregeld (`packages/ui/src/tokens/semantic.css:93`, getest in
   `packages/ui/src/tokens/reduced-motion.test.ts`).
4. **"~55 bestaande streamtests" is te hoog.** Feitelijk: 9 in
   `apps/runtime/lib/chat-stream.test.ts`, 2 in `apps/runtime/app/api/chat/contract.test.ts`,
   3 in `packages/agents/src/runtime/create-agent.characterization.test.ts`, 1 in
   `packages/agents/src/runtime/agent-3-profile-seam.test.ts`, 3 in
   `packages/agents/src/catalog.test.ts` — samen 18 op het chat-streampad (de 8 in
   `roleplay-stream.test.ts` zijn het zusteroppervlak). De DoD "de ~55 bestaande streamtests:
   zelfde aantal" is niet toetsbaar zoals geformuleerd; maak er "alle tests in deze vijf
   bestanden blijven groen" van.
5. **Het `verify`-event van PR-1 heeft geen natuurlijk moment "per citatie".** Verificatie
   gebeurt in één keer over alle markers: `verifyCitations(...)` op
   `create-agent.ts:180`, en `verifyAndBuild` is een pure functie die niets kan `yield`en. Eén
   `verify`-event per citatie uitzenden "op de plek waar het oordeel valt" vraagt dus dat
   `verifyAndBuild` een generator wordt of een callback krijgt. Dat is een echte wijziging aan de
   G4-naad (buffer-to-verify) en verdient een eigen beslissing, geen bijzaak in PR-1.
6. **PR-1's `retrieval`-event kan zijn corpus-veld deels niet vullen.** `corpus.version` is er
   (`RetrievedChunkSource.version`, `packages/rag/src/retrieve.ts:65`), en `corpusVersion` gaat
   al mee als trace-metadata (`route.ts:127`). Maar `corpus.passageCount` — het totaal aantal
   passages in het corpus — staat nergens in `RetrievalOutput`; dat is een aparte query. Onder
   PR-1 regel 1 ("vind je geen bron, laat het veld weg en meld dat"): **laat weg**.
7. **D6 is niet "later goedkoop".** De event-log slaat één rij per beurt op met
   `retrievedCount` / `topScore` / `citationCount` (`route.ts:216-229`), geen per-hit labels. Het
   gespreksdetail in het dashboard (`apps/dashboard/components/fund/conversation-detail.tsx`)
   kan de weergave dus niet terugkijkend reconstrueren zonder nieuwe opslag.

## Aanbevolen wijziging in de PR-volgorde

De reeks werkt, maar mist twee PR's aan de voorkant en één in het midden:

1. **PR-0a — één labelfunctie.** `deriveHeading` naar één geëxporteerde bron; `assemble.ts:57`,
   `citation.tsx:19-22` en `embed-app.tsx:305` daarop. Puur refactor, functioneel identiek
   (verhuisprotocol: geen gedragswijziging in dezelfde PR).
2. **PR-0b — `AnswerProgress` krijgt zijn eerste consument.** Playground's `AnswerSkeleton`
   vervangen door het bestaande `packages/ui`-component, embed erop aansluiten. Functioneel
   identiek in de playground, een verbetering in de embed. Dit is D4 uitvoeren vóór PR-3, zoals
   D4 zelf al voorschrijft.
3. **PR-1 wordt kleiner:** alleen het `retrieval`-event (met `hits[].label`, zonder `above`,
   zonder `corpus.passageCount`) plus `turnOutcome` doorzetten naar de client. Het `verify`-event
   verhuist naar een eigen PR met een eigen beslissing over de G4-naad.
4. **D2 vervalt of wordt een retrieval-PR.** Zonder wijziging in `packages/rag` bestaan
   onder-de-drempel-passages niet in de agent-scope.

---

## Definition of Done (PR-0)

- [x] `docs/decisions/NOTITIE-voortgangsweergave-nulmeting.md` bestaat, met per vraag pad + regel
- [x] Elke `(aanname)` uit de implementatieprompt is bevestigd of vervangen
- [x] Geen diff buiten dit bestand — let op: de werkkopie bevat al ongerelateerde wijzigingen
      van `perf/dashboard-2026-09-01`; deze notitie voegt daar één nieuw bestand aan toe en
      wijzigt niets anders

**Goedkeuringspoort.** PR-0a begint pas na akkoord op deze notitie, met een besluit over de vier
punten onder "Aanbevolen wijziging in de PR-volgorde".
