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

## Besluiten S9–S22

**S7-correctie (1 september 2026):** App Router-segmenten zijn Engels (`/conversations`, `/signals`,
`/settings`); UI-labels blijven Nederlands. Oude Nederlandse URL's redirecten permanent (308).

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

**S18 — Geamendeerd 4 september 2026 (kennisgaten).** De aggregatiedrempel van drie
identieke vragen is vervallen. Het hoofdgetal telt **onbeantwoorde vragen** (rijen), niet
groepen; de lijst bundelt alleen bijna-letterlijke woordvarianten. Zie
`DECISION-kennisgaten.md`. De oude regel (drempel in de querylaag, niet in de UI) gold tot
die amendement.

**S19 — Geen gegenereerde labels of samenvattingen.** Elke getoonde regel is een letterlijke
vraag of een groep letterlijke vragen, en is doorklikbaar naar het gesprek.

**S20 — (niet teruggevonden).** Het nummer zat in de reeks S9–S21; de originele zin is niet in
de repo of in het implementatietranscript aangetroffen. Niet invullen uit afleiding.

**S21 — De werkvoorraad is fondsbreed** en staat niet per agent verspreid.

**S22 — De begrippenladder (1 september 2026).** Drie woorden, strikt gescheiden:

- **vraag** — één beurt: vraag plus antwoord. Eén rij in `interaction_events`. Hieraan hangen de
  uitkomst, de citaten en het bewijsspoor.
- **gesprek** — één sessie: één bezoeker, één agent, één of meer vragen achter elkaar.
- **sessie** — het rollenspel-equivalent, en dezelfde vorm: een container met beurten.

Daaruit volgt de regel die alles consistent maakt: **KPI's tellen vragen, de lijst toont
gesprekken.** Een uitkomst is een eigenschap van een vraag, nooit van een gesprek. Een gesprek
waarin twee vragen beantwoord worden en één geweigerd heeft geen uitkomst — het heeft een verloop.

Gevolgen per scherm: de navigatie blijft **Gesprekken** (S9 ongewijzigd); Activiteit is tweeledig
("N vragen in M gesprekken"), want vragen per gesprek is de beste adoptiematen die we hebben;
Actualiteit toont **vragen**; de lijst toont gesprekken met hun vragen eronder, met de
uitkomstchip bij de vraag en niet bij de kop; elke KPI-noemer heet "vragen".

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
| **D10** | Gespreksgrens is afgeleid, niet toegekend | 30 minuten stilte, gegroepeerd op `(session_id, agent_id)`. Eén definitie in de analyticslaag, nul DDL — zie amendement A6. |

## Open eindjes die dit document laat staan

1. ~~**Oefen-turns en `interaction_events` (O-1).**~~ **Gesloten op 1 september 2026.**
   Oefen-turns horen daar niet: ze hebben geen uitkomst in de zin van de classificatie, ze
   hebben een sessieverloop. Twee tabellen, twee begrippen. Vastgelegd waar het telt in
   plaats van in de leeslaag: `interactionEventInputSchema.agentId` accepteert alleen een
   grounded agentsleutel, en `resolveRequestScope` weigert een niet-grounded instancesleutel
   met `400 unknown_agent`. Een oefenagent kan dus geen interactie-event meer produceren, en
   geen enkele toekomstige query hoeft hem eruit te filteren. Het Overzicht leest zijn volume
   uit `roleplay_sessions` (`getExerciseActivity`) en toont hem sessies in plaats van een
   uitkomstregel (S15). Wat overblijft is één historische rij in
   `fund_oomt.interaction_events` van 27 augustus, die geen huidig codepad kan hebben
   geschreven; zolang die er staat, telt hij dubbel in Gesprekken (F-41, F-42).

2. ~~**Corpusversie die de poort beoordeelde (S13, S14).**~~ **Besloten op 1 september 2026,
   nog te bouwen.** Het ontbrekende begrip wordt de **corpusvingerafdruk**: één waarde per
   agent per fonds, afgeleid over de hele documentset van die agent — per document
   `(source_uri, version, content_hash)`, gesorteerd op `source_uri`, sha256, afgekort. Zie
   amendement A5.

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

**A5 — S13/S14: de corpusvingerafdruk.** Een documentversie is geen corpusversie. Met meer dan
één document pakt `corpusVersionLabel` er willekeurig één en zegt de goedkeuring niets over de
rest. Daarom krijgt "het corpus waar deze agent op staat" een eigen, afleidbare waarde.

*Wat het is.* Per agent per fonds: sha256 over de gesorteerde tripletten
`(source_uri, version, content_hash)` van álle documenten van die agent, afgekort tot twaalf
tekens. Deterministisch, geen opslag nodig, en gevoelig voor precies de drie dingen die het
corpus veranderen: een document erbij, een nieuwe versie, of gewijzigde inhoud.

*Wat goedkeuren gaat betekenen.* `pinned_release_tag` bewaart die vingerafdruk in plaats van een
documentversie. Goedgekeurd = de gepinde vingerafdruk is gelijk aan de huidige. Elke
corpuswijziging maakt de goedkeuring dus verlopen in plaats van stilzwijgend geldig te blijven —
dat is het hele punt. De kolom blijft `text` en krijgt geen migratie; alleen de betekenis
verandert. Gecontroleerd op 1 september: buiten de goedkeurings-UI leest niets deze kolom, dus
er hangt geen retrieval- of runtimegedrag aan.

*Wat het niet oplost.* De poort blijft "onbekend" zolang `getReleaseManifest` een stub is. Pas
als de release-manifest-track (PLAN-ui-ecosystem §7) landt en dezelfde vingerafdruk vastlegt, is
"poort en goedkeuring wijzen naar hetzelfde corpus" controleerbaar in plaats van beloofd. Tot dan
claimt de fondspagina niets over de poort en heet de losse documentversie wat hij is: de laatst
geladen versie.

*Gevolg voor bestaande data.* Geen. Gemeten op 1 september: van de 25 instances heeft er nul een
`pinned_release_tag`, dus er verloopt geen enkele bestaande goedkeuring. Was er wel een gepind
geweest — een waarde als `1` of `arbo-oomt-2` — dan had die na de bouw als niet goedgekeurd
gelezen, en terecht: hij was goedgekeurd op een willekeurige waarde.

**A6 — S22/D10: waar een gesprek begint en eindigt.** De inconsistentie die S22 oplost was geen
labelfout. Er bestond alleen een *vraag*; "gesprek" werd op elk scherm verzonnen. De tegel heette
Gesprekken en telde turns.

*Wat er al lag.* `interaction_events.session_id` bestaat, is `NOT NULL`, wordt op elk schrijfpad
gevuld en heeft een eigen index. Dit is dus géén nieuwe kolom en geen D9-geval: het is een
groepering die de leeslaag nooit gemaakt heeft.

*Waarom die kolom alleen niet volstaat.* `session_id` is geen gesprek maar een **browsertabblad**:
de playground bewaart hem in `sessionStorage` zonder vervaltijd. Gemeten op 1 september 2026 over
`fund_oomt` en `fund_elektronische-detailhandel`:

| grondslag | vragen | containers | vragen per container |
|---|---|---|---|
| ruwe `session_id` | 224 | 38 | 5,90 |
| 30 minuten stilte | 224 | 89 | **2,52** |

De grootste ruwe sessie was 63 vragen over 34 uur met een gat van 12u17 erin; een andere 12 vragen
over 2 dagen en 19 uur. Van de 189 intervallen tussen opeenvolgende vragen waren er 50 langer dan
30 minuten. Zonder tijdgrens zou de adoptiematen met een factor 2,3 opgeblazen zijn door open
blijven staande devtabs — precies op het getal dat we als adoptiesignaal willen publiceren.

*Groeperingssleutel is `(session_id, agent_id)`.* Niet `session_id` alleen: de playground deelt één
`sessionStorage`-key over agents heen, en twee gemeten sessies in `fund_oomt` bevatten zowel `cao`
als `arbo`. S22 zegt "één bezoeker, één agent", dus de agent hoort in de sleutel.

*Afgeleid, niet toegekend.* De grens leeft als één functie in `packages/analytics`
(`groupIntoConversations`), niet als kolom. Dat geeft één definitie voor álle rijen — inclusief de
227 die er al stonden — en het houdt de reeks op nul DDL. Een toegekend id zou een sterker
bewijsanker zijn, maar dan bestaan er twee definities zolang oude rijen afgeleid en nieuwe
toegekend worden; dat is de ziekte die deze audit vijf keer vond (F-68). Promotie naar een kolom
blijft open zodra het bewijsanker of het volume het afdwingt.

*Permalink blijft een vraag.* Een afgeleid gespreks-id is vensterafhankelijk: bij een periode van
7 dagen valt een ander eerste event in het venster dan bij 30 dagen. Daarom is de permalink
ongewijzigd een **event-id**, en resolvet de detailpagina die naar het hele gesprek waar hij in
zit — venstervrij — met een anker op die vraag. Elke bestaande permalink blijft dus werken.

*Twee kanalen kunnen niet gebundeld worden.* `/api/mcp` is bewust stateless (`createMcpHandler`,
M2 in `PLAN-mcp-server.md`): een tool-call draagt geen gespreks-id, dus de host heeft wél een
gesprek maar geeft ons niets om beurten te rijgen. Gemeten: 10 MCP-vragen, 10 "gesprekken", exact
1,00. Voor MCP en losse API-calls is één vraag per gesprek de waarheid van het kanaal, geen
meetfout. Ze worden daarom als **losse vragen** benoemd en buiten de vragen-per-gesprek-verhouding
gehouden in plaats van als adoptiesignaal te tellen.

*Eén schrijfpad was wél stuk.* De embed maakte een nieuw id per component-mount
(`useMemo(randomUUID)`), zonder enige persistentie: elke paginanavigatie op de site van het fonds
startte een nieuw gesprek (gemeten 1,00–1,14 vragen per gesprek). Dat is rechtgezet naar hetzelfde
`sessionStorage`-patroon als de playground, in een eigen commit.

## Bewust niet in deze reeks

Clustering op Signalen, visuele lagen (activiteitspuls, clusterkaart, sparklines,
bewijsspoor-uitklap), de analytics-agent, de kwartaalexport. Geen van vier is te bouwen
voordat de cijfers eronder kloppen.

## Herkomst

Dit document stond niet in de repo tijdens de implementatie en de audit van 1 september
2026. De auditor heeft S9–S21 teruggehaald uit het implementatietranscript
(sessie `9f44104e`, 9:48) en de verificatieprompt. S20 is niet teruggevonden. De
amendementen A1–A5 zijn de weging van 1 september op die audit. S18 is geamendeerd op
4 september 2026; zie `DECISION-kennisgaten.md`.
