# DECISION — Weigeringstypen en verduidelijkingen

**Status:** vastgesteld · **Datum:** 5 september 2026
**Amendeert:** [DECISION-kennisgaten.md](./DECISION-kennisgaten.md) D2 (A3');
[ADR-multitenant-database.md](../architecture/ADR-multitenant-database.md)
(`agent_config`: weigerzinnen vs. routeringsinhoud, A2).
**Geamendeerd:** 5 september 2026 (avond) — A3' en krimp Fase 1 na
[FASE-0-weigeringstypen-2026-09-05.md](../eval/FASE-0-weigeringstypen-2026-09-05.md).
**Raakt:** grounded agents (cao, arbo); G1-contract / G2-answer;
`golden-set.base.jsonl`; `create-agent.ts`; `packages/agents/src/arbo/prompt.ts`;
fondsschema-CHECK op `interaction_events`.
**Cross-corpus:** alleen voorsortering (§6), geen bouwopdracht.

Voorstel 4 september 2026, bekrachtigd 5 september op §3 (B1–B8) en §7 (D1–D6)
met vier amendementen. §1 van het voorstel is hieronder gecorrigeerd op de
actuele stand; regelnummers zijn van 5 september 2026.

---

## 0. Kern

> **De verzameling zinnen die een inhoudelijke claim over het domein mag dragen
> groeit niet. Alleen de zinnen die géén claim dragen groeien.**

Elke beurt eindigt in precies één outcome. Een warmere weigering blijft
`refused`. Er komt geen tussencategorie tussen antwoord en weigering. Het
hulpblok wordt ná `verifyAndBuild`, de hard-fact-guard en de
citation-coupling-guard samengesteld uit slots, niet erdoorheen gegenereerd.

Vier amendementen op het voorstel. Zonder deze vier botst Fase 1 met bestaande
besluiten, of meet de classifier iets dat de logs niet bevatten.

| # | Amendement | Raakt |
|---|---|---|
| **A1** | `needs_specification` hoort niet in de weiger-enum; het is een `clarified`-reden | B3, D4, D5 |
| **A2** | Grens platformcode ↔ dashboard: typezinnen blijven code; alleen routeringsinhoud mag content worden | B7, ADR |
| **A3'** | Fondslijst toont alleen `out_of_domain`, `out_of_scope`, `partial_evidence`. `no_coverage` volgt de oude D2 (sterk → admin). Guards blijven admin. | D3, `DECISION-kennisgaten` |
| **A4** | Fase 1 mag geen `clarified` schrijven zolang de oude weigerzin wordt geserveerd | D5 |

Niet heronderhandeld: geen tussencategorie, geen LLM-classifier in Fase 1, geen
nieuwe G-laag, `verifyAndBuild` ongemoeid, cross-corpus alleen voorsorteren,
hulpblok ná de guards uit de vier bronnen, arbo (b) in Fase 1 als enige
tekstwijziging (samen met de fall-through-fix, §1.3).

---

## 1. Stand van de code (errata op het voorstel)

### 1.1 G2-answer is groen, niet rood

`packages/agents/src/evals/fixtures/baseline.json` heeft `hardHallucination: 1`
op corpus v5. [GATE-ARCHITECTURE.md](../eval/GATE-ARCHITECTURE.md) pint de
nightly van 29 augustus 2026 (38/38). De rode 0,974 van 26 augustus is niet
meer de lat.

Opnieuw meten vóór de eerste implementatie-PR blijft hygiëne, geen blokkade.

### 1.2 De fixture-hash-guard slaat niet over

`GOLDEN_CORPUS_VERSION` is `"5"` en de baseline ook. De v4/v5-skip is weg.
Elke wijziging aan `golden-set.base.jsonl` — inclusief `expectedRefusalType` —
triggert de guard. Bump de corpusversie in dezelfde PR, anders wordt G1 rood.

### 1.3 Arbo (a) en (b) staan al in `prompt.ts`

Niet "ontworpen, niet gebouwd".

- **(a)** `NOT_IN_CATALOG_MESSAGE` — aanwezig.
- **(b)** `OUT_OF_SCOPE_MESSAGE` — aanwezig, en noemt de CAO-agent. De serve-path
  overschrijft modelweigeringen met `profile.notFoundMessage` (de arbo-lek in
  `create-agent.ts`).
- **(c)** de werkgebiedzin ontbreekt nog.

De B6-herschrijving van (b) is dode prompttekst tot de fall-through het type
laat staan. Die fall-through hoort bij dezelfde stap als de herschrijving.

### 1.4 Fase 1-relevant

- Clarify: `create-agent.ts` regels 501 (sync) en 640 (stream), vóór retrieval.
  Alleen cao heeft een functie; arbo heeft `clarify: null`.
- DB-CHECK `interaction_events_outcome_check` dekt alleen `outcome`
  (`answered` / `refused` / `clarified` / `error` / `unknown`), **niet**
  `outcome_reason`. Redenen leven in Zod (`refusedReasons`). Een Fase-1-DoD
  "INSERT met onbekende reason faalt op DB-niveau" vraagt een **nieuwe CHECK
  op het paar (`outcome`, `outcome_reason`)**, niet een groei van migratie
  `0004`.
- `out_of_scope` bestaat al in `refusedReasons`. De enum is niet alleen
  `no_coverage` + guards.
- 10 van 38 base-cases zijn refusals (corpus v5). `docs/STATUS.md` is stale
  (31/3) en gaat mee in de eerste implementatie-PR.
- Signalen per beurt (`outcome`, `outcome_reason`, `retrieved_count`,
  `top_score`) staan al in `interaction_events`.
- Weigervloeren `maxUnderRefusalCount`, `maxOverRefusalRate`,
  `refusalCalibration` in `ANSWER_THRESHOLDS` blijven `mechanism`.
- `SignalsQuery.theme` is een dormant kolom, geen classifier — andere as dan
  weigertype; niet hergebruiken (D3).

---

## 2. Bouwstenen (B1–B8)

| # | Besluit |
|---|---|
| **B1** | **Retrieval draait altijd.** Een terminaal "staat niet in het corpus" moet gedekt zijn door een echte retrieval-run. Een pre-retrieval oordeel mag uitsluitend `clarified` of een doorverwijzing opleveren, nooit `refused` / `no_coverage`. Vandaag grotendeels zo: retrieval draait, daarna `refused("no_coverage")` bij 0 hits; clarify is de enige pre-retrieval-uitgang. Wat B1 nog niet koopt: §7.1. |
| **B2** | **De uitkomst blijft binair op de gronding.** `answered` met citaties, of `refused` zonder. Een warmere weigering blijft `refused`. Geen tussencategorie, geen "gedeeltelijk antwoord" als eigen outcome. |
| **B3** | **Het weigertype is een classificatie ván de weigering, niet een nieuwe outcome.** Het landt in `outcome_reason`. De reason-enum groeit; de outcome-enum niet. **A1:** `needs_specification` komt niet in `refusedReasons`; onder D4/D5 is het een `clarified`-reden. |
| **B4** | **Het hulpblok put uit vier bronnen en geen vijfde** (§3.2). Elke zin die een domeinclaim draagt heeft een citatie; alle andere zinnen dragen geen claim. Parametrische modelkennis is geen bron. |
| **B5** | **De taxonomie volgt uit de logs, niet uit dit document.** De typenlijst in §3.1 is een hypothese. Fase 0 typeert bestaande `refused`-beurten met de hand; wat daar niet in voorkomt wordt niet gebouwd. |
| **B6** | **Een uitspraak over de scope van dít corpus vraagt geen bewijs; een uitspraak over de inhoud van een ander corpus vraagt een retrieval-run tegen dat corpus.** Daartussen zit niets. In Fase 1 is de herschrijving van arbo (b) tot een zuivere scope-uitspraak de **enige** tekstwijziging — samen met de fall-through-fix (§1.3). |
| **B7** | **Weigerteksten zijn platform-vorm en fondscontent tegelijk.** Types, routeringstabel en opbouwregels zijn platformconstant (code). Routeringsinhoud per fonds (contactroute, formulier, termijn) is content, beheerd in het dashboard, met eigen visuele markering — nooit een `[n]` op de brontekst. **A2:** typezinnen verhuizen niet naar het dashboard. "Fonds vraagt eigen weigerteksten" heropent dit besluit, het verschuift de grens niet stilzwijgend. |
| **B8** | **Geen nieuw gate-niveau.** Alles landt in G1-contract, G2-answer en de bestaande runtime-guard. Wie een nieuwe gate wil, heeft een ontwerpfout gevonden en meldt die eerst. |

### A1 — `needs_specification` uit de weiger-enum

Zet het in Fase 1 nog niet in `refusedReasons`. Anders moet Fase 2 de outcome
terughalen en raken de weigervloeren vervuild.

Dit is **geen <5%-meting**. Onder A1 kan het type niet in `refused` landen, dus
een telling tegen de weiger-noemer is nul meetbaarheid. Een volgende Fase 0
leest dit niet als "empirisch te klein gebleken".

### A2 — grens platformcode ↔ dashboard

Dit botst niet met het ADR ("prompts en weigerzinnen blijven in code"), zolang
Fase 3 alleen de routeringsinhoud haalt. De ADR-zin is 5 september 2026
aangescherpt.

---

## 3. Typen (hypothese — bevestigen in Fase 0)

### 3.1 Wanneer welk type

| Type | Wanneer | Wat de gebruiker hoort | Outcome |
|---|---|---|---|
| `out_of_domain` | Retrieval levert niets en de ruwe scores zijn laag | Vriendelijke afbakening van wat deze agent wél doet. Volledig claimloos | `refused` |
| `out_of_scope` | Onderwerp klopt, werkgebied niet (arbo (c)) | Werkgebied benoemen + doorverwijzen | `refused` |
| `no_coverage` | Binnen scope, niets gevonden boven de drempel | De huidige zin, plus wat er wél in het corpus staat (bron 2) | `refused` — **restwaarde** (D2) |
| `partial_evidence` | Fragmenten gevonden die de vraag niet dekken | "Ik vind wel X [1] en Y [2], maar niet Z" | `refused` |
| `not_computable` | Gegevens staan er, de berekening niet | Gegevens mét `[n]` + wat er ontbreekt + waar het uitgerekend wordt | `refused` |
| `personal_case` | Beoordeling van een individuele situatie | De route (bedrijfsarts, fonds, adviseur), voor zover in de context | `refused` |
| `needs_specification` | Hits boven de drempel, verspreid over losse documenten | Eén verduidelijkende vraag, met de gevonden thema's als keuze | **`clarified`** (A1) — niet in Fase 1 als `outcome_reason` (A4) |

`partial_evidence` en `not_computable` zijn geen dekkingsproblemen. Ze voelen
vandaag als een muur omdat ze op dezelfde vaste zin uitkomen.

Guard-redenen blijven bestaan en groeien niet in deze taxonomie:
`guard_hard_fact`, `guard_citation_coupling`.

### 3.2 Vier bronnen voor het hulpblok (geen vijfde)

1. Gevonden maar ontoereikende fragmenten — met `[n]`, via het normale citatiecontract.
2. Corpusstructuur — hoofdstuk- of onderwerptitels uit de index. Een lookup, geen generatie.
3. Fondsbeheerde routeringscontent — per fonds, eigen markering (B7).
4. Claimloze taal — erkenning, herformulering van de vraag, aanbod verder te zoeken.

### 3.3 Classificatie, zo deterministisch mogelijk

| Signaal | Afleiding |
|---|---|
| 0 hits boven `minScore`, lage `top_score` | `out_of_domain` |
| 0 boven de drempel, redelijke scores in één thema | `no_coverage` (met bron 2) |
| Hits boven de drempel, verspreid over ≥3 documenten | `needs_specification` |
| Hits boven de drempel, antwoord zonder geverifieerde citatie | `partial_evidence` of `not_computable` |

Alleen het ambigue middenveld verdient een LLM-oordeel. Bouw dat pas als Fase 0
laat zien dat het middenveld groot genoeg is (D6: niet in Fase 1).

`derived`-cases in de golden set zijn **antwoorden** (gegevens + naar-rato, geen
zelf uitgerekend totaal), geen weigeringen. `not_computable` mag die cases niet
invangen — anders stijgt `maxOverRefusalRate`.

---

## 4. Defaults (D1–D6)

| # | Vraag | Default |
|---|---|---|
| **D1** | Eigen exacte zin per type, of één zin met variabel hulpblok? | Eigen exacte zin per type, gepind in G1. **Fase 2, niet Fase 1** — Fase 1 houdt bewust dezelfde zin. |
| **D2** | Blijft `no_coverage` bestaan als restwaarde? | Ja. Een classifier die alles móét typeren, typeert fout. |
| **D3** | Waar landt het weigertype in de UI van het fonds? | Eigen kolom in de signalenlijst, naast de groepering op letterlijke vraag. Niet in de dormant theme-kolom. **A3'** hieronder. |
| **D4** | Mag `needs_specification` ná retrieval een verduidelijkende vraag stellen? | Ja, en dat wordt het hoofdpad. Pre-retrieval clarify blijft voor de goedkope gevallen (begroeting, meta-vraag, salaris-zonder-schaal). |
| **D5** | Telt een verduidelijkende vraag als `clarified` of `refused`? | `clarified`. Dat houdt de weigervloeren zuiver. **A4** hieronder. |
| **D6** | LLM-classifier in Fase 1? | Nee. Fase 1 zendt alleen reasons uit die een producent hebben (§5 Fase 1). Modeluitzending per type (eigen zin in de prompt) is Fase 2 / D1, geen stille Fase-1-mechanisme. |

### A3' — fondslijst is getypeerde dekking, geen restwaarde

A3 (ochtend) versmalde kennisgaten-D2 tot `guard_*`, zodat getypeerde weigeringen
met sterke retrieval op de fondslijst bleven. Fase 0 toont dat de live
`no_coverage`-rijen injectie en meta zijn, geen gaten. Onder A3 zouden die op
het fondsgezicht landen, gelabeld als kennisgat.

**A3' (avond, na Fase 0):**

1. Fondslijst toont alleen `out_of_domain`, `out_of_scope` en `partial_evidence`.
2. `no_coverage` volgt de **oude** kennisgaten-D2: sterke retrieval
   (`retrieved_count > 0` én `top_score ≥ 0.6`) → admin-only; zwak of nul hits
   → fondslijst. Tot die restwaarde aantoonbaar live gaten bevat, is dat de
   parkeerplek voor injectie/meta.
3. `guard_*` blijft admin-only.
4. Geen `adversarial`-reason in de enum. Security is geen fonds-weigertype.
5. D3 blijft een kolom naast de vraaggroepering op `/signals` — geen `theme`.

In Fase 1 zijn `out_of_domain` en `partial_evidence` nog niet produceerbaar
(zie Fase 1 hieronder). De fondslijst toont dan alleen `out_of_scope` plus
zwakke `no_coverage`. Dat is bedoeld.

De sterke-bar is `RETRIEVAL_STRONG_MIN_SCORE` (0.6), **niet** agent-`minScore`.
In het Fase-0-venster blijven L3–L8 (0,424–0,592, `no_coverage`) daardoor op
de fondslijst; L9 (0,731) is admin. Fase 1 verplaatst alleen zwakke guards
(L1/L2) van de fondslijst. Pin:
[FASE-0-weigeringstypen-2026-09-05.md](../eval/FASE-0-weigeringstypen-2026-09-05.md) §2.

### A4 — D5 × Fase 1

Zolang de geserveerde tekst de oude weigerzin is, mag Fase 1 die beurt **niet**
als `clarified` wegschrijven. Twee toegestane wegen: het type uitstellen tot
Fase 2, of het in Fase 1 alleen als interne meetklasse bijhouden, niet als
`outcome_reason`. Anders liegt de enum.

---

## 5. Fasering

### Fase 0 — meten en typeren (geen code)

Trek de `refused`-beurten van OOMT uit `interaction_events` en typeer ze met de
hand tegen §3.1. Lever een telling per type plus de restcategorie.

De steekproef is dun: [PLAN-q4-gereedheid](../plans/PLAN-q4-gereedheid.md)
noteert 191 events in `fund_oomt`, lokaal proces, nul echte gebruikersbeurten.
Als de <5%-regel een type schrapt, kan een type met 4 beurten verdwijnen dat in
echt verkeer de hoofdmoot is.

**Vastgelegd:** bevries de taxonomie pas bij **≥ 30 `refused`**. Wordt die N
niet gehaald: neem golden-set-refusals + playground mee, en zet dat expliciet
als beperking op de telling.

**Uitgevoerd:** 5 september 2026 —
[FASE-0-weigeringstypen-2026-09-05.md](../eval/FASE-0-weigeringstypen-2026-09-05.md).
Live N = 10 (playground). Aanvulling 19 golden-cases. Uniek N = 26 (< 30;
beperking genoteerd). De 30%-heropeningstrigger gebruikt deze noemer
(unieke getypeerde items in de freeze-set), niet live-only 4/10.

Naar de taxonomie (Fase 2+): `no_coverage`, `out_of_domain`, `out_of_scope`,
`partial_evidence`. Niet bouwen: `not_computable`, `personal_case`.
`needs_specification` valt buiten de <5%-regel (A1: geen `refusedReason`).

Produceerbaar in Fase 1: alleen `no_coverage`, `out_of_scope`, `guard_*`.

**Definition of Done**

- [x] Tabel met aantal per type over het volledige beschikbare venster, met de query erbij
- [x] Elk type dat < 5% haalt gaat expliciet **niet** naar Fase 1; noteer welke
      (`not_computable`, `personal_case`; `needs_specification` valt buiten deze regel)
- [x] Elke beurt in de restcategorie geciteerd, met een voorstel: nieuw type of geen type
- [x] Vastgesteld of `not_computable` en `partial_evidence` bestaan in echt verkeer
- [x] N ≥ 30 of de beperking op de telling is genoteerd
- [x] Heropening als > 30% in de restcategorie valt — taxonomie herzien vóór Fase 1
      (rest = 15%; niet heropend)

### Fase 1 — alleen produceerbare reasons, oude teksten

Alleen classificatie en opslag voor reasons die onder D6 een producent hebben.
De teksten veranderen niet, op arbo (b) + fall-through na.

Fase 0 typeerde L7/L8 als `out_of_domain` op de vraag (hondenverlof is geen CAO).
§3.3 eist 0 hits boven `minScore` en een lage ruwe score. L7/L8 hebben 3–5 hits
bij 0,55–0,58, overlapping met injectie/meta. Zonder LLM (D6) en zonder eigen
zin per type (D1 = Fase 2) kan Fase 1 die twee groepen niet scheiden. Hetzelfde
geldt voor `partial_evidence`: “hits + geen geverifieerde citatie” is het hele
middenveld.

| Reason | Producent in Fase 1 |
|---|---|
| `no_coverage` | fall-through (nu) |
| `guard_*` | bestaande guards |
| `out_of_scope` | stringmatch op modeloutput `OUT_OF_SCOPE_MESSAGE` *vóór* de serve-replace (arbo (b) staat al in de prompt) |
| `out_of_domain` | **niet.** Naad §7.1 vult het pre-drempelvenster; de classificatie wacht tot dat signaal een type kan dragen. Geen G2-claim. |
| `partial_evidence` | **niet.** Wacht op Fase 2 (eigen zin, G1-pin, modeluitzending). |

Daarom:

- `notFoundMessage` blijft een string per profiel, behalve arbo (b) als eigen
  `out_of_scope`-zin. Geen `Record` van vier typen.
- Fall-through laat `out_of_scope` staan wanneer het model die zin uitzendt;
  overige weigeringen blijven `refused("no_coverage")`.
- `outcome_reason`-CHECK groeit alleen met wat Fase 1 schrijft (`out_of_scope`
  bestaat al in Zod).
- Dashboard: A3'. Geen kolom die `no_coverage` met sterke retrieval tot
  kennisgat promoveert.
- §7.1 landt wél: `retrieved_count` / `top_score` uit het pre-drempelvenster,
  zonder `out_of_domain` uit te zenden.

**Definition of Done**

- [x] `rg -n "no_coverage" packages/agents packages/analytics` toont de restwaarde, niet een verdwenen enige reason
- [x] Een vers geprovisioneerd testfonds weigert een INSERT met een onbekend `outcome_reason` op DB-niveau, niet via Zod
- [x] Geen `expectedRefusalType` op de 10 base-cases (die zijn `partial_evidence` / `out_of_domain` — niet produceerbaar)
- [x] Arbo-fund: `out_of_scope` op de twee scope-cases; G2 of characterization asserteert de zin + reason
- [x] Nieuwe `out_of_scope`-assertie één keer rood gemaakt (rode uitvoer plakken)
- [x] Volledige evalsuite groen; `maxUnderRefusalCount` en `maxOverRefusalRate` ongewijzigd van waarde
- [x] De geserveerde tekst is byte-identiek aan vóór deze PR, aangetoond met een characterization-test — **uitzondering:** arbo (b)
- [x] `needs_specification` staat niet in `refusedReasons` (A1)
- [x] `partial_evidence` en `out_of_domain` staan niet in de Fase-1-enum-groei
- [x] `docs/STATUS.md` noemt 10/38 op v5
- [x] Kennisgaten-WHERE volgt A3' (niet de ochtend-A3)

### Fase 2 — het hulpblok

Per type een opbouw uit de bronnen van §3.2. Mockup-eerst: eerst de teksten en
de UI-vorm ter review, dan bouwen. D1 landt hier: eigen exacte zin per type,
gepind in G1.

- Nieuwe mechanism-check: geen zin in het hulpblok draagt een domeinclaim zonder
  geverifieerde citatie. Dit is de bestaande citation-coupling-guard op een
  nieuw oppervlak, geen nieuwe guard (B8)
- G1-contract pint de verzameling templates plus de routeringstabel
- Hier landt modeluitzending: eigen zin per type is het mechanisme voor
  `out_of_domain` en `partial_evidence` (D1). Schrijf dat op in de G1-pin,
  niet als bijwerking van Fase 1.
- `needs_specification` mag hier `clarified` schrijven, omdat de geserveerde
  tekst dan een vraag is (A4)
- Eerste bouwstap als de lookup ontbreekt: leesbare corpusindex per instance
  (§7.2)
- A3' blijft: pas als deze typen echt uitgezonden worden, verschijnen ze op
  de fondslijst — ook bij sterke retrieval.

**Definition of Done**

- [ ] Mockup van alle typen goedgekeurd vóór de eerste regel code
- [ ] G1-contract faalt aantoonbaar als een template of een routeringsregel wijzigt
- [ ] De nieuwe check één keer rood gemaakt met een handgeschreven claimzin zonder citatie
- [ ] `verifyAndBuild` ongewijzigd; diff bewijst het
- [ ] Trust-laag-elementen (antwoordtekst, citatiechips, weigerstatus) verschijnen in hetzelfde frame, ook in het hulpblok

### Fase 3 — fondsroutering als content

Pas na signaal uit Fase 0/2 dat de generieke doorverwijzing tekortschiet. Een
klein, fondsbeheerd blok met contactroutes, gescheiden van het autoriteitscorpus,
met eigen markering (B7 / A2). Typezinnen blijven code.

---

## 6. Cross-corpus — twee naden, nul gedrag

Niet bouwen. Wel nu vastleggen.

| # | Naad | Waarom nu |
|---|---|---|
| **V1** | Een citatie draagt corpusidentiteit, niet alleen een passage-id | Citaties hebben vandaag `fund` + `version`, geen corpus- of agentidentiteit. Zodra G1 het formaat pint zonder corpusveld, kost de eerste cross-corpus-verwijzing een contractwijziging. |
| **V2** | Het weigertype heeft een optioneel `suggestedCorpus`, **alleen** vulbaar door een echte probe | De constraint is het punt, niet het veld. Leeg zolang er geen retrieval-run onder ligt. |
| **V3** | Splits in G3-isolation de cross-fonds- en de cross-agent-assertie | Isolatie is een tenant-eigenschap; agent-scoping is retrieval-correctheid. |
| **V4** | Cross-corpus is uitsluitend binnen de tenant | Schrijf het op, zodat niemand het later als feature ontdekt. |

**Expliciet uitgesteld:** samengestelde antwoorden uit twee corpora in één
beurt, automatische handoff, gedeelde corpora over fondsen heen. Reden voor
het eerste is inhoudelijk: CAO en arbocatalogus hebben verschillende
juridische status; vermengen zonder markering is een domeinfout.

---

## 7. Open naden

### 7.1 Wat B1 nog niet koopt

Retrieval draait, maar de lege-hit-tak gooit de scores weg
(`ZERO_RETRIEVAL` in `create-agent.ts`: `retrievedCount: 0`, `topScore: null`).
`droppedChunks` (scores onder `minScore`) bestaat al in de retrieval-output en
wordt niet gelogd.

Zonder die signalen kan §3.3 niet onderscheiden:

- `out_of_domain` — lage scores
- `no_coverage` — redelijke scores, niets boven de drempel

Dit is geen nieuwe gate. Het is het bestaande `retrieved_count` / `top_score`
vullen uit het **pre-drempelvenster**. Fase 1 legt de naad (signalen vullen).
Fase 1 zendt `out_of_domain` **niet** uit: het 0-hit-patroon zat niet in het
Fase-0-venster, en L7/L8 zijn geen 0-hit. Geen G2-claim tot het signaal een
type draagt.

### 7.2 Bron 2 — corpusstructuur

Er is een begin: `listCorpusAnchors` en headings op chunks. Er is geen
leesbare corpusindex per instance. Eerste bouwstap van Fase 2.

### 7.3 Citaties

V1 is een naad, geen bouwopdracht.

---

## 8. Heropeningstriggers

- Fase 0: > 30% van de weigeringen in de restcategorie → taxonomie herzien vóór Fase 1.
  Noemer = unieke getypeerde items in de freeze-set (hier 4/26 = 15%). Live-only
  (4/10 = 40%) is een gevoeligheidsregel ernaast, geen keuzenoemer.
- `maxOverRefusalRate` stijgt na Fase 1 → de deterministische classificatie is te streng; terug naar §3.3
- Een tweede agent op hetzelfde fonds gaat live en > 15% van de weigeringen blijkt voor de andere agent bedoeld → §6 wordt een bouwopdracht
- Een fonds vraagt om eigen weigerteksten → dit besluit heropenen (A2); vandaag is de *vorm* platform en alleen de routeringsinhoud content

---

## 9. Buiten scope

Toonwijziging van de inhoudelijke antwoorden, de B1-taalregels, de
`refusalCalibration`-drempels, de arbo-G5-laag, het gedeelde-corpusmodel, en
elke aanpassing aan `verifyAndBuild`. Wie daar tijdens dit werk iets aan wil
veranderen, heeft een tweede besluit gevonden en schrijft dat op.

---

## 10. Gevolgen voor de eerste implementatie-PR (Fase 1)

1. Geen `expectedRefusalType` op `golden-set.base.jsonl` — die cases zijn niet
   produceerbaar onder D6. Geen verplichte `GOLDEN_CORPUS_VERSION`-bump voor dit.
2. Nieuwe DB-CHECK op het paar (`outcome`, `outcome_reason`) alleen als de
   geschreven set groeit; `out_of_scope` zit al in Zod. Geen groei van `0004`.
   `migrate-fund-schemas` draait dezelfde predicate als SELECT vóór
   `ADD CONSTRAINT`; rijen die zouden falen stoppen de migratie met een census,
   niet met een Postgres-fout. `(unknown, NULL)` is toegestaan;
   `(clarified, NULL)` niet.
3. `retrieved_count` / `top_score` vullen uit het pre-drempelvenster in plaats
   van `ZERO_RETRIEVAL` (§7.1) — naad, geen `out_of_domain`-uitzending.
4. Arbo (b) herschrijven **en** de fall-through die zin als `out_of_scope`
   laten staan (§1.3). Overige weigeringen blijven `no_coverage`.
5. `needs_specification` níet in `refusedReasons` (A1). `partial_evidence` en
   `out_of_domain` níet in de Fase-1-enum-groei.
6. `docs/STATUS.md` bijwerken naar 10/38 op v5 (§1.4).
7. G2-answer opnieuw meten vóór merge — als hygiëne, niet als blokkade (§1.1).
8. Kennisgaten-WHERE: A3' (niet ochtend-A3).
