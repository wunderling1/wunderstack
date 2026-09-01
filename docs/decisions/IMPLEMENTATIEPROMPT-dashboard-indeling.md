# Implementatieprompt — dashboardindeling

**Bron:** `DECISION-dashboard-indeling.md` (S9–S21), sessie 1 september 2026.
**Vertrekpunt:** PR-A2 (uitkomstclassificatie) is uitgevoerd.
**Doel:** de beheeromgeving volgt de sidebar-schil met vijf items, één landingspagina, en drie tabs
op de agent — met cijfers die uit de uitkomstclassificatie komen in plaats van uit `found`.

**Wat dit vervangt.** De PR-B t/m PR-E uit `implementatieprompt-beheerstructuur.md` gingen uit van
de fondspagina met tabs en broodkruimels. Die indeling is vervangen door S9 (sidebar) en S13 (drie
agenttabs). Wat uit dat document **blijft staan**: PR-A (toerekening), S1–S8, en het besluit dat
`/admin/embed` verdwijnt. Loopt PR-A nog open, doe die eerst — anders bouw je correcte
classificatie in op een verkeerde noemer.

---

## Fase 0 — vaststellen wat er werkelijk staat

**Deze prompt is geschreven zonder de werkkopie. Elk pad, elke veldnaam en elke aanname hieronder is
`(aanname)` tot jij het hebt bevestigd.** Lees eerst, rapporteer, en begin daarna pas.

Bevestig met pad + regelnummer:

1. De definitieve vorm van `outcome` en `outcome_reason` na PR-A2: welke waarden, welke spelling,
   waar het type staat.
   `(aanname)` `answered` / `refused` / `clarified` / `error`, met redenen `no_coverage`,
   `guard_hard_fact`, `guard_citation_coupling`, `out_of_scope`, `ambiguous_query`, `timeout`,
   `provider_error`, `aborted`.
2. Of `retrieved_count` en `top_score` op **alle** schrijfwegen gevuld worden, of alleen op een deel.
3. Waar `deriveRetrievalStrength` staat en welke drempel hij gebruikt.
4. Vanaf welke datum de nieuwe velden gevuld zijn. **Noteer die datum — hij komt terug in D6.**
5. Of PR-A geland is: filtert `windowScope` nog op `tenant_id`, en telt `/admin/funds` een rij nog
   bij twee fondsen?
6. De huidige routes en welke daarvan schrijfacties hebben.
7. Waar het profieltype van een agent vandaan komt.
   `(aanname)` een registry in `packages/agents` of `packages/shared`, niet een DB-kolom.
8. Bestaat `deriveFundStatus` / `deriveStatus` nog, en waar?

**Wijkt iets af, meld het en stop.** Improviseer geen alternatief — een dashboard dat er kloppend
uitziet op verkeerde velden is slechter dan een dashboard dat nog niet bestaat.

---

## Besluiten (default; afwijken mag alleen als de code het onmogelijk maakt, en dan met melding)

| # | Besluit | Default |
|---|---|---|
| **D1** | Sidebar is een lijst `<Link>`s naar route-segmenten | alleen de fondsswitcher is een client component. Geen client-side `Tabs` (S4, S9) |
| **D2** | Eén navigatie voor beide rollen | de admin krijgt in de switcher één extra optie *Alle fondsen* → platformoverzicht. Geen tweede schil (S5, S9) |
| **D3** | Profieltype stuurt kolommen en tabs | uit de bestaande registry, nooit een `switch` op agentsleutel (S15) |
| **D4** | Fondsstatus = slechtste agent | één gedeelde functie, hergebruikt de bestaande `derive*`-logica. Nul events blijft "nog niet live" (S8, S12) |
| **D5** | Periodekiezer als URL-searchparam | zodat de panelen server components blijven. Eén venster per pagina, doorgegeven aan elke query |
| **D6** | Rijen van vóór de meting | elk scherm dat op `outcome_reason` of retrieval-sterkte splitst, toont een regel "meting gestart op &lt;datum uit Fase 0 punt 4&gt;". Nooit stil meetellen als 0 |
| **D7** | `error` valt buiten de noemer | van beantwoordings- en weigergraad. Wel zichtbaar als eigen getal |
| **D8** | `clarified` telt niet als weigering | eigen categorie in elke verdeling |
| **D9** | Geen nieuwe DB-kolommen in deze reeks | alles komt uit wat PR-A2 heeft opgeleverd. Blijkt een scherm een kolom nodig te hebben, is dat een aparte PR met eigen motivering |

D1 en D2 zijn na de audit van 1 september 2026 geamendeerd in
`DECISION-dashboard-indeling.md`. Deze tabel is de prompt waarmee gebouwd is.

---

## PR-1 — de schil

Navigatie eerst, zonder één veld te verplaatsen. Na deze PR bestaan alle nieuwe routes en werkt alles
wat er nu is nog gewoon.

```
Bouw de sidebar-schil en zet de landing vast.

1. Een layout op fondsniveau met een vaste sidebar: Overzicht · Gesprekken · Signalen ·
   Agents · Instellingen. Links naar route-segmenten, aria-current op de actieve, geen
   client component (D1).

2. Fondsswitcher bovenin: één client component, navigeert naar dezelfde sectie van het
   gekozen fonds. Voor een admin met de extra optie "Alle fondsen" (D2). Welke opties
   iemand ziet volgt uit decideAccess, niet uit de URL.

3. Landing: elke ingang na inloggen komt uit op Overzicht. Enige uitzondering: een
   geforceerde wachtwoordwissel gaat naar de wisselpagina (S10).

4. De vijf routes bestaan en renderen — desnoods met de bestaande panelen ongewijzigd
   erin geplakt. Niets verplaatsen in deze PR.

VERBODEN: velden verplaatsen, queries aanpassen, theming, agentpagina aanraken,
oude routes verwijderen.

Definition of Done — bewijs per punt:
[ ] Sidebar rendert server-side: zoekresultaat dat aantoont dat er geen "use client"
    op de layout of de nav staat
[ ] Fondsswitcher toont voor een fund-user alleen het eigen fonds: test
[ ] Een admin ziet "Alle fondsen"; een fund-user niet: test op decideAccess
[ ] Landing komt uit op Overzicht vanaf minstens drie ingangen: test of stappenlijst
[ ] Alle bestaande routes werken nog: lijst met statuscodes
```

---

## PR-2 — de analyticslaag op uitkomst

Geen UI. Dit is de laag waar elk scherm hierna op leunt; als deze klopt, is de rest samenstellen.

```
Bouw de uitkomst-aggregaten in packages/analytics.

1. getOutcomeBreakdown({ fundKey, agentId?, since, until }) → per uitkomst een telling,
   plus voor 'refused' een splitsing naar outcome_reason, plus voor 'refused' een
   splitsing naar retrieval-sterkte via deriveRetrievalStrength.
   Dit is de enige plek waar die splitsing wordt gemaakt (Fase 0 punt 3).

2. De afgeleide KPI's als benoemde functies, niet als losse SQL per scherm:
   - beantwoordingsgraad = answered / (answered + refused + clarified)   [D7: error eruit]
   - weigergraad, en daarbinnen terecht (strength = none) versus verdacht (strong)
   - verduidelijkingsgraad
   - foutgraad, apart, met eigen noemer = alle turns
   Elke functie levert teller EN noemer terug, nooit alleen een percentage.

3. measurementStartedAt({ fundKey }) → de vroegste rij met een niet-lege outcome_reason.
   Elk scherm dat splitst gebruikt dit voor de regel uit D6.

4. Eén gedeelde fondsstatusfunctie: status per agent, en de fondsstatus als de slechtste
   daarvan (D4). Nul events = "nog niet live", nooit groen.

VERBODEN: UI, nieuwe kolommen, drempels van bestaande gates aanraken, iets aan de runtime.

Definition of Done:
[ ] Elke KPI-functie levert teller en noemer: type-signatuur
[ ] Test: een fonds met alleen 'error'-rijen geeft geen deling door nul en geen 0%,
    maar een expliciete "geen meetbare turns"
[ ] Test: 'clarified' verhoogt de weigergraad niet (D8)
[ ] Test: rijen met lege outcome_reason vallen buiten de terecht/verdacht-splitsing
    en beïnvloeden die percentages niet
[ ] measurementStartedAt geeft de datum uit Fase 0 punt 4: query-output
[ ] Geen enkele KPI-SQL meer buiten packages/analytics: zoekresultaat
```

---

## PR-3 — Overzicht

```
Bouw Overzicht als vier blokken in vaste volgorde (S11).

1. Activiteit — volume met lijn, huidige versus vorige periode, plus de mix per agent.
2. Status — één regel per agent (uitkomst, datum, corpusversie), plus de fondsstatus
   uit PR-2. Elke regel linkt naar de agentpagina.
3. Actualiteit — de laatste 5-10 gesprekken met uitkomst-chip en doorklik.
4. Acties — openstaande werkvoorraad. Nul acties is een geldige uitkomst; het blok
   blijft staan.

Periodekiezer als searchparam (D5), doorgegeven aan elk blok. Eén venster per pagina.

Nul events: geen leeg scherm en geen groen nulpunt, maar een onboarding-staat met de
volgende concrete stap (S11b).

Elk getal heeft precies één doorklik. Geen tweede rij tegels, geen uitklap (S11a).

VERBODEN: nieuwe queries buiten PR-2, een samengesteld kwaliteitscijfer per fonds,
de agentpagina aanraken.

Definition of Done:
[ ] Elk getal op het scherm komt uit een functie uit PR-2: lijst getal → functie
[ ] Twee blokken tonen nooit een ander venster: test op de searchparam
[ ] Nul events toont de onboarding-staat, niet 0%: screenshot of test
[ ] Eén rode agent maakt het fonds niet groen: test met twee agents
[ ] De D6-regel staat op elk blok dat splitst: zoekresultaat op measurementStartedAt
```

---

## PR-4 — Gesprekken

```
Eén fondsbrede gesprekkenlijst met filters (S16).

1. Filters: agent, uitkomst, reden, periode. Alles in de URL, geen client-state.
2. Gesprekskaart: vraag, antwoord, uitkomst-chip, reden, citatie-chips, tijd, permalink.
3. Een oefensessie krijgt in dezelfde lijst een eigen kaartvorm: scenario, aantal beurten,
   afgerond/afgebroken (S15). Welke vorm gerenderd wordt volgt uit het profieltype (D3).
4. De permalink is stabiel en deelbaar — dit is het anker voor artikel 50 en voor het
   nalopen van een incident.

VERBODEN: een tweede gesprekkenlijst op de agentpagina. De agentpagina linkt hierheen
met een voorgevuld filter.

Definition of Done:
[ ] Filteren op reden werkt en levert dezelfde tellingen als getOutcomeBreakdown:
    query-output naast schermwaarde
[ ] Een oefensessie rendert niet als vraag-antwoordpaar: test
[ ] Geen switch op agentsleutel in de rendering: zoekresultaat
[ ] Permalink overleeft een herlaad en een andere sessie: test
```

---

## PR-5 — Agentpagina naar drie tabs

```
Overzicht · Corpus|Scenario's · Publicatie (S13).

1. Welke middelste tab getoond wordt volgt uit het profieltype (D3): 'Corpus' voor
   gegrond-op-tekst, 'Scenario's' voor oefening. Geen lege corpus-tab bij een oefenagent.
2. Overzicht: uitkomstverdeling van deze agent, KPI's uit PR-2, laatste activiteit,
   releasetag, link naar Gesprekken met voorgevuld agentfilter.
3. Corpus: bronnen, versies, dekking, de gate-uitslag op die versie, en de
   goedkeuringsactie van het fonds — op één scherm, want dat besluit vereist beide (S13).
4. Publicatie: tagline, intro, artikel 50-tekst, starters, sleutel, snippet, CORS.
   Sleutelrotatie in een eigen, visueel afgezet blok onderaan — onomkeerbaar en hoort
   niet tussen tekstvelden.
5. Kolommen per profieltype: geen citatie- of weigerkolom bij een oefenagent (S15).

GRENS (S14): op deze pagina staat wat de gate ZEI over dit corpus — uitslag, datum,
corpusversie, artefactlink. Wat de gate IS — checks, drempels, release — staat op
platformniveau bij het agenttype, read-only. Kopieer die waarden hier niet naartoe.

VERBODEN: drempels tonen als bewerkbaar veld, een tweede gesprekkenlijst, een
kwaliteitspagina op fondsniveau.

Definition of Done:
[ ] Een oefenagent rendert de Scenario's-tab en geen enkele citatiekolom: test
[ ] Geen drempelwaarde uit de gatedefinitie staat in deze bestanden: zoekresultaat
[ ] Goedkeuring en gate-uitslag verwijzen naar dezelfde corpusversie: test
[ ] Sleutelrotatie zit in een eigen blok en vraagt bevestiging: screenshot
```

---

## PR-6 — Signalen, eerste versie

Bewust zonder clustering. De werkvoorraad is de waarde; de kaart komt later.

```
1. Onbeantwoorde vragen: refused met strength = none, gesorteerd op frequentie ×
   recentheid. Dit is de kennisgatlijst.
2. Verdachte weigeringen: refused met strength = strong. Aparte lijst — dit is werk
   voor ons, niet voor het fonds.
3. Adoptieblok voor de oefenagent: gekozen scenario's, waar afgebroken. Buiten de
   kennisgatlijst (S17).
4. De aggregatiedrempel zit in de querylaag, niet in de UI, en is niet te omzeilen door
   te versmallen op agent + periode + thema (S18).

VERBODEN: gegenereerde samenvattingen of themalabels. Elke regel is een letterlijke
vraag of een groep letterlijke vragen (S19). Geen clustering in deze PR.

Definition of Done:
[ ] De drempel zit in de query: pad + regelnummer, plus een test die aantoont dat een
    versmalling eronder een lege uitkomst geeft in plaats van losse rijen
[ ] Elke getoonde regel is doorklikbaar naar het gesprek: test
[ ] Geen enkel gegenereerd label in de output: zoekresultaat op de generatiepaden
```

---

## PR-7 — opruimen

```
1. Instellingen: huisstijl (S2), accounts, fondsbeheer.
2. Oude routes weg, met redirect. Geen dode ingang laten staan.
3. Ontdubbel de panelen die admin en fondsbeheerder nu allebei hebben tot één set met
   canWrite (S5).

Definition of Done:
[ ] Geen route meer die naar een verwijderd scherm wijst: zoekresultaat
[ ] Elk gedeeld paneel bestaat één keer: bestandslijst
[ ] Een fund-user krijgt op elke schrijfactie een weigering uit de server action, niet
    alleen een verborgen knop: test per action
```

---

## Volgorde en waarom

Schil vóór inhoud, data vóór schermen, opruimen als laatste. PR-1 en PR-2 raken elkaar niet en
kunnen parallel. PR-3 t/m PR-6 hangen allemaal aan PR-2 en zijn onderling onafhankelijk — als er
één blijft liggen, staat de rest.

De enige harde volgorde: **PR-2 vóór elk scherm.** Elk scherm dat zijn eigen SQL schrijft, is een
tweede definitie van dezelfde KPI, en dat is precies de fout die PR-A rechtzet en PR-A2 in de
runtime heeft opgeruimd. Die fout hoort niet terug te komen in de leeslaag.

---

## Wat er in deze reeks bewust niet gebeurt

Clustering op Signalen, de visuele lagen (activiteitspuls, clusterkaart, sparklines,
bewijsspoor-uitklap), de analytics-agent, en de kwartaalexport. Alle vier gaan over presentatie of
over een nieuwe belofte, en geen van vier is te bouwen voordat de cijfers eronder kloppen.

Wat wél nu al kosteloos is: elke doorsnede die een scherm toont, bestaat in PR-2 als aanroepbare
functie. Dan is de latere agent een profiel plus een gereedschapskist, geen tweede datapad.

---

## Herkomst

Letterlijke prompt uit de implementatiesessie van 1 september 2026, 9:48
(transcript `9f44104e`). In de repo gezet na de audit, zodat de meetlat niet uit een
sessietranscript hoeft te worden gereconstrueerd. D1/D2 in de tabel hierboven zijn de
bouwdefaults; de geamendeerde tekst staat in `DECISION-dashboard-indeling.md`.
