# Schets — dashboardcards met realistische inhoud

**Status:** deels levend, deels schets · gestart 2 september 2026  
**Levend (shipped):** §0 werkwijze · §1 Activiteit · §5 Mix per agent.  
**Schets (niet shipped):** §2 Status-card · §3 Actualiteit-permalink · §4 Acties volle anatomie · §6–8 Agentdetail-layouts.  
**Doel:** per card op het fondsdashboard vastleggen wat erin staat en wat elk getal betekent, met realistische inhoud. De exacte designvorm (typografie, spacing, kleur) komt later; dit document legt inhoud, eenheden, doorklikken en staten vast zodat alle cards consistent worden opgezet.  
**Scope nu:** het fondsgezicht (`(fund)` op `/`, gedeeld met `/admin/funds/[fundKey]`): Overzicht (vier blokken) plus de Overzicht-tab van een agent. Corpus-, scenario- en publicatietabs blijven buiten.

Gerelateerd: [DECISION-dashboard-indeling.md](../decisions/DECISION-dashboard-indeling.md) (S11–S22, D6–D8), [DECISION-dashboard-ia.md](../decisions/DECISION-dashboard-ia.md) (S1–S8).

---

## 0. Werkwijze

### Vaste opzet per card

Elke card in dit document krijgt dezelfde acht kopjes:

1. **Positie** — waar de card staat en in welk blok
2. **Vraag** — welke vraag van de gebruiker de card beantwoordt
3. **Anatomie** — de elementen van boven naar beneden
4. **Realistische inhoud** — één concreet, ingevuld voorbeeld
5. **Herkomst** — waar elk getal vandaan komt
6. **Doorklik** — waar elk element naartoe leidt (S11a: precies één doorklik per getal)
7. **Staten** — onboarding, eerste dagen, normaal, afwijkend
8. **Copy-regels** — formuleringen, eenheden, getalnotatie

### Canonieke voorbeelddataset

Alle cards in dit document tonen hetzelfde fonds in hetzelfde venster. Wie een nieuwe card schetst, put uit deze set en verzint geen losse getallen — anders spreken twee cards elkaar tegen op één scherm.

**Fonds:** OOMT · **Venster:** 30 dagen t/m 1 september 2026 (ma 3 aug – di 1 sep) · **Nu:** di 1 sep, 14:51

Schermnamen in dit document (sleutel tussen haakjes): **CAO-assistent** (`cao`) · **Arbocatalogus** (`arbo`) · **Rollenspel** (`roleplay`). De huidige `AGENT_KEY_LABELS` zeggen CAO-agent / Arbocatalogus-agent / Rollenspelagent; dit document kiest de kortere fondsgezicht-namen.

| Grootheid | Huidig venster | Vorig venster (4 jul – 2 aug) |
|---|---|---|
| Vragen | 1.284 | 1.088 |
| Gesprekken | 535 | 473 |
| Losse vragen (MCP/API, geen gesprek-id) | 96 | 71 |
| Vragen per gesprek (gerijgde kanalen) | 2,7 | 2,5 |

**Reconciliatie gesprekken.** 1.284 − 96 = 1.188 gerijgde vragen. 1.188 / 439 = 2,706 → **2,7**. 439 gerijgde gesprekken + 96 losse = **535**. De 143 oefensessies tellen **niet** mee in die 535: Activiteit telt containers van vragen; sessies staan in Mix en op de agentkaart, als sessies. De loader (`overview-load.ts`) houdt `exerciseSessions` buiten `currentConversations` — twee eenheden, twee velden.

| Uitkomst | Aantal |
|---|---|
| Beantwoord | 1.061 |
| Geweigerd | 121 |
| Verduidelijkt | 84 |
| Fout | 12 |
| Onbekend (vóór de meting) | 6 |
| **Totaal** | **1.284** |

Beantwoordingsgraad = 1.061 / (1.061 + 121 + 84) = **83,8%** (fout valt buiten de noemer, D7). Kwaliteitsnoemer = 1.266 vragen.

| Agent | Volume | Corpusversie | Status |
|---|---|---|---|
| CAO-assistent (`cao`) | 812 vragen | 2026-08-19 | Operationeel |
| Arbocatalogus (`arbo`) | 472 vragen | 2026-08-27 | Operationeel |
| Rollenspel (`roleplay`) | 143 sessies | — | Operationeel |

812 + 472 = 1.284. Deel van het vraagvolume: CAO-assistent 63% · Arbocatalogus 37%.

Overig: 110 onbeantwoorde vragen · meting gestart 12 augustus 2026 · laatste vraag 4 minuten geleden · 9 vragen in het laatste uur.

Dagreeks (de reeks onder de Activiteit-card; weekenddalen zijn echt — fondsgebruikers zijn professionals die op werkdagen vragen stellen):

```
ma  3 aug  38   za  8 aug   6   ma 17 aug  57   za 22 aug  13   ma 24 aug  61   za 29 aug   8
di  4 aug  44   zo  9 aug   4   di 18 aug  62   zo 23 aug   9   di 25 aug  68   zo 30 aug   6
wo  5 aug  41   ma 10 aug  47   wo 19 aug  66                   wo 26 aug  64   ma 31 aug  69
do  6 aug  47   di 11 aug  52   do 20 aug  59                   do 27 aug  71   di  1 sep  61
vr  7 aug  42   wo 12 aug  45   vr 21 aug  63                   vr 28 aug  65
                do 13 aug  54
                vr 14 aug  48
                za 15 aug   9
                zo 16 aug   5
```

Som = 1.284. De reeks loopt op van ±43 naar ±66 per werkdag; dat is de +18% die de card meldt.

### Uitwerking — verplicht voor latere cards

Deze splitsingen horen bij dezelfde dataset. Nieuwe cards putten hieruit, niet uit nieuwe verzonnen tellingen.

**Uitkomst per grounded agent** (som = fondsrij):

| | Beantwoord | Geweigerd | Verduidelijkt | Fout | Onbekend | Totaal | Beantwoordingsgraad |
|---|---|---|---|---|---|---|---|
| CAO-assistent | 688 | 65 | 50 | 7 | 2 | 812 | 688 / 803 = 85,7% |
| Arbocatalogus | 373 | 56 | 34 | 5 | 4 | 472 | 373 / 463 = 80,6% |
| **Fonds** | **1.061** | **121** | **84** | **12** | **6** | **1.284** | **1.061 / 1.266 = 83,8%** |

Foutratio 12 / 1.284 = 0,9% — ruim onder de 20%-drempel van `deriveAgentStatus`, dus alle drie de agents **Operationeel**; fondsstatus (S12, laagste stand) is Operationeel.

**Vorig venster per agent:** CAO-assistent 712 vragen · Arbocatalogus 376 vragen · Rollenspel 118 sessies. 712 + 376 = 1.088.

**Weigeringen naar retrieval-sterkte** (alleen grounded, som = 121):

| Sterkte | Aantal | Betekenis |
|---|---|---|
| none | 89 | geweigerd zonder hits — kennisgaten |
| weak | 21 | retrieval te zwak — ook kennisgaten |
| strong | 11 | verdacht — intern, niet op het fondsgezicht |

**Kennisgaten** = 110 onbeantwoorde vragen (`none` + `weak`). Bijna-letterlijke groepen op de
lijst; het hoofdgetal telt vragen, niet groepen. Geen drempel van 3.

| # | Letterlijke vraag | × | Laatst | Agent |
|---|---|---|---|---|
| 1 | Krijg ik een thuiswerkvergoeding? | 8 | 1 sep 14:21 | cao |
| 2 | Is er een fietsplan? | 6 | 28 aug 16:02 | cao |
| 3 | Wat is de dertiende maand? | 5 | 27 aug 11:40 | cao |
| 4 | Mag een stagiair zelf een HV-systeem spanningsloos maken? | 5 | 1 sep 14:12 | arbo |
| 5 | Hoe vaak moet de RI&E worden herhaald? | 4 | 31 aug 14:18 | arbo |
| 6 | Krijg ik een telefoonvergoeding van het fonds? | 4 | 1 sep 10:22 | cao |
| 7 | Wie betaalt de veiligheidsschoenen? | 3 | 26 aug 13:01 | arbo |

Sortering: frequentie, dan recentheid. De preview op Acties / "Meest gesteld" toont de eerste drie.

**Oefensessies:** 143 in het venster (89 afgerond · 41 afgebroken · 13 beurten op) · vorig venster 118 · laatst gestart 1 sep 11:20.

**Laatste uur** (13:51–14:51, 9 vragen — dit zijn de pulsstrepjes én de bron van Actualiteit):

| Tijd | Vraag | Uitkomst | Agent |
|---|---|---|---|
| 14:47 | Hoeveel vakantiedagen heb ik per jaar? | Beantwoord | cao |
| 14:41 | Wat is de opzegtermijn bij een vast contract? | Beantwoord | cao |
| 14:33 | Hoe maak ik het HV-systeem spanningsloos? | Beantwoord | arbo |
| 14:28 | Hoe hoog is de vakantietoeslag? | Beantwoord | cao |
| 14:21 | Krijg ik een thuiswerkvergoeding? | Geweigerd | cao |
| 14:12 | Mag een stagiair zelf een HV-systeem spanningsloos maken? | Geweigerd | arbo |
| 14:08 | Is overwerk verplicht? | Beantwoord | cao |
| 13:58 | Welke PBM’s zijn verplicht bij spanningsloos maken? | Beantwoord | arbo |
| 13:52 | Krijg ik reiskostenvergoeding voor woon-werkverkeer? | Verduidelijkt | cao |

Laatste vraag = 14:47 = 4 minuten geleden. Actualiteit toont de bovenste acht; de negende valt af. Geen oefensessie in deze lijst: Actualiteit toont vragen, geen sessies (S22).

---

## 1. Activiteit

### 1.1 Positie

Eerste blok van vier op Overzicht (Activiteit · Status · Actualiteit · Acties). Het blok bestaat uit de Activiteit-card (hieronder) en daaronder de tabel Mix per agent, die in deze sectie ongewijzigd blijft — Mix heeft een eigen schets in §5.

### 1.2 Vraag

"Wordt dit ding gebruikt, en groeit dat?" — de eerste vraag van een programmamanager of bestuurder die inlogt. De card moet in drie seconden af te lezen zijn zonder één klik.

### 1.3 Anatomie

Vijf elementen, van boven naar beneden:

1. **Kop** — cardtitel links, vensterlabel rechts ernaast in gedempte tekst
2. **Hoofdgetal** — het aantal vragen, groot
3. **Eenheid + vergelijking** — onder het hoofdgetal: wat het telt, en de vorige periode met procentuele verandering
4. **Reeks** — de dagreeks over het venster, rechts naast het hoofdgetal
5. **Pulsregel** — onder een scheidingslijn: de activiteit van het laatste uur

### 1.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Activiteit        30 dagen t/m 1 september                                │
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   1.284                                        ╭──────── dagreeks ───────╮ │
│   vragen gesteld                               │      ▁▂▃▂▄▃▅▄▆▅▆▇▆█▇▆█  │ │
│   in 535 gesprekken                            │  ▁▂▁▂▃▂                 │ │
│   Vorige periode 1.088 — +18%                  ╰─────────────────────────╯ │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  ● Nu actief    ▏  ▏   ▏ ▏    ▎  ▏  ▏▏   ▏      9 in het laatste uur       │
└────────────────────────────────────────────────────────────────────────────┘
```

Regel voor regel:

| Element | Inhoud |
|---|---|
| Kop | Activiteit · 30 dagen t/m 1 september |
| Hoofdgetal | 1.284 |
| Eenheid | vragen gesteld |
| Container | in 535 gesprekken |
| Vergelijking | Vorige periode 1.088 — +18% |
| Reeks | 30 dagpunten, weekenden zichtbaar laag, oplopende trend |
| Puls | ● Nu actief · streepjes op een tijdbalk van 60 minuten · 9 in het laatste uur |

De pulsbalk is de laatste 60 minuten van links (60 min geleden) naar rechts (nu). Elk streepje is één vraag, gekleurd naar uitkomst: neutraal = beantwoord, amber = geweigerd, rood = fout, koel = verduidelijkt (D8: verduidelijkt is geen weigering). Het meest rechtse streepje staat op 4 minuten geleden — dat is meteen het antwoord op "leeft dit nu nog".

### 1.5 Herkomst

| Element | Bron |
|---|---|
| 1.284 vragen | Som van alle uitkomsten in `interaction_events` binnen het venster (`totalQuestions`) |
| 535 gesprekken | `groupIntoConversations` over datzelfde venster — alleen containers van vragen, geen oefensessies |
| 1.088 en +18% | Hetzelfde over het direct voorafgaande, even lange venster |
| Dagreeks | Vragen per kalenderdag over het venster, in de tijdzone van het fonds |
| Pulsstreepjes | Vragen van de laatste 60 minuten, met hun uitkomst |
| 9 in het laatste uur | Telling van diezelfde streepjes |
| Vensterlabel | Afgeleid van de periodekiezer bovenaan de pagina |

### 1.6 Doorklik

S11a: elk getal precies één bestemming, geen uitklap, geen tweede rij.

| Element | Doorklik |
|---|---|
| Hoofdgetal 1.284 vragen | `/conversations?period=30d` |
| in 535 gesprekken | geen eigen doorklik — volgt het hoofdgetal |
| Vergelijkingsregel | geen |
| Dagreeks | geen doorklik per punt; hover toont `wo 19 aug — 66 vragen` |
| Pulsregel | `/conversations?period=30d&since=today` |

### 1.7 Staten

| Staat | Wat de card toont |
|---|---|
| Onboarding (nul vragen in beide vensters) | De card verdwijnt en maakt plaats voor de kaart "Nog niet live — er zijn geen vragen gesteld in de laatste 30 dagen. Dat is geen 0%, er is nog niets te meten." met doorklik naar Agents |
| Eerste dagen (wel vragen nu, nul in het vorige venster) | Hoofdgetal en reeks normaal; de vergelijkingsregel wordt *Eerste periode met vragen* in plaats van een percentage |
| Meting nog niet gestart | De card blijft volledig; de meting-noot hoort bij Status en Acties, niet hier — Activiteit telt vragen en die telling is niet afhankelijk van uitkomstclassificatie |
| Losse vragen aanwezig | Extra gedempte regel onder de vergelijking: `96 losse vragen — MCP en API leveren geen gesprek-id` |
| Scan afgekapt | Gedempte regel: `Telling gesprekken is een ondergrens: het venster raakte de scanlimiet` |
| Stil laatste uur | Puls toont een lege balk met `Geen vragen in het laatste uur · laatste vraag 3 uur geleden`; de bolletjesindicator is grijs in plaats van groen |
| Één dag in het venster | Reeks toont één punt; geen lijn maar een enkele staaf |

### 1.8 Copy-regels

- Nederlandse getalnotatie: 1.284, 83,8%. Duizendtallen met punt, decimalen met komma.
- Eenheid staat altijd bij het getal: nooit een kaal 1.284 zonder *vragen*.
- Vraag = beurt, gesprek = container, sessie = rollenspel (S22). Deze drie woorden worden nooit door elkaar gebruikt, ook niet in hints.
- De vergelijking heet "Vorige periode", niet "vorige maand" — het venster is instelbaar.
- Percentages van groei krijgen een teken: +18%, −4%. Bij nul: *gelijk*.
- Geen bijvoeglijke oordelen. Geen "sterke groei", "gezond", "goed op weg". De card meldt, de gebruiker oordeelt.
- Tijd relatief tot een uur, absoluut daarboven: 4 minuten geleden, 3 uur geleden, gisteren 16:20, 28 aug 09:14.

---

## 2. Status

> **Schets — niet shipped.** Overzicht toont vandaag alleen de agent-tabel; de fonds-beantwoordingsgraad-card hieronder is inhoudsontwerp.

### 2.1 Positie

Tweede blok van vier op Overzicht. Het blok bestaat uit de Status-card (beantwoordingsgraad van het fonds) en daaronder de tabel per agent — dezelfde rol die Mix speelt onder Activiteit. Fondsstatus-badge in de paginakop (naast "bijgewerkt") blijft staan; die badge is operationeel (storing), deze card is kwaliteit (uitkomst). Twee verschillende assen, bewust niet samengevoegd — zie open eind 3 in de indeling: een agent die alles weigert blijft Operationeel.

### 2.2 Vraag

"Krijgen mensen antwoord?" — de tweede vraag na volume. In drie seconden: het percentage, de noemer, en of weigeringen of fouten het beeld dragen. Zonder klik, zonder het groene bolletje in de kop te verwarren met deze metriek.

### 2.3 Anatomie

Zes elementen op de card, daarna de agenttabel:

1. **Kop** — Status links, vensterlabel rechts
2. **Hoofdgetal** — de beantwoordingsgraad, groot, met %
3. **Eenheid + noemer** — *beantwoord* · teller van noemer vragen
4. **Verdeling** — drie getallen naast elkaar: geweigerd, verduidelijkt, fout
5. **Balk** — één gestapelde balk over de kwaliteitsnoemer (beantwoord / geweigerd / verduidelijkt); fout en onbekend staan er niet in
6. **Metingregel** — onder een scheidingslijn: wanneer de meting startte, en hoeveel onbekend buiten de noemer valt
7. **Agenttabel** — onder de card, één rij per agent: uitkomstregel, laatste activiteit, corpus, stand

### 2.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Status            30 dagen t/m 1 september                                │
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   83,8%                                                                    │
│   beantwoord                                                               │
│   1.061 van 1.266 vragen                                                   │
│                                                                            │
│   ████████████████████████████████░░░░░░░▒▒▒                               │
│   1.061 beantwoord     121 geweigerd     84 verduidelijkt                  │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  Meting gestart 12 augustus 2026 · 12 fout · 6 onbekend buiten de noemer   │
└────────────────────────────────────────────────────────────────────────────┘

  Agent              Uitkomst                         Laatste      Corpus      Stand
  CAO-assistent      688 van 803 beantwoord           4 min geleden  2026-08-19  Operationeel
                     · 65 geweigerd · 50 verduidelijkt
  Arbocatalogus      373 van 463 beantwoord          18 min geleden  2026-08-27  Operationeel
                     · 56 geweigerd · 34 verduidelijkt
  Rollenspel         143 oefensessies                 1 sep 11:20    —           Operationeel
```

De balk is de kwaliteitsnoemer (1.266): beantwoord ~84% van de balk, geweigerd ~10%, verduidelijkt ~7%. Fout (12) en onbekend (6) staan alleen in de metingregel — ze zouden de balk visueel als "minder beantwoord" laten liegen (D7).

### 2.5 Herkomst

| Element | Bron |
|---|---|
| 83,8% | `answerRate` = answered / (answered + refused + clarified) |
| 1.061 van 1.266 | teller en `qualityDenominator` van het fondsvenster |
| 121 · 84 · 12 | `byOutcome.refused` · `clarified` · `error` |
| 6 onbekend | `byOutcome.unknown` — rijen zonder uitkomstrede (D6) |
| Meting gestart | `measurementStartedAt` = vroegste rij met niet-lege `outcome_reason` |
| Uitkomst per agent | `getOutcomeBreakdown` gescoped op `agentId` |
| 143 oefensessies | `getExerciseActivity` — andere tabel, geen uitkomst (S15, A4) |
| Laatste | `max(occurred_at)` per grounded agent; `lastStartedAt` voor rollenspel |
| Corpusversie | laatst geladen documentversie van díé agent, geen poortuitslag (A5: vingerafdruk is nog niet deze kolom) |
| Stand | `deriveAgentStatus(total, errors)` per rij; fonds in de kop = `deriveFundStatus` (laagste) |

### 2.6 Doorklik

| Element | Doorklik |
|---|---|
| Hoofdgetal 83,8% beantwoord | `/conversations?period=30d` — de graad heeft alleen zin tegen de rest; niet filteren op `answered` |
| 1.061 van 1.266 | geen eigen doorklik — volgt het hoofdgetal |
| 121 geweigerd | `/conversations?period=30d&outcome=refused` |
| 84 verduidelijkt | `/conversations?period=30d&outcome=clarified` |
| 12 fout | `/conversations?period=30d&outcome=error` |
| 6 onbekend | geen — die rijen zijn niet nagelopen als uitkomst |
| Balk | geen |
| Metingregel | geen |
| Agentnaam | `/agents/{agentKey}` |
| Uitkomstregel van een grounded agent | `/conversations?period=30d&agent={agentKey}` |
| 143 oefensessies | `/conversations?period=30d&agent=roleplay` |
| Laatste / corpus / badge | geen |

### 2.7 Staten

| Staat | Wat de card toont |
|---|---|
| Onboarding | Het hele Status-blok verdwijnt; de onboardingkaart van Activiteit dekt de pagina (S11b) |
| Meting nog niet gestart | Hoofdgetal wordt *geen meetbare vragen*; verdeling en balk vervallen; metingregel: "Meting nog niet gestart. Historische rijen hebben geen uitkomstrede." Volume blijft op Activiteit zichtbaar |
| Alleen fouten in de noemer-kandidaten | Zelfde als geen meetbare vragen — `error` alleen maakt geen 0% (D7) |
| Eerste dagen | Card normaal zodra er minstens één beantwoord/geweigerd/verduidelijkt in het venster zit; geen vergelijking met vorige periode op deze card (groei hoort bij Activiteit) |
| Eén agent beperkt | Fondsbadge in de kop wordt Beperkt (S12). De card zelf verandert niet van vorm; de betreffende rij toont Beperkt. Geen extra rode banner |
| Agent zonder vragen in het venster | Rij blijft staan: uitkomst *Nog geen vragen in deze periode*, stand Nog niet live, laatste — |
| Rollenspel zonder sessies | Rij blijft: *Nog geen oefensessies in deze periode*, stand Nog niet live |
| Corpus n.n.b. | Kolom toont `n.n.b.`, nooit een verzonnen versie |

### 2.8 Copy-regels

- Beantwoordingsgraad heet *beantwoord*, nooit "kwaliteit", "succes" of "nauwkeurigheid".
- Noemer altijd erbij als teller én noemer: `1.061 van 1.266 vragen`, niet alleen 83,8%.
- Fout krijgt een eigen getal en komt niet in de balk. Copy: *buiten de noemer*, niet "niet meegerekend" zonder meer.
- Verduidelijkt is een eigen categorie (D8), nooit een weigering in de copy.
- Stand-woorden zijn vast: Operationeel · Beperkt · Nog niet live. Niet "actief", "live", "groen". Offline met nul events is *Nog niet live*, niet Offline — dat is S8/S11b.
- Oefenagent: *oefensessies*, geen uitkomstzin. Geen streepjes-verdeling die 0 beantwoord suggereert.
- Corpusversie is de laatst geladen versie, in `font-mono`. Tot de vingerafdruk (A5) gebouwd is, geen "goedgekeurd op".
- Metingregel altijd op dit blok (D6), ook als onbekend = 0.

---

## 3. Actualiteit

> **Schets — niet shipped** voor permalink/`#v-` en agent-suffix (zie §3.4–3.6). De recente-vragenlijst bestaat; de card-anatomie hieronder nog niet als geheel.

### 3.1 Positie

Derde blok van vier op Overzicht. Eén card: de laatste vragen, geen KPI daarboven. Geen rollenspelregels in deze lijst.

### 3.2 Vraag

"Wat vragen mensen nu?" — scannen, niet sturen. De gebruiker herkent onderwerpen en uitkomsten; één klik opent het gesprek van die vraag.

### 3.3 Anatomie

1. **Kop** — *Actualiteit* links, *laatste vragen* als gedempt bijschrift, geen vensterlabel (deze lijst is "nu", niet het 30-dagenvenster)
2. **Rijen** — acht vragen, nieuwste bovenaan. Per rij, van links naar rechts: relatieve tijd, letterlijke vraag, agent als gedempte suffix, uitkomstchip
3. **Voet** — geen "toon meer" in de card; de achtste rij is de bodem. Doorklik naar de lijst zit op de vraag, niet op een extra knop

Acht is het bestaande `RECENT_LIMIT`. Geen tiende "en nog N" — dat zou een tweede getal zonder bestemming zijn.

### 3.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Actualiteit                                                laatste vragen │
│  ────────────────────────────────────────────────────────────────────────  │
│  4 min geleden   Hoeveel vakantiedagen heb ik per jaar?                    │
│                  CAO-assistent                              Beantwoord     │
│  10 min geleden  Wat is de opzegtermijn bij een vast contract?             │
│                  CAO-assistent                              Beantwoord     │
│  18 min geleden  Hoe maak ik het HV-systeem spanningsloos?                 │
│                  Arbocatalogus                              Beantwoord     │
│  23 min geleden  Hoe hoog is de vakantietoeslag?                           │
│                  CAO-assistent                              Beantwoord     │
│  30 min geleden  Krijg ik een thuiswerkvergoeding?                         │
│                  CAO-assistent                              Geweigerd      │
│  39 min geleden  Mag een stagiair zelf een HV-systeem spanningsloos maken? │
│                  Arbocatalogus                              Geweigerd      │
│  43 min geleden  Is overwerk verplicht?                                    │
│                  CAO-assistent                              Beantwoord     │
│  53 min geleden  Welke PBM’s zijn verplicht bij spanningsloos maken?       │
│                  Arbocatalogus                              Beantwoord     │
└────────────────────────────────────────────────────────────────────────────┘
```

De negende vraag van het laatste uur (13:52, verduidelijkt) staat niet op de card. Wie verder wil, gaat via Activiteit of een vraagklik naar Gesprekken.

### 3.5 Herkomst

| Element | Bron |
|---|---|
| Acht rijen | `getRecentInteractions({ fundKey, since: window.since }, 8)` — `interaction_events`, nieuwste eerst |
| Vraagtekst | `interaction_events.question`, letterlijk (S19). Leeg → em-dash, geen parafrase |
| Uitkomst | `interaction_events.outcome` → chip *Beantwoord / Geweigerd / Verduidelijkt / Fout / Onbekend* |
| Agent | `agent_id` → schermnaam |
| Tijd | `occurred_at`, relatief onder het uur |

Het periodefilter van de pagina begrenst *since*: een venster van 7 dagen toont geen vraag van 8 dagen geleden. Binnen het venster blijven het de laatste acht, niet een steekproef.

### 3.6 Doorklik

| Element | Doorklik |
|---|---|
| Vraagtekst | permalink `/conversations/{eventId}#v-{eventId}` — venstervrij (A6) |
| Tijd, agent, chip | geen eigen doorklik — volgen de vraag |
| Kop | geen |

De huidige implementatie linkt elke rij naar `/conversations` zonder id. Dat is niet wat S19 vraagt; deze schets legt de permalink vast.

### 3.7 Staten

| Staat | Wat de card toont |
|---|---|
| Onboarding | Blok verdwijnt met de rest |
| Geen vragen in het venster, wél in een ruimer venster | *Geen vragen in deze periode.* Geen rijen van buiten het venster lenen |
| Vraagtekst ontbreekt | Em-dash op de vraagplaats; rij blijft doorklikbaar via het event-id (het anker bestaat ook zonder tekst) |
| Alle acht uit het laatste uur | Normaal — nu het geval. Geen extra "live"-label; dat is de puls van Activiteit |
| Stil sinds gisteren | Tijden worden absoluut (`gisteren 16:20`, `28 aug 09:14`); de card blijft, leeg is hij niet |
| Alleen oefensessies in het venster | *Geen vragen in deze periode.* Sessies horen in Mix en Gesprekken, niet hier |

### 3.8 Copy-regels

- Kop *Actualiteit*, bijschrift *laatste vragen*. Niet "laatste gesprekken" — de eenheid is de vraag (S22).
- Vraagtekst onverkort tot één regel, daarna ellipsis. Nooit herschreven, nooit een themalabel (S19).
- Chip-woorden gelijk aan Gesprekken: Beantwoord, Geweigerd, Verduidelijkt, Fout, Onbekend.
- Agentnaam in de rij, niet alleen een sleutel. Rollenspel verschijnt hier niet.
- Geen "9 in het laatste uur" op deze card — dat getal woont op de puls.

---

## 4. Acties

> **Schets — niet shipped** als volle card-anatomie. De KPI-link naar Signalen bestaat; de rest is inhoudsontwerp.

### 4.1 Positie

Vierde blok van vier op Overzicht. Eén card: de fondsbrede werkvoorraad (S21). Geen tweede kolom "verdachte weigeringen" — dat is admin-werk op Signalen. Geen adoptieblok van het rollenspel (S17).

### 4.2 Vraag

"Wat moet ik doen?" — na volume, kwaliteit en actualiteit. Nul is een geldig antwoord; het blok blijft staan.

### 4.3 Anatomie

1. **Kop** — Acties links, vensterlabel rechts
2. **Hoofdgetal** — aantal onbeantwoorde vragen, groot
3. **Eenheid + vergelijking** — *onbeantwoorde vragen* · vorige periode + delta
4. **Metingregel** — zelfde D6-noot als Status

Geen gestapelde balk, geen percentage "opgelost". Het detail (lijst, corpusaanwijzing) leeft op Signalen.

### 4.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Acties            30 dagen t/m 1 september                                │
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   110                                                                      │
│   onbeantwoorde vragen                                                     │
│   Vorige periode 61 — +80%                                                 │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  Meting gestart 12 augustus 2026                                           │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Herkomst

| Element | Bron |
|---|---|
| 110 onbeantwoorde vragen | `countKnowledgeGaps` / `knowledgeGaps` — rijen `refused` zonder sterke retrieval in het venster |
| Vorige periode | zelfde WHERE over `previousWindow` |
| Meting | `measurementStartedAt` |

Het getal op het scherm is hetzelfde getal als het hoofdgetal op `/signals` (ketenassertie).

### 4.6 Doorklik

| Element | Doorklik |
|---|---|
| Hoofdgetal | `/signals?period=30d` |
| Metingregel | geen |

### 4.7 Staten

| Staat | Wat de card toont |
|---|---|
| Onboarding | Blok verdwijnt |
| Nul onbeantwoord | *Geen onbeantwoorde vragen in deze periode. Er zijn X vragen gesteld en Y beantwoord.* Blok blijft |
| Meting nog niet gestart | Zelfde lege-staat-zin plus de metingregel "nog niet gestart". Nooit 0 presenteren als prestatie |
| Eén vraag | Hoofdgetal 1 · *onbeantwoorde vraag* (enkelvoud) |

### 4.8 Copy-regels

- Eenheid is **onbeantwoorde vragen**, niet "kennisgaten" als teller van groepen.
- Enkelvoud/meervoud: 1 onbeantwoorde vraag, N onbeantwoorde vragen.
- Geen "op te lossen", "achterstand", "actie vereist", geen groen vinkje.

---

## 5. Mix per agent

### 5.1 Positie

Onder de Activiteit-card, in het eerste blok. Geen eigen bloknummer in S11; wél een eigen card-schets omdat de tabel eigen getallen, doorklikken en staten heeft. Kolommen zijn Agent, Volume, aandeel, laatste — corpus en stand staan in de Status-tabel (§2), niet hier. Twee tabellen met dezelfde drie namen, verschillende kolommen: volume versus uitkomst.

### 5.2 Vraag

"Wie draagt dit volume?" — na "wordt het gebruikt". In één oogopslag: de CAO-assistent trekt ~2/3, de arbocatalogus de rest, het rollenspel is sessies.

### 5.3 Anatomie

1. **Kop** — *Mix per agent*, geen vensterlabel (het venster hangt al op Activiteit)
2. **Kolomkoppen** — Agent · Volume · Aandeel · Laatste
3. **Rijen** — één per instance op het fonds, vaste volgorde: grounded-agents op volume aflopend, daarna oefenagents
4. **Geen somregel** — de som van de vragen staat al als 1.284 op Activiteit; sessies optellen bij vragen is verboden

### 5.4 Realistische inhoud

```
  Mix per agent
  Agent              Volume           Aandeel    Laatste
  CAO-assistent      812 vragen       63%        4 min geleden
  Arbocatalogus      472 vragen       37%        18 min geleden
  Rollenspel         143 sessies      —          1 sep 11:20
```

Aandeel is van het vraagvolume (1.284), niet van een verzonnen "totaal interacties". Rollenspel krijgt geen percentage: 143 sessies / 1.284 vragen is geen breuk.

### 5.5 Herkomst

| Element | Bron |
|---|---|
| Rijen | `control.agent_instances` van dit fonds, niet alleen agents met traffic |
| 812 / 472 | som `byOutcome` per `agentId` |
| 143 sessies | `getExerciseActivity` over het venster |
| 63% / 37% | volume / 1.284, afgerond op hele procenten; 63 + 37 = 100 |
| Laatste | zelfde timestamps als Status-tabel |

### 5.6 Doorklik

| Element | Doorklik |
|---|---|
| Agentnaam | `/agents/{agentKey}` |
| Volume (812 vragen, 472 vragen, 143 sessies) | `/conversations?period=30d&agent={agentKey}` |
| Aandeel | geen — volgt volume |
| Laatste | geen |

Naam en volume gaan bewust naar twee plaatsen: de agentpagina is configuratie en uitkomst van díé agent; de gefilterde lijst is het bewijs van het getal (S11a).

### 5.7 Staten

| Staat | Wat de card toont |
|---|---|
| Onboarding | Mix verdwijnt met Activiteit |
| Geen instances | *Nog geen agents op dit fonds.* |
| Agent met nul in het venster | Rij blijft: `0 vragen` of `0 sessies`, aandeel 0%, laatste — |
| Eén grounded agent | Aandeel 100% is toegestaan; het is een telling, geen oordeel |
| Aandeel rondt niet op tot 100 | Grootste rest naar de grootste agent (hier niet nodig: 63 + 37 = 100) |
| Twee oefenagents | Nu niet aan de orde; volume is fondsbreed zonder `agent_id` op de sessie — niet verzinnen tot die sleutel bestaat |

### 5.8 Copy-regels

- Eenheid in de cel, niet in de kop: *812 vragen*, *143 sessies*.
- Aandeel zonder decimalen: 63%, niet 63,2%. Alleen van vragen.
- Em-dash voor aandeel van het rollenspel, geen 0%.
- Zelfde schermnamen als overal. Geen sleutel in de primaire cel; `cao` mag in een `title`-tooltip.
- Niet "mix van kanalen" — mix is per agent.

---

## 6. Agentdetail — CAO-assistent

> **Schets — niet shipped.** `AgentOverviewPanel` gebruikt `KpiTile`s / release-tabel, niet de layout hieronder.

### 6.1 Positie

Overzicht-tab van `/agents/cao` (fonds) en `/admin/funds/oomt/agents/cao` (admin). Zelfde component, `canWrite` raakt deze tab niet. Geen tweede gesprekkenlijst (S16); geen citatiekolom hier — citaties leven op de gesprekskaart.

### 6.2 Vraag

"Hoe doet *deze* agent het in hetzelfde venster als Overzicht?" — volume en beantwoordingsgraad van één corpus, daarna door naar gesprekken of corpus.

### 6.3 Anatomie

Eén kaart, twee kolommen op brede viewports, gestapeld op smal:

1. **Kop** — schermnaam + sleutel gedempt, venster *Laatste 30 dagen* (deze tab heeft nog geen periodekiezer; 30 dagen is het bestaande venster, gelijk aan de canonieke set)
2. **Stand** — badge Operationeel rechts in de kop
3. **Volume** — 812 · vragen gesteld · vorige periode 712 — +14%
4. **Graad** — 85,7% beantwoord · 688 van 803 vragen
5. **Verdeling** — 65 geweigerd · 50 verduidelijkt · 7 fout · 2 onbekend
6. **Voet** — laatste activiteit · link *Alle gesprekken van deze agent* · corpusversie 2026-08-19 als gedempte mono, doorklik naar de Corpus-tab

Geen dagreeks tot er een per-agent-reeks in de canonieke set zit. Geen kennisgatental: de werkvoorraad is fondsbreed (S21).

### 6.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CAO-assistent  cao                          Laatste 30 dagen  Operationeel│
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   812                         85,7%                                        │
│   vragen gesteld              beantwoord                                   │
│   Vorige periode 712 — +14%   688 van 803 vragen                           │
│                                                                            │
│   65 geweigerd · 50 verduidelijkt · 7 fout · 2 onbekend                    │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  Laatste vraag 4 minuten geleden · corpus 2026-08-19                       │
│  Alle gesprekken van deze agent →                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

Release-tag en gate blijven *n.n.b.* tot het manifest-spoor landt. Die velden horen niet als getal op deze kaart — een stub als 0% of groen is verboden. Ze staan op de bestaande Release-tabel eronder, buiten deze schets.

### 6.5 Herkomst

| Element | Bron |
|---|---|
| 812, 688, 65, 50, 7, 2 | `getAgentPanelSnapshot` → `breakdown.byOutcome` voor `agentId=cao` |
| 85,7% | `answerRate` op diezelfde counts |
| 712, +14% | vorig venster van gelijke lengte, zelfde agent |
| 4 minuten geleden | eerste rij van `recent` |
| 2026-08-19 | `corpusVersionLabel` van documenten met `agentKey=cao` |

### 6.6 Doorklik

| Element | Doorklik |
|---|---|
| 812 vragen | `/conversations?period=30d&agent=cao` |
| 85,7% / 688 van 803 | geen eigen — volgt volume (één agent, één lijst) |
| 65 geweigerd | `/conversations?period=30d&agent=cao&outcome=refused` |
| 50 verduidelijkt | `…&outcome=clarified` |
| 7 fout | `…&outcome=error` |
| 2 onbekend | geen |
| Vorige periode | geen |
| Alle gesprekken van deze agent | zelfde als 812 — dus **niet** als tweede link op hetzelfde getal; de voetlink is het tekstalternatief voor het hoofdgetal, visueel één bestemming |
| Corpus 2026-08-19 | `/agents/cao/corpus` |
| Badge | geen |

S11a op de voetlink: wie het getal 812 klikt en wie de zin klikt, komt op dezelfde URL uit. Geen derde bestemming.

### 6.7 Staten

| Staat | Wat de card toont |
|---|---|
| Nul vragen in beide vensters | *Nog niet live* in plaats van 0%. Badge Nog niet live. Geen 0% beantwoord |
| Wel nu, nul vorige | Volume normaal; vergelijking *Eerste periode met vragen* |
| Meting nog niet gestart | Volume blijft; graad *geen meetbare vragen*; verdeling weg; D6-regel zichtbaar |
| Beperkt (foutratio > 20%) | Badge Beperkt; getallen ongewijzigd van vorm |
| Corpus leeg | `n.n.b.`, link naar Corpus-tab blijft |

### 6.8 Copy-regels

- Zelfde eenheden en notatie als Overzicht. *Vragen*, niet *turns*.
- +14% is 812 versus 712, niet versus het fonds (+18%). Nooit fonds- en agentgroei in één zin.
- 85,7% is van díé agent, niet "beter dan 83,8%". Geen vergelijking tussen agents op deze pagina.
- Voetlink: *Alle gesprekken van deze agent*, niet "alle vragen" (de lijst toont gesprekken).

---

## 7. Agentdetail — Arbocatalogus

> **Schets — niet shipped.** Zelfde status als §6.

### 7.1 Positie

Overzicht-tab van `/agents/arbo`. Zelfde anatomie als §6; andere getallen uit dezelfde set. Geen `switch (agentKey)` — het profieltype grounded stuurt de kaart (S15/D3).

### 7.2 Vraag

Zelfde als §6.2, voor dit corpus (laatst geladen 27 augustus, jonger dan de CAO-assistent).

### 7.3 Anatomie

Identiek aan §6.3.

### 7.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Arbocatalogus  arbo                         Laatste 30 dagen  Operationeel│
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   472                         80,6%                                        │
│   vragen gesteld              beantwoord                                   │
│   Vorige periode 376 — +26%   373 van 463 vragen                           │
│                                                                            │
│   56 geweigerd · 34 verduidelijkt · 5 fout · 4 onbekend                    │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  Laatste vraag 18 minuten geleden · corpus 2026-08-27                      │
│  Alle gesprekken van deze agent →                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

+26% is 472 versus 376 (472 / 376 = 1,255). Afgerond op hele procenten met teken.

### 7.5 Herkomst

Zelfde functies als §6.5, `agentId=arbo`. 18 minuten geleden = 14:33 uit de laatste-uur-tabel.

### 7.6 Doorklik

Zelfde patroon als §6.6 met `agent=arbo` en Corpus-tab `/agents/arbo/corpus`.

### 7.7 Staten

Identiek aan §6.7. Een jonger corpus maakt geen extra staat: geen "nieuw" of "in opbouw".

### 7.8 Copy-regels

Identiek aan §6.8. Niet "lagere graad dan CAO" op het scherm. 80,6% staat op zich.

---

## 8. Agentdetail — Rollenspel

> **Schets — niet shipped.** Zelfde status als §6.

### 8.1 Positie

Overzicht-tab van `/agents/roleplay`. Profieltype oefening: geen beantwoordingsgraad, geen weigerkolom, geen corpusversie (S15). Middelste tab op deze agent is Scenario's, niet Corpus.

### 8.2 Vraag

"Wordt er geoefend?" — sessies, geen vragen. Verloop (afgerond / afgebroken) is adoptie, geen uitkomstclassificatie.

### 8.3 Anatomie

1. **Kop** — Rollenspel · `roleplay` · Laatste 30 dagen · badge
2. **Hoofdgetal** — 143 · oefensessies
3. **Vergelijking** — Vorige periode 118 — +21%
4. **Verloop** — 89 afgerond · 41 afgebroken · 13 beurten op
5. **Voet** — laatst gestart 1 sep 11:20 · *Alle gesprekken van deze agent* (de lijst rendert sessiekaarten, geen vraag-antwoord)

Geen balk over beantwoord/geweigerd. Geen kennisgaten. Adoptiedetail per scenario leeft op Signalen, niet als tweede tabel hier (regel van drie: pas splitsen als een tweede consumer het afdwingt; Signalen heeft die lijst al).

### 8.4 Realistische inhoud

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Rollenspel  roleplay                        Laatste 30 dagen  Operationeel│
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   143                                                                      │
│   oefensessies                                                             │
│   Vorige periode 118 — +21%                                                │
│                                                                            │
│   89 afgerond · 41 afgebroken · 13 beurten op                              │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│  Laatst gestart 1 sep 11:20                                                │
│  Alle gesprekken van deze agent →                                          │
│  Deze agent oefent; er is geen citatie- of weigermetriek.                  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 8.5 Herkomst

| Element | Bron |
|---|---|
| 143 · 89 · 41 · 13 | `roleplay_sessions` in het venster, gegroepeerd op `end_reason` / status |
| 118, +21% | vorig venster, zelfde tabel |
| 1 sep 11:20 | `max(started_at)` |
| Badge | `deriveAgentStatus(sessionCount, 0)` — een afgebroken sessie is geen fout van de agent |

### 8.6 Doorklik

| Element | Doorklik |
|---|---|
| 143 oefensessies | `/conversations?period=30d&agent=roleplay` |
| 89 afgerond | geen filter op eindreden in de huidige gesprekken-URL — dus geen eigen doorklik tot die queryparam bestaat. Niet veinzen met `outcome=` |
| 41 afgebroken · 13 beurten op | geen (zelfde reden) |
| Vorige periode | geen |
| Voetlink | zelfde URL als 143 |
| Zin over citatie/weiger | geen |

### 8.7 Staten

| Staat | Wat de card toont |
|---|---|
| Nul sessies beide vensters | Nog niet live, geen 0% |
| Wel nu, nul vorige | *Eerste periode met sessies* |
| Alleen afgebroken | Getallen gewoon; geen rode badge. Afgebroken is een signaal op Signalen, geen storing |
| Scenario's leeg | Card telt sessies die er waren; lege catalogus is de Scenario's-tab, niet deze kaart |

### 8.8 Copy-regels

- Alleen *sessie* / *oefensessie*. Nooit *vraag* of *gesprek* voor een oefenbeurt op deze kaart. De voetlink mag *gesprekken* zeggen omdat de navigatie zo heet (S9) en de lijst sessiekaarten toont.
- Verloopwoorden gelijk aan de gesprekskaart: Afgerond, Afgebroken, Afgerond (beurten op) — op de card verkort tot *beurten op*.
- De zin "Deze agent oefent; er is geen citatie- of weigermetriek." is uitleg, geen oordeel. Niet weglaten: anders zoekt de gebruiker de 83,8% die hier niet hoort.

---

## 9. Open voor de volgende schets

Bewust niet in dit document:

- Corpus-tab (vingerafdruk, gate-uitslag, goedkeuring — A5)
- Scenario's-tab en Publicatie-tab
- Gesprekkenlijst-kaarten (grounded vs oefening) en Signalen-pagina
- Platformoverzicht `/admin` (andere noemer: meerdere fondsen)

Wie een van die schermen schetst: zelfde acht kopjes, zelfde canonieke set, geen nieuwe getallen. Een dagreeks per agent of een eindreden-filter op `/conversations` mag pas in de set (en dan hier) landen als de card hem toont.
