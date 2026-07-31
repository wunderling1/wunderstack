# Besluitnota — de fonds-refusal-guard eist iets wat op een echt corpus niet kan

> **Hoort bij:** P0.2 uit `docs/plans/PLAN-gate-scalability-test.md` (laatste openstaande voorwaarde
> vóór de koude doorloop) en het slotverslag van het ingest-herstelplan.
> **Datum:** 2026-07-31 · **Labels:** [gemeten] · [feit] · (aanname)
> **Status:** **BESLOTEN EN UITGEVOERD — optie A** (commit `c795081`), en gemeten op de echte pipeline:
> alle drie de fondsen halen 3/3 lege probes en de volledige suite eindigde integraal groen
> (`docs/eval/RUN-verificatie-guard-2026-07-31.md`). Optie B staat als open besluit **B7** in
> `GATE-ARCHITECTURE.md`.
> **Ruwe data:** `scripts/eval/refusal-guard-report.md` (regenereerbaar met
> `pnpm --filter @wunderstack/eval-scripts refusal-guard-probe`).

**Kort:** de refusal-guard van de fondslaag is niet verkeerd *gekalibreerd* maar verkeerd
*gespecificeerd*. Hij gebruikt de golden `refusal`-cases als out-of-corpus-probes en eist nul
treffers, terwijl dat bijna-treffers zijn die per ontwerp iets ophalen. Op `etd-full` bestaat er
**geen enkele drempel** die de bijna-treffer buitenhoudt zonder echte vragen mee te slopen. De basis-
laag documenteert dit probleem al en loste het op met eigen onzinvragen — de fondslaag doet precies
wat dat commentaar verbiedt (`cao.eval.ts:158-165` vs. `cao.eval.ts:825-835`).

---

## 1. De meting [gemeten, read-only]

Alle scores zijn pgvector-cosinesimilariteit vóór rerank. Dat is waar de guard beslist: `retrieve.ts:175`
filtert op `score >= minScore` en rerank kan die lijst alleen inkorten, nooit aanvullen. Eén
query-embedding en één pgvector-read per probe, geen enkele LLM- of rerank-call.

| Fonds-set | bijna-treffer max | laagste echte vraag | onzinvraag max | Guard vandaag | Met eigen probes | Eén drempel scheidt? |
|---|---|---|---|---|---|---|
| `demo` (32 chunks, markdown) | 0,515 | 0,700 | 0,366 | **FAAL** (0/2 leeg) | 3/3 leeg | ja |
| `etd-full` (245 chunks, PDF) | 0,647 | 0,569 | 0,377 | **FAAL** (0/1 leeg) | 3/3 leeg | **nee** |
| `etd` (31 fixture-passages) | 0,465 | 0,520 | 0,370 | pass (3/3 leeg) | 3/3 leeg | ja |

## 2. Wat de meting vaststelt

**a. Eigen out-of-corpus-probes werken op élk corpus, met ruime marge.** De drie onzinvragen van de
basislaag (tarte tatin, zonuren in Valencia, M8-bout) halen op alle drie de corpora **nul** treffers;
hun hoogste score is 0,378 tegenover een vloer van 0,48. De "weiger zonder LLM-call"-route is dus
gewoon te bewaken op een echt corpus — dat is geen aanname meer.

**b. De bijna-treffer is op `etd-full` niet buiten te houden.** De probe komt op 0,647 met 12 treffers
boven de vloer. Twee echte vragen zitten daaronder (etdf-06 op 0,569 en etdf-04 op 0,642) en een derde
staat er 0,005 boven (etdf-03 op 0,652), terwijl de run-op-run-ruis van de embedding ±0,003 is. Er is
dus geen scheidingsvlak: dit is per definitie geen kalibratieprobleem.

**c. Het groen op de fixtureset was geluk, geen ontwerp.** Daar liggen de bijna-treffers op
0,447–0,465, dus **0,015 tot 0,033 onder** de vloer van 0,48 — een marge van dezelfde orde als de
meetruis. Eén extra passage of één re-embed kantelt die gate. Dat is exact hetzelfde vacuüm-groen dat
`demo` vóór de re-ingest liet zien, alleen minder zichtbaar.

**Bijkomende observatie [gemeten].** De top-treffer van een bijna-treffer is meestal géén
inhoudelijk aangrenzend artikel maar CAO-*boilerplate*: "Hoofdstuk 1 – Bereik van de cao" (etd-full),
"Artikel 2 – Looptijd" (demo). De vragen bevatten "volgens deze cao" / "biedt deze cao", en dat matcht
de zelfverwijzende tekst van de CAO zelf. Er zitten dus twee mechanismen achter dezelfde score:
inhoudelijke nabijheid én de vraagformulering.

## 3. Waarom `minScore` verhogen afvalt

Om de bijna-treffer op `etd-full` buiten te sluiten moet de vloer boven 0,647. Dan verdwijnen
etdf-06 en etdf-04 volledig uit retrieval en staat etdf-03 binnen de ruis. Je ruilt dus twee tot drie
echte antwoorden in voor één groen vinkje, en je verandert daarbij **productiegedrag** (de agent gaat
vaker weigeren) om een testuitkomst te repareren. Dat is de C4-reflex uit
`docs/eval/intervention-log.md` in zijn zuiverste vorm. Afgevoerd.

Ook afgevoerd: **de probevragen herformuleren** zodat ze lager scoren (bijvoorbeeld zonder "deze
cao"). Echte gebruikers vragen het juist zo; een probe onrealistisch maken om een guard te laten
slagen is het probleem omkeren.

## 4. Opties

| # | Optie | Wat je krijgt | Kosten | P0.2 |
|---|---|---|---|---|
| **A** | Fondslaag krijgt **eigen out-of-corpus-probes** (de drie onzinvragen, per fonds herbruikbaar). Bijna-treffer-cases blijven in de golden set maar voeden de retrieval-guard niet meer | De "weiger zonder LLM"-route bewaakt op de echte corpora, met marge. Fondslaag komt in lijn met wat de basislaag al documenteert | Klein: één functie in `fundLayerChecks`, geen productiewijziging | Kan groen worden |
| **B** | A **plus** de bijna-treffers op de **antwoordlaag** meten per fonds (weigert de agent als retrieval alleen aangrenzende tekst oplevert?) | De inhoudelijk waardevolle eigenschap wordt écht bewaakt in plaats van weggelaten | Groter: de fondslaag doet nu geen antwoordscoring; kost LLM-calls per fonds per nacht | Kan groen worden |
| **C** | Guard herformuleren als **marge** in plaats van vloer (bijna-treffer moet onder de laagste echte vraag liggen) | Klinkt principieel | — | **Blijft rood**: op `etd-full` bestaat die marge niet (§2b) |
| **D** | `minScore` verhogen | — | Breekt 2–3 echte vragen, verandert productiegedrag | Groen op valse grond |

## 5. Aanbeveling

**A nu, B op de backlog met een expliciete open-besluit-regel.** A haalt de guard uit de onmogelijke
eis en bewaakt de route die hij wilde bewaken; dat is geen verzwakking maar het corrigeren van een
specificatiefout die de codebase zelf al had opgeschreven. B is de eigenschap die je eigenlijk wilt,
maar die hangt aan antwoordscoring per fonds — dat is een aparte beslissing over nachtelijke kosten,
niet iets om in dezelfde stap mee te nemen.

Belangrijk voor de eerlijkheid van het dossier: A verandert een test, en dat is **categorie C4**, de
categorie die het protocol als rode vlag bestempelt. Het verschil met een verboden C4 is dat de
rechtvaardiging niet "de run moet groen" is maar een meting die aantoont dat de eis onvervulbaar is,
plus een commentaarblok in dezelfde file dat dit vóór dit werk al vaststelde. Dat hoort zo in het
interventielog te staan, mét deze nota als bewijs — niet als voetnoot.

## 6. Gevolg voor het startersjabloon

`docs/eval/golden-sets/TEMPLATE-starter.md` schrijft nu een bijna-treffer voor als refusal-case en
waarschuwt al dat die op een rijk corpus rood valt. Kiest u A, dan moet die waarschuwing vervangen
worden door de nieuwe werkelijkheid: de bijna-treffer is een *antwoord*-case, en de retrieval-guard
gebruikt vaste onzinvragen die elk fonds deelt. Zonder die aanpassing erft fonds #2 dit probleem.

## 7. Wat hier bewust NIET is gedaan

Geen codewijziging, geen drempelwijziging, geen re-ingest, geen gate-run. Het enige toegevoegde is een
read-only meetinstrument (`scripts/eval/refusal-guard-probe.ts`, patroon van `rerank-ablation.ts`) en
zijn rapport. Kosten: ~63 query-embeddings, geen LLM- en geen rerank-calls.
