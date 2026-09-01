# DECISION — dashboardindeling (S9–S21)

**Status:** accepted · geamendeerd 1 september 2026 (na audit)  
**Datum:** 1 september 2026  
**Amendeert:** [DECISION-dashboard-ia.md](./DECISION-dashboard-ia.md) (S1–S8 blijven gelden)  
**Uitvoering:** [IMPLEMENTATIEPROMPT-dashboard-indeling.md](./IMPLEMENTATIEPROMPT-dashboard-indeling.md)  
**Audit:** [AUDIT-dashboard-indeling-2026-09-01.md](../audit/AUDIT-dashboard-indeling-2026-09-01.md)

## Context

S1–S8 zetten drie niveaus en de toerekening vast. Ze zegden niets over de schil: de fondspagina
was nog een tabblad met broodkruimels, de cijfers kwamen uit `found`, en de agentpagina mengde
platform- en fondszorgen. Dit document legt de indeling vast die daarvoor in de plaats komt.

S1–S8 blijven gelden. `/admin/embed` verdwijnt (S2). KPI-scope blijft het fondsschema, niet
`tenant_id`.

## Besluiten S9–S21

**S9 — Vijf sidebar-items.** Overzicht, Gesprekken, Signalen, Agents, Instellingen. Meer of
minder is een wijziging van dit besluit. Navigatie loopt via route-segmenten; geen client-side
`Tabs` (S4).

**S10 — Landing is Overzicht.** Elke ingang na inloggen komt uit op Overzicht. Enige uitzondering:
een geforceerde wachtwoordwissel.

**S11 — Overzicht is vier blokken**, in deze volgorde: Activiteit, Status, Actualiteit, Acties.

**S11a — Geen tweede rij, geen uitklap.** Elk getal heeft precies één doorklik.

**S11b — Nul events is onboarding**, geen groen nulpunt en geen leeg vlak. De volgende concrete
stap staat op het scherm.

**S12 — Fondsstatus is de laagste stand van de agents**, niet een gemiddelde of een som. Nul
events blijft "nog niet live" (S8). *(As van de standen zelf: zie amendement A3.)*

**S13 — Drie agenttabs.** Overzicht · Corpus of Scenario's · Publicatie. De middelste tab volgt
het profieltype. Corpusversie, gate-uitslag en fondsgoedkeuring staan op één scherm omdat dat
besluit beide nodig heeft.

**S14 — Grens fondspagina / platform.** Op de fondspagina staat wat de poort *zei* over dít
corpus: uitslag, datum, corpusversie, artefactlink. Wat de poort *is* — checks, drempels,
release — staat op platformniveau bij het agenttype, read-only. Die waarden worden niet
naartoe gekopieerd.

**S15 — Rendering volgt het profieltype**, nooit een `switch` of `if` op een agentsleutel. Een
oefenagent toont geen citatie- of weigerkolom en geen lege corpus-tab. Een oefensessie rendert
als sessie, niet als vraag-antwoordpaar.

**S16 — Eén fondsbrede gesprekkenlijst** met filters op agent, uitkomst, reden en periode.
Filterstand in de URL. Permalink stabiel. Geen tweede lijst op de agentpagina; die linkt
hierheen met een voorgevuld filter.

**S17 — Rollenspelinput zit niet in de kennisgatlijst.** Adoptie (gekozen scenario's, waar
afgebroken) staat in een eigen blok.

**S18 — Aggregatiedrempel in de querylaag**, niet in de UI, en niet te omzeilen door te
versmallen op agent, periode of thema.

**S19 — Geen gegenereerde labels of samenvattingen.** Elke getoonde regel is een letterlijke
vraag of een groep letterlijke vragen, en is doorklikbaar naar het gesprek.

**S20 — (niet teruggevonden).** Het nummer zat in de reeks S9–S21; de originele zin is niet in
de repo of in het implementatietranscript aangetroffen. Niet invullen uit afleiding.

**S21 — De werkvoorraad is fondsbreed** en staat niet per agent verspreid.

## Uitvoeringsbesluiten D1–D9

Deze tabel stuurde PR-1 t/m PR-7. D1 en D2 zijn na de audit geamendeerd (A1, A2).

| # | Besluit | Inhoud |
|---|---|---|
| **D1** | Navigatie is de route | Geen navigatiestate die de route vervangt, geen data-ophaling in client components. Een client-sidebar vanwege een mobiele drawer is toegestaan. *(Was: alleen de fondsswitcher mag client zijn.)* |
| **D2** | Eén navigatie voor beide rollen | Admin ziet in de switcher *Alle fondsen*. Een fondsgebruiker met één fonds krijgt geen switcher. Welke opties iemand ziet volgt uit `decideAccess`, niet uit een rolvergelijking ernaast. |
| **D3** | Profieltype stuurt kolommen en tabs | Uit de bestaande registry, nooit een `switch` op agentsleutel (S15). |
| **D4** | Fondsstatus = slechtste agent | Eén gedeelde functie. Nul events blijft "nog niet live" (S8, S12). |
| **D5** | Periodekiezer als URL-searchparam | Eén venster per pagina, doorgegeven aan elke query. |
| **D6** | Rijen van vóór de meting | Elk scherm dat op `outcome_reason` of retrieval-sterkte splitst, toont wanneer de meting startte. Nooit stil meetellen als 0. Datum uit `measurementStartedAt`, niet ingetypt. |
| **D7** | `error` valt buiten de noemer | Van beantwoordings- en weigergraad. Wel zichtbaar als eigen getal. |
| **D8** | `clarified` telt niet als weigering | Eigen categorie in elke verdeling. |
| **D9** | Geen nieuwe DB-kolommen in deze reeks | Alles komt uit PR-A2. Een scherm dat een kolom nodig heeft, is een aparte PR. |

## Open eindjes die dit document laat staan

1. **Oefen-turns en `interaction_events` (O-1).** Besloten na audit: oefen-turns horen daar
   niet. Ze hebben geen uitkomst in de zin van de classificatie; ze hebben een sessieverloop.
   Twee tabellen, twee begrippen. De schrijfweg moet stoppen met oefen-turns in
   `interaction_events` te zetten. Filteren op agentsleutel in de leeslaag is een symptoomfix
   en laat de dubbeltelling in elke toekomstige query terugkomen. Tot die schrijfweg er is,
   is de huidige dubbeltelling (F-36, F-42) het zichtbare gevolg van dit gat, geen aparte bug.

2. **Corpusversie die de poort beoordeelde (S13, S14).** Goedkeuring en gate-uitslag moeten
   naar dezelfde versie verwijzen. Dat begrip — de versie die de poort heeft beoordeeld, per
   agent — bestaat niet in de code. `corpusVersionLabel` pakt de eerste niet-lege
   documentversie, fondsbreed. De goedkeuringsactie bewaakt die waarde server-side, maar dat
   is een slot op een willekeurig getal. S13/S14 zijn niet ingevuld tot dit begrip bestaat.

3. **As van de fondsstatus (S12).** De aggregatieregel is vastgelegd (laagste stand). Waar de
   standen zelf op gebaseerd zijn, is dat niet. De huidige as meet alleen storing (foutratio
   > 0.2 → degraded, nul events → offline). Een agent die honderd procent weigert blijft
   operational. Dat is een gat in dit besluit, niet in de bouw.

4. **Profieltype als veld.** Feitelijk twee types, afgeleid uit `GROUNDED_AGENT_KEYS`. Een
   agent zonder vermelding valt stil terug op oefenagent. Hard falen op een onbekende agent
   is nog niet besloten.

## Amendementen na audit (1 september 2026)

**A1 — D1.** De hele sidebar is client vanwege de mobiele drawer. D1 was bedoeld om
client-side tabnavigatie en client-side dataophaling te voorkomen, niet om een drawer te
verbieden. D1 is herformuleerd; de code blijft staan.

**A2 — D2.** Een fondsgebruiker met één fonds krijgt geen switcher. Dat is beter dan een
dropdown met één optie. D2 is aangepast. De tweede definitie `user.role !== "admin"` naast
`decideAccess` is géén besluitwijziging: die hoort gerepareerd, het is het patroon dat de
rest van de reeks opruimt.

**A3 — S12.** Zie open eind 3. Niet repareren als bouwfout.

**A4 — O-1.** Zie open eind 1. Besloten: oefen-turns uit `interaction_events`.

## Bewust niet in deze reeks

Clustering op Signalen, visuele lagen (activiteitspuls, clusterkaart, sparklines,
bewijsspoor-uitklap), de analytics-agent, de kwartaalexport. Geen van vier is te bouwen
voordat de cijfers eronder kloppen.

## Herkomst

Dit document stond niet in de repo tijdens de implementatie en de audit van 1 september
2026. De auditor heeft S9–S21 teruggehaald uit het implementatietranscript
(sessie `9f44104e`, 9:48) en de verificatieprompt. S20 is niet teruggevonden. De
amendementen A1–A4 zijn de weging van 1 september 13:09 op die audit.
