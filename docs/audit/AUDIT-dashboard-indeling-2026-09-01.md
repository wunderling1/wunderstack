# Audit — dashboardindeling (1 september 2026)

Gemeten stand: **werkboom, niet-gecommitteerd** (`git status`: de hele reeks PR-1..PR-7 staat
ongecommitteerd naast PR-A2). Gates: `pnpm turbo typecheck` groen; `test:unit` 79 pass / 1 skip /
**1 fail** (zie F-40).

## 0 · Meetlat — status van de brondocumenten

| Document | Status |
|---|---|
| `docs/decisions/DECISION-dashboard-ia.md` (S1–S8) | aanwezig, gelezen |
| `DECISION-dashboard-indeling.md` (S9–S21) | **niet aanwezig** in de repo |
| `IMPLEMENTATIEPROMPT-dashboard-indeling.md` (PR-1..PR-7, D1–D9) | **niet aanwezig** in de repo |

Gezocht op `DECISION-dashboard-indeling`, `IMPLEMENTATIEPROMPT`, `S11b`, `S19`, `D7` in de hele
repo, in `git log --all --diff-filter=D`, in `git stash list` en in ongetrackte mappen (`claude/`,
`docs/references/`). Niet aangetroffen. `apps/dashboard/AGENTS.md:44` zegt dit zelf: *"`DECISION-
dashboard-indeling.md` bestaat niet; de implementatieprompt is leidend."*

De volledige tekst van de implementatieprompt (PR-1..PR-7 + D1–D9 + de parafrase van S9–S21) is
teruggehaald uit het transcript van de implementatiesessie van 1 september
(`agent-transcripts/9f44104e-…`, bericht 0 en 57) en dáártegen is gemeten. Waar de audit-checklist
en die prompt verschillen, staat dat bij de bevinding. **Eén verschil vooraf:** de checklist noemt
"`/admin/embed` bestaat niet meer" als S3, `DECISION-dashboard-ia.md:31` nummert dat punt als S2.

---

## Tabel 1 — bevindingen

### A1 · Schil en navigatie

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-01 | S9 | Sidebar = precies 5 items | Precies 5: Overzicht, Gesprekken, Signalen, Agents, Instellingen | `apps/dashboard/lib/fund-nav.ts:4-10` | weerlegd (geen bevinding) | — |
| F-02 | S9 | idem | Op platformniveau rendert dezelfde sidebar 3 andere items (Overzicht, Fondsen, Agents). Dit is de *Alle fondsen*-stand uit D2, geen zesde fondsitem | `apps/dashboard/lib/fund-nav.ts:13-17`, `:111-117` | bevestigd, conform | — |
| F-03 | **D1** | Layout + sidebar server; **alleen** de fondsswitcher client | De **hele sidebar** is een client component (`"use client"`, `useState` voor de mobiele drawer). De switcher zit erbinnen | `apps/dashboard/components/chrome/dashboard-sidebar.tsx:1`, `:5`, `:22`, `:110` | bevestigd | afwijking |
| F-04 | D1 | idem | Alle layouts zijn server. Buiten sidebar/switcher zijn de enige client-componenten formulieren met `useActionState` — legitiem | `rg -l '"use client"' components app` → 12 treffers, geen layout of pagina | weerlegd | — |
| F-05 | S4 | Geen client-side `Tabs`; navigatie via route-segmenten | Agenttabs en periodekiezer zijn server-gerenderde `Link`s met `NavPills` | `apps/dashboard/components/fund/agent-tab-nav.tsx` (geen `"use client"`), `components/fund/period-picker.tsx` | weerlegd | — |
| F-06 | **D2** | Fondsgebruiker ziet switcher met alleen eigen fonds; admin daarnaast *Alle fondsen* | Fondsgebruiker krijgt **geen switcher**: bij een niet-admin retourneert de builder een lege lijst | `apps/dashboard/lib/switcher-options.ts:26` | bevestigd | afwijking |
| F-07 | **D2** | Die keuze komt uit de autorisatielaag | Komt uit een **rolvergelijking in de leeslaag** (`user.role !== "admin"`), niet uit `decideAccess`. Tweede definitie van "admin" naast `lib/authz.ts` | `apps/dashboard/lib/switcher-options.ts:26` vs. `apps/dashboard/lib/authz.ts:14-34` | bevestigd | afwijking |
| F-08 | S10 | Landen na inloggen = Overzicht, wachtwoordwissel enige uitzondering | Verse login: `redirectTo: "/"`; bestaande sessie: `mustChangePassword` → `/password`, anders `/admin` (admin) of `/` (fonds) | `apps/dashboard/app/login/page.tsx:14-18`, `:26-30` | bevestigd, conform | — |
| F-09 | S10 | Fondswissel houdt je op dezelfde sectie | `switchFundNavHref` mapt het huidige segment naar het doelfonds | `apps/dashboard/lib/fund-nav.ts:127-152` | bevestigd, conform | — |
| F-10 | S10 | Deep link naar een verwijderde route komt goed uit | Op de adminkant redirecten alle 6 verwijderde paden (`branding`, `manage`, `accounts`, `texts`, `distribution`, `lti`). Op de **fondskant** bestaat geen redirectlijst: een oud pad geeft `notFound()` en er is **geen `not-found.tsx`** in de app | `app/(admin)/…/branding/page.tsx` e.a. (6 bestanden); `find app -name not-found.tsx` → leeg | bevestigd | open eind |

### A2 · Analyticslaag — zwaartepunt

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-11 | PR-2 | Geen KPI-SQL buiten de analyticslaag | **`/admin/funds` bouwt zelf queries**: `getDb().select()` op `funds` (2×) en `count()` op `users`, plus een eigen fondsstatus-functie | `app/(admin)/admin/funds/page.tsx:27`, `:35-36`, `:44`, `:49` | bevestigd | zie F-12 |
| F-12 | **S12 / D4** | Fondsstatus = laagste stand van de agents | Een functie die **`deriveFundStatus`** heet en de status uit een **fondsbrede som** (`total`, `errors`) berekent — niet de laagste stand over agents. Naast `packages/analytics/src/outcomes.ts:218-223`, dat het wél goed doet | `app/(admin)/admin/funds/page.tsx:27-31`, `:46-49` | bevestigd | **blokkerend** |
| F-13 | **D7** | `error` buiten de noemer van de beantwoordingsgraad | Adminoverzicht rekent `answeredWithCitations / total`, waarin `total` **`error` én `unknown`** bevat. Het percentage op het scherm is daarmee aantoonbaar te laag | `app/(admin)/admin/page.tsx:42`, `:111`; noemer uit `packages/analytics/src/kpi.ts` (`getAgentActivity`) | bevestigd | **blokkerend** |
| F-14 | PR-2 | Eén statusdefinitie | `deriveStatus` staat een derde keer in het adminoverzicht | `app/(admin)/admin/page.tsx:26-29` | bevestigd | afwijking |
| F-15 | PR-2 | Elke KPI-functie levert teller **en** noemer | `Rate = { numerator, denominator } \| { kind: "no_measurable_turns" }` — geen losse percentages in de analyticslaag | `packages/analytics/src/outcomes.ts:25-32`, `:89-113` | weerlegd | — |
| F-16 | **D7** | `error` buiten de noemer (analyticslaag) | `qualityDenominator = answered + refused + clarified`; `error` **en** `unknown` vallen erbuiten. `answerRate`/`refusalRate`/`clarificationRate` gebruiken die noemer; `errorRate` gebruikt expliciet het volledige totaal. Strenger dan D7 vraagt, en dat is de goede kant | `packages/analytics/src/outcomes.ts:78-80`, `:89-106` | weerlegd (formule gelezen) | — |
| F-16b | D6/D7 | Eén definitie van "totaal turns" | Omdat `unknown` buiten `qualityDenominator` valt maar wél in `totalTurns` zit, bestaan er twee totalen naast elkaar: het volumetotaal in de leeslaag en het kwaliteitstotaal in de analyticslaag. Zichtbaar gevolg op de huidige data (alles `unknown`): Activiteit toont 119 gesprekken terwijl Status "geen meetbare turns" meldt. Dat is bedoeld gedrag van D6, maar de twee totalen zijn niet één begrip | `apps/dashboard/lib/overview.ts:9` vs. `packages/analytics/src/outcomes.ts:78-80`; render `lib/overview.ts:13-20` | bevestigd | afwijking |
| F-17 | **D8** | `clarified` telt niet als weigering | `refusalRate` heeft alleen `counts.refused` als teller, `clarified` zit uitsluitend in de noemer | `packages/analytics/src/outcomes.ts:94-97` | weerlegd | — |
| F-18 | PR-2 | Terecht/verdacht via **één** gedeelde afleidingsfunctie voor retrieval-sterkte | De regel staat **vier keer**, en de gedeelde functie is de enige die *niet* gebruikt wordt: `deriveRetrievalStrength` wordt door geen enkele query aangeroepen (alleen geëxporteerd + in een test genoemd). De drie werkende implementaties zijn inline: 3 SQL-filters, `strengthFromSignals`, `strengthParts` | gedeeld: `packages/analytics/src/retrieval-strength.ts:13-24` — gebruik: alleen `src/index.ts:20` en `src/outcomes.test.ts:44`. Kopieën: `src/outcomes.ts:150-152`, `src/outcomes.ts:234-242`, `src/signals.ts:115-123` | bevestigd | afwijking |
| F-19 | PR-2 | De drempel niet een tweede keer | De **waarde** staat één keer (`RETRIEVAL_STRONG_MIN_SCORE = 0.6`) en wordt in alle vier de plekken geïmporteerd. Geen hardgecodeerde 0.6 in een scherm (gezocht op `0.6`, `0,6`, `60%`, `threshold`, `drempel` in `apps/`) | `packages/analytics/src/retrieval-strength.ts:9` | weerlegd | — |
| F-20 | PR-2 | Rijen zonder `outcome_reason` beïnvloeden de splitsing niet | Alle drie de sterkte-filters bevatten `outcome_reason is not null` in de `WHERE`/`FILTER`; de signalenquery idem via `isNotNull` | `packages/analytics/src/outcomes.ts:150`, `:151`, `:152`; `src/signals.ts:93` | weerlegd (WHERE gelezen) | — |
| F-21 | **D9** | Geen nieuwe DB-kolommen in deze reeks | Alleen de vier kolommen van PR-A2 (`outcome`, `outcome_reason`, `retrieved_count`, `top_score`), migratie `0003_turn_outcome`. `git diff packages/db` bevat geen nieuwe kolom in deze reeks | `packages/db/src/fund-ddl.ts:356-366`; `git diff --stat packages/db` | weerlegd | — |
| F-22 | (substraat PR-A2) | Drizzle-schema = DDL | `top_score` is `real()` (float4) in Drizzle en `double precision` (float8) in de DDL. Lezen werkt, maar `drizzle-kit` ziet permanent drift | `packages/db/src/schema/fund/interaction-events.ts:39` vs. `packages/db/src/fund-ddl.ts:174` | bevestigd | afwijking |
| F-23 | PR-2 | `agentId` in de queries is een agentsleutel | Eerder vermoeden (`isGroundedAgentKey` op een UUID) is **onjuist**: `interaction_events.agent_id` bevat de sleutel. DB: `select distinct agent_id from fund_oomt.interaction_events` → `cao`, `roleplay` | `packages/analytics/src/conversations.ts:109`, `:118`; DB-query | weerlegd | — |

### A3 · Overzicht

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-24 | S11 | Vier blokken in de volgorde Activiteit, Status, Actualiteit, Acties | Exact die volgorde | `apps/dashboard/components/fund/overview.tsx:58-61` | weerlegd | — |
| F-25 | S11 | Elk getal herleidbaar tot de analyticslaag | Herleidbaar op één na — zie de herleidingstabel in §1 en F-26 | zie §1 | bevestigd, conform | — |
| F-26 | **S11/S12** | De corpuskolom per agentregel hoort bij díe agent | `getCorpusOverview(fundKey)` wordt **zonder agentsleutel** geladen; `corpusVersionLabel` pakt de eerste niet-lege versie en die ene waarde wordt op **elke** agentregel getoond. DB-bewijs (`fund_oomt`): cao's echte versie is `1`, arbo's is `arbo-oomt-2`; de query zonder agentsleutel geeft `arbo-oomt-2`, dus de cao-regel toont arbo's corpusversie | `apps/dashboard/lib/overview-load.ts:62`, `lib/overview.ts:32-35`, `components/fund/overview.tsx:152`, `:173` | bevestigd | **blokkerend** |
| F-27 | **D5** | Eén periodekiezer per pagina, via searchparam, doorgegeven aan elk blok | Eén `PeriodPicker` per stand, periode uit de searchparam. **Maar**: Activiteit/Status/Acties krijgen `since..until`, terwijl Actualiteit en "laatste activiteit per agent" alleen `since` meekrijgen — `KpiWindow` heeft geen `until`. Vandaag ongevaarlijk (`until` = nu), maar het is een tweede vensterdefinitie | `components/fund/overview.tsx:42`, `:51`; `lib/overview-load.ts:58-59` vs. `:63`, `:70`; `packages/analytics/src/kpi.ts:37-43`, `:47` | bevestigd | afwijking |
| F-28 | **S12/D4** | Fondsstatus = laagste stand; twee agents waarvan één rood → fonds rood | `deriveFundStatus` neemt de **slechtste** via `STATUS_RANK` (geen gemiddelde, geen som) — correct. Gevolg dat wél fout uitpakt: `STATUS_RANK.offline (2) > degraded (1)`, dus **één agent met nul events trekt het hele fonds naar "offline"** | `packages/analytics/src/outcomes.ts:206-223`; `apps/dashboard/lib/overview.ts:26-30` | bevestigd (mechaniek correct) | — |
| F-29 | S12 | Status op het scherm is waar | `fund_elektronische-detailhandel` heeft **23 events in de laatste 30 dagen** maar **0 rijen in `control.agent_instances`**; `model.agents` is dan leeg → `deriveFundStatus([])` = `offline` → badge "Nog niet live" op een fonds dat aantoonbaar live verkeer heeft | DB: `select count(*) … interval '30 days'` → 23; `select count(*) from control.agent_instances where tenant_id='elektronische-detailhandel'` → 0. Code: `packages/analytics/src/outcomes.ts:218-220`, `lib/overview-load.ts:61` | bevestigd | **blokkerend** |
| F-30 | S12 | Er is een rode stand | `deriveAgentStatus` kent alleen `operational`, `degraded` (foutratio > 0.2) en `offline` (nul events). Een fonds dat 100% weigert blijft "operational" | `packages/analytics/src/outcomes.ts:206-210` | bevestigd | open eind |
| F-31 | S8/S11b | Nul events = onboarding-staat, geen groen nulpunt | Onboarding-kaart met vervolgstap; de vier blokken worden dan niet gerenderd | `components/fund/overview.tsx:39-46`, `:66-83`; `lib/overview.ts:22-24` | weerlegd | — |
| F-32 | S11b | idem | Onboarding vereist dat **huidige én vorige** periode nul zijn. Een fonds dat stilvalt krijgt de nulstand met "Nog niet live" (F-29) i.p.v. onboarding. Verdedigbaar, maar het is een tweede betekenis van dezelfde badge | `lib/overview.ts:22-24` | bevestigd | afwijking |
| F-33 | **D6** | Meetdatum-melding op elk blok dat naar reden of sterkte splitst; datum uit de data | Melding staat op Status en Acties — de twee blokken die splitsen. Datum komt uit `measurementStartedAt` (`min(occurred_at) where outcome_reason is not null`), niet ingetypt | `components/fund/overview.tsx:142`, `:234`; `components/fund/measurement-note.tsx:4-12`; `packages/analytics/src/outcomes.ts:195-203` | weerlegd | — |
| F-34 | D6 | Nederlandse UI-tekst | "uitkomst**rede**" i.p.v. "uitkomstreden", tweemaal in dezelfde zichtbare melding | `components/fund/measurement-note.tsx:8-9` | bevestigd | afwijking |
| F-35 | **S11a** | Elk getal heeft precies één doorklik, en het label dekt het getal | Het Acties-getal is `rates.refusedJustified.numerator` = **aantal turns** dat weigerde zonder retrieval, en heet op het scherm "N **kennisgaten**" met een link naar Signalen. Signalen toont alleen **groepen met ≥ 3 dezelfde vragen**. Het getal is dus geen kennisgatenaantal en de doorklik komt structureel niet uit op N regels | `components/fund/overview.tsx:228-229`, `:240` vs. `packages/analytics/src/signals.ts:217` | bevestigd | **blokkerend** |
| F-36 | **S15** | Een oefenagent toont geen citatie- of weigerkolom | De Status-tabel geeft **elke** agentregel dezelfde uitkomstregel ("… beantwoord · n geweigerd · n verduidelijkt"), inclusief de rollenspelagent — er is geen profieltype-afslag in de rendering. Op de huidige data leest die regel "geen meetbare turns beantwoord · 0 geweigerd · 0 verduidelijkt"; zodra er geclassificeerde turns zijn, krijgt de oefenagent een echte weigerkolom | `components/fund/overview.tsx:157-172`, `:249-251`; DB: rij met `agent_id='roleplay'` in `fund_oomt.interaction_events` | bevestigd | **blokkerend** |
| F-37 | S11a | Geen tweede rij tegels, geen uitklap | Eén tegel, daarna tabellen; geen `details`/`Accordion` op het Overzicht | `components/fund/overview.tsx:85-135` | weerlegd | — |
| F-38 | S11 | Actualiteit klikt door naar het gesprek | Elke recente regel linkt naar de **lijst** `/gesprekken`, niet naar de permalink, omdat `InteractionLogRow` geen id heeft | `packages/analytics/src/kpi.ts:190-195`; `components/fund/overview.tsx:211` | bevestigd | afwijking |

### A4 · Gesprekken

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-39 | S16 | Eén fondsbrede lijst met filters op agent, uitkomst, reden en periode | Alle vier aanwezig, één lijst, fondsbreed | `apps/dashboard/lib/conversations.ts:20-45`; `components/fund/conversation-filters.tsx:27-65` | weerlegd | — |
| F-40 | S16 | Filterstand in de URL, niet in client-state | Plain `<form method="get">`, server-gerenderd uit `searchParams`; geen client-component in het filterpad. Herlaad-veilig door constructie | `components/fund/conversation-filters.tsx:27`; `app/(fund)/gesprekken/page.tsx` | weerlegd | — |
| F-41 | S16 | Tellingen bij de filters = analyticslaag | Het scherm zet ze zelf naast elkaar. Gemeten (`fund_oomt`, 30d, geen filter): lijst 119 grounded + 16 sessies = **"135 gesprekken"** in de kop; `getOutcomeBreakdown` voor hetzelfde venster = **119** en het scherm meldt "Overzicht telt 119 voor dit filter … klopt". Beide getallen kloppen met de code; de 135 bevat de dubbeltelling van F-42 | `components/fund/conversations.tsx:26`, `:41`, `:46-51`; DB-queries op `fund_oomt` | bevestigd | zie F-42 |
| F-42 | **S15/S16** | Een oefensessie rendert als sessie en niet als vraag-antwoordpaar | De rollenspelagent schrijft **ook** naar `interaction_events`. Zonder agentfilter selecteert `loadGrounded` álle events, dus die rij rendert als `GroundedCard` met uitkomstchip **én** de bijhorende sessie rendert als `ExerciseCard`. Dezelfde activiteit staat tweemaal in de lijst en tweemaal in het totaal (`groundedTotal + exerciseTotal`). Gemeten in `fund_oomt`: 1 `roleplay`-event naast 16 sessies | `packages/analytics/src/conversations.ts:109`, `:131`, `:153`; `components/fund/conversations.tsx:26`; DB: 1 rij `agent_id='roleplay'` | bevestigd | **blokkerend** |
| F-43 | S15 | De keuze sessie-vs-paar volgt uit het profieltype | Volgt uit `isGroundedAgentKey`, dus uit een **lijst met sleutels**, niet uit een profielveld op de agent. Een nieuwe agent die niet in `GROUNDED_AGENT_KEYS` staat wordt stil als oefenagent behandeld | `packages/shared/src/config/agent-keys.ts` (`GROUNDED_AGENT_KEYS`, `isGroundedAgentKey`); `packages/analytics/src/conversations.ts:109`, `:118` | bevestigd | open eind |
| F-44 | S16 | Permalink is stabiel | `conversationPermalink` bouwt `<basis>/<id>` en laat filters/periode weg; `getConversation` zoekt op id zonder venster | `apps/dashboard/lib/conversations.ts:116-119`; `packages/analytics/src/conversations.ts:315-330`; test `lib/signals.test.ts:19-28` | weerlegd | — |
| F-45 | S16 | Geen tweede gesprekkenlijst op de agentpagina | Agentpagina linkt met voorgevuld filter (`?agent=<key>`) naar de fondslijst | `components/fund/agent-overview-panel.tsx:60-62`; `app/(admin)/…/agents/[agentKey]/page.tsx:22` | weerlegd | — |

### A5 · Agentpagina

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-46 | S13 | Precies drie tabs; middelste Corpus of Scenario's naar profieltype | Precies drie; middelste via `isGroundedAgentKey` | `apps/dashboard/lib/agent-tabs.ts:16-25` | weerlegd | — |
| F-47 | **D3** | Geen `switch`/`if` op een agentsleutel in de rendering | In de renderpaden van de agentpagina niet aangetroffen (gezocht op `"cao"`, `"arbo"`, `"roleplay"` in `apps/dashboard/app` en `components`). **Wel** in twee formulieren: sleutelvergelijking in de JSX van het fondsaanmaakformulier, en `"roleplay"` hardgecodeerd in verborgen velden | `app/(admin)/admin/funds/create-form.tsx:14-15`, `:104`; `app/(admin)/…/lti/lti-forms.tsx:18`, `:72`, `:102`; `…/scenarios/scenario-form.tsx:69` | bevestigd | afwijking |
| F-48 | S15 | Oefenagent: geen citatie-/weigerkolom, geen lege corpus-tab | Op de agentpagina correct: de corpus-route geeft `notFound()` voor een niet-grounded agent en het overzichtspaneel laat de uitkomstsplitsing weg | `app/(fund)/agents/[agentKey]/corpus/page.tsx:19`; `components/fund/agent-overview-panel.tsx:99-109` | weerlegd | — |
| F-49 | **S14** | Geen drempelwaarde uit de gatedefinitie op de fondspagina, ook niet als leestekst | Niet aangetroffen. Gezocht op `drempel`, `threshold`, `minimum`, `%`, `0.`, `gate` in `app/(fund)`, `app/(admin)/…/(fund-console)` en `components/fund`. De enige numerieke drempel in de dashboardcode is de ops-foutratio `0.2` op de adminoverzichten, die niet uit de gatedefinitie komt | `components/fund/agent-corpus-panel.tsx` (volledig gelezen); `app/(admin)/admin/page.tsx:26-29` | weerlegd | — |
| F-50 | **S14** | Fondspagina toont uitslag, **datum**, corpusversie en **artefactlink** van de poort | Uitslag is permanent `null` (`manifest.stub === true`), en datum + artefactlink zijn **hardgecodeerd op `null`** in de paneelcode. Drie van de vier velden staan er dus als "n.n.b." en kunnen niets anders worden | `components/fund/agent-corpus-panel.tsx:27`, `:28`, `:29`; `lib/release-manifest.ts:36`, `:73` | bevestigd | open eind |
| F-51 | S13/S14 | Goedkeuring en gate-uitslag verwijzen aantoonbaar naar dezelfde corpusversie | Ze delen aantoonbaar één veld, en de versie **loopt mee** in de actie: `pinCorpusAction` leidt de versie server-side opnieuw af en weigert bij afwijking. Impliciet "de laatste" is het dus niet | `lib/agent-profile.ts:26-53`; `app/(admin)/…/agents/[agentKey]/actions.ts:163-167` | weerlegd | — |
| F-52 | S13/S14 | Die versie is de versie die de poort beoordeelde | Die gedeelde waarde is `corpusVersionLabel(documentVersions)` = **de eerste niet-lege documentversie**, niet de door de poort beoordeelde versie. "Gate en goedkeuring zijn eens" is daarmee waar over een waarde die zelf willekeurig is | `lib/agent-profile.ts:40-53`; `lib/overview.ts:32-35` | bevestigd | afwijking |
| F-53 | S5 | Sleutelrotatie in een eigen, afgezet blok met bevestiging | Eigen kaart, en de server eist dat de agentsleutel wordt ingetypt voordat er geroteerd wordt | `components/fund/agent-publication.tsx:79-93`; `app/(admin)/…/actions.ts:43-57` | weerlegd | — |

### A6 · Signalen

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-54 | **S18** | Aggregatiedrempel in de querylaag | `SIGNAL_MIN_OCCURRENCES = 3` in `packages/analytics/src/signals.ts:27`, toegepast als `.having(count(*) >= 3)` op regel `:217`. De UI importeert de constante alleen om hem te benoemen | `packages/analytics/src/signals.ts:27`, `:217`; `components/fund/signals.tsx:36` | weerlegd | — |
| F-55 | S18 | Drempel niet te omzeilen door te versmallen | Door constructie: filters zitten in de `WHERE` (`windowParts` + `strengthParts`), de drempel in de `HAVING` na `GROUP BY question`. Versmallen verlaagt de groepsgrootte en laat groepen dus wegvallen, niet uiteenvallen. **Empirisch niet getest** — zie slotsectie: geen enkel fonds heeft een rij met `outcome_reason`, en het thema-filter is niet bereikbaar | `packages/analytics/src/signals.ts:214-217` | bevestigd via lezen; empirisch niet vast te stellen | — |
| F-56 | S18 | Filteren op agent + periode + onderwerp is mogelijk | Het **thema-filter bestaat niet in de UI** (alleen `period` en `agent`), en de kolom `theme` wordt nergens gevuld (geen classifier) — DB: alle 227 rijen `theme IS NULL`. De gevraagde filtercombinatie is dus niet uit te voeren | `apps/dashboard/lib/signals.ts:4-7`; `packages/db/src/schema/fund/interaction-events.ts:42-43`; `packages/analytics/src/kpi.ts:185` | bevestigd | open eind |
| F-57 | **S19** | Geen gegenereerde labels of samenvattingen | Elke regel is de letterlijke `question`; gezocht op `summariz`, `cluster`, `generateTheme`, `openai` in het signalenpad — geen treffers | `packages/analytics/src/signals.ts:160`, `:215`; `components/fund/signals.tsx` | weerlegd | — |
| F-58 | S19 | Elke regel doorklikbaar naar het gesprek | Elke vraagregel linkt via `conversationPermalink` naar `latestEventId` | `components/fund/signals.tsx` (`conversationPermalink(gesprekkenPath, row.latestEventId)`) | weerlegd | — |
| F-59 | **S17** | Rollenspelinput niet in de kennisgatlijst; adoptie in eigen blok | Kennisgaten komen uit `interaction_events`, adoptie uit een aparte `roleplay_sessions`-aggregatie in een eigen blok. **Randgeval**: omdat de rollenspelagent naar `interaction_events` schrijft (F-42), kan een rollenspelvraag bij ≥ 3 herhalingen in de kennisgatlijst belanden zolang er geen agentfilter staat | `packages/analytics/src/signals.ts:226-241`, `:264-273`; `components/fund/signals.tsx:62` | bevestigd (blok correct, randgeval reëel) | afwijking |
| F-60 | S21 | Werkvoorraad fondsbreed, niet per agent verspreid | Eén fondsbrede lijst; de agentpagina heeft geen eigen signalenlijst | `app/(fund)/signalen/page.tsx`; `components/fund/agent-overview-panel.tsx` | weerlegd | — |

### A7 · Opruimen

| # | Besluit | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-61 | PR-7 | Geen route meer die naar een verwijderd scherm wijst | Geen links naar oude paden; de zes oude paden zijn redirects. Een statische test controleert dit | `lib/write-actions.test.ts:100-114`; `rg "branding\|/manage\|/texts\|/distribution\|/lti"` in `components` → alleen redirectbestanden | weerlegd | — |
| F-62 | S2 (checklist: S3) | `/admin/embed` bestaat niet meer | Het bestand bestaat nog, maar bevat alleen `permanentRedirect("/admin/funds")`. Geen scherm, geen dood ingangspunt | `app/(admin)/admin/embed/page.tsx:5` | bevestigd, conform intentie | — |
| F-63 | **S5** | Elk gedeeld paneel bestaat één keer, `canWrite` als verschil | Panelen staan één keer in `components/fund/*` en worden door beide schillen gebruikt. Geen bijna-dubbele componentnamen (gezocht op `AdminSettings`, `FundSettings`, `*Panel`, `*View`) | `components/fund/settings.tsx`, `overview.tsx`, `conversations.tsx`, `signals.tsx`, `agent-*.tsx` | weerlegd | — |
| F-64 | 200-architecture (pijlregel) | Gedeelde componenten hangen niet aan route-mappen | Drie gedeelde componenten importeren hun formulieren uit `app/(admin)/…`-routemappen; de fondsschil hangt daarmee aan adminroutes | `components/fund/settings.tsx:9`; `components/fund/agent-publication.tsx:4-6`; `components/fund/approve-corpus-form.tsx:5` | bevestigd | afwijking |

### Deel B · Huisstandaarden

| # | Standaard | Verwacht | Aangetroffen | Bewijs (pad:regel) | Status | Zwaarte |
|---|---|---|---|---|---|---|
| F-65 | Autorisatie op de server | Elke schrijfactie weigert server-side | **Zelf gelezen** in alle actionbestanden: `await assertAdmin()` is de eerste await in elke action (agent: `:47`, `:77`, `:101`, `:145`; fonds, scenario's, branding, lti idem). De dump-route weigert met 403 via `decideAccess` — **zelf gelezen**, niet afgeleid | `app/(admin)/…/agents/[agentKey]/actions.ts:47`, `:77`, `:101`, `:145`; `app/(admin)/admin/funds/[fundKey]/export/route.ts:27-30`; `lib/assert-admin.ts` | weerlegd | — |
| F-66 | S7 vocabulaire (fonds, agent, sleutel) | Geen `tenant`, `instance`, `embed` in zichtbare tekst | Vier zichtbare treffers: "Tenant-key (eenmalig in dit scherm)", "Tenant-keys per agent", "Embed-keys stoppen met resolven", "Nog geen agent-instances." (2×). Deze schermen zijn door PR-7 ín het gedeelde Instellingen-paneel getrokken | `app/(admin)/admin/funds/[fundKey]/manage-forms.tsx:98`, `:219`; `app/(admin)/admin/funds/create-form.tsx:52`, `:89`; `app/(fund)/agents/page.tsx:21`; `app/(admin)/…/(fund-console)/agents/page.tsx:33` | bevestigd | afwijking |
| F-67 | Taalsplitsing | Nederlands in de UI | Ruwe Engelse enumwaarden worden als chip gerenderd: `{row.status}` → "active"/"inactive", `{user.role}` → "fund"/"admin" | `app/(fund)/agents/page.tsx:42`; `app/(admin)/…/(fund-console)/agents/page.tsx:55`; `components/fund/settings.tsx:99` | bevestigd | afwijking |
| F-68 | Eén definitie per begrip | Geen tweede definities die via de leeslaag terugkomen | Vijf gevallen, alle vijf via de leeslaag: statuslogica 3× (F-12, F-14), beantwoordingsgraad 2× (F-13), retrieval-sterkte 4× (F-18), "totaal turns" 2× (F-16b), "wie is admin" 2× (F-07) | zie F-07, F-12, F-13, F-14, F-16b, F-18 | bevestigd | afwijking |
| F-69 | Lege staten | Overal waar data kan ontbreken, met vervolgstap | Aanwezig en met vervolgstap op Overzicht (onboarding), agents ("Nog geen agents op dit fonds"), Gesprekken ("Geen gesprekken in deze selectie"), Acties, Signalen, corpus | `components/fund/overview.tsx:66-83`, `:102`, `:143`, `:236`; `components/fund/conversations.tsx:57` | weerlegd | — |
| F-70 | Foutstaten | Bestaan overal waar data kan ontbreken | **Er is geen enkele foutgrens in de dashboardapp**: `find app -name "error.tsx" -o -name "global-error.tsx" -o -name "not-found.tsx"` → leeg. Reëel gevolg: `fund_testfonds` mist `outcome_reason` (migratie `0003` niet toegepast; DB gecontroleerd), dus Overzicht/Gesprekken/Signalen van dat fonds gooien een SQL-fout i.p.v. een lege staat — en de admin kan er via "Bekijken" in de fondsenlijst zo naartoe | `find` (leeg); DB: `information_schema.columns` voor `fund_testfonds.interaction_events` → geen `outcome_reason`; de query die hem gebruikt: `packages/analytics/src/outcomes.ts:145-152`; de ingang: `app/(admin)/admin/funds/page.tsx:157-165` ("Bekijken" op een gedeactiveerd fonds) | bevestigd | **blokkerend** |
| F-71 | Toegankelijkheid: `aria-current` | Op actieve navigatie | Aanwezig op sidebar, agenttabs en periodekiezer | `components/chrome/dashboard-sidebar.tsx:119`; `components/fund/agent-tab-nav.tsx`; `components/fund/period-picker.tsx` | weerlegd | — |
| F-72 | Toegankelijkheid: zichtbare focus | Op alle interactieve elementen | `Button` en `Select` hebben een focus-ring; **`navPillClassName` en de sidebarlinks hebben geen enkele `focus`-klasse**, en er is geen globale `:focus-visible`-regel (gezocht op `focus-visible` en `:focus` in `packages/ui/src/styles.css`, `apps/dashboard/app/globals.css`). Sidebar, agenttabs en periodekiezer zijn dus toetsenbord-onzichtbaar | `packages/ui/src/primitives/nav-pills.tsx:57-63` (geen focus-klasse); `components/chrome/dashboard-sidebar.tsx:121-125` | bevestigd | afwijking |
| F-73 | Betekenis niet alleen door kleur | Uitkomstverdeling ook zonder kleur leesbaar | Uitkomsten staan als tekst (`"x% beantwoord · n geweigerd · n verduidelijkt"`) en chips dragen hun label als tekst | `components/fund/overview.tsx:249-251`; `components/fund/overview.tsx:253-265` | weerlegd | — |
| F-74 | Geen fixture-groen | Toegevoegde tests draaien op echte querypaden | **Tien** van de toegevoegde testbestanden asserteren op **broncodetekst** via `readFileSync` + regex (o.a. "de drempel staat in analytics" en "de `measurementStartedAt`-query gebruikt `min(occurred_at)`"). **Nul** van de nieuwe tests voert `getOutcomeBreakdown`, `listConversations` of `listSignals` uit; de overige tests draaien op handgemaakte objecten. De enige test die een echt querypad raakt, is rood (F-75), en de enige test die echte routes zou controleren wordt geskipt (`DASHBOARD_ORIGIN` niet gezet) | `rg -l readFileSync` → `lib/agent-tabs.test.ts`, `lib/fund-nav.test.ts`, `lib/conversations.test.ts`, `lib/settings.test.ts`, `lib/signals.test.ts`, `lib/overview-d6.test.ts`, `lib/write-actions.test.ts`, `packages/analytics/src/{conversations,signals,outcomes}.test.ts`; voorbeelden: `lib/signals.test.ts:57-63`, `packages/analytics/src/outcomes.test.ts:56-58` | bevestigd | afwijking |
| F-75 | Groene gates | `test:unit` groen | `packages/analytics/src/fund-environment.integration.test.ts` faalt reproduceerbaar (3× gedraaid): na twee `recordInteractionEvent`-aanroepen met `answeredGrounded()` telt `getKpiSummary` die 2 rijen wél, maar `measurementStartedAt(fundKey)` retourneert `null` i.p.v. een `Date`. Oorzaak niet vastgesteld — zie slotsectie | `packages/analytics/src/fund-environment.integration.test.ts:112-113` | bevestigd (falen), oorzaak niet vast te stellen | **blokkerend** |
| F-76 | Testhygiëne | Een test ruimt zijn eigen sporen op | Dezelfde suite dropt het schema en de `control.funds`-rij, maar **niet** de rijen in `control.agent_instances`. Die blijven staan als weesrijen met een `tenant_id` zonder fonds. Bij mijn drie runs zijn er zo rijen bijgekomen; ik heb ze **niet** opgeruimd (audit = niets wijzigen) | DB: `select tenant_id from control.agent_instances where tenant_id like 'gate-proef-%'`; `fund-environment.integration.test.ts` (after-hook) | bevestigd | open eind |

---

## §1 · Herleiding van elk getal op het Overzicht (getal → functie → bestand)

| Getal op het scherm | Functie | Bestand |
|---|---|---|
| Tegel "Gesprekken" | `totalTurns(byOutcome)` op `getOutcomeBreakdown` | `lib/overview.ts:9` ← `lib/overview-load.ts:58` ← `packages/analytics/src/outcomes.ts:139-175` |
| "Vorige <periode>: n" | idem, `prevWindow` | `lib/overview-load.ts:59` |
| Mix per agent — gesprekken | `getOutcomeBreakdown({ agentId })` | `lib/overview-load.ts:69` |
| Status — uitkomstregel per agent | `answerRate` + `byOutcome` | `packages/analytics/src/outcomes.ts:89-97`; render `components/fund/overview.tsx:249-251` |
| Status — "Laatste" | `getRecentInteractions({ agentId, since }, 1)` | `lib/overview-load.ts:70` ← `packages/analytics/src/kpi.ts:198-203` |
| Status — "Corpus" | `corpusVersionLabel(getCorpusOverview(fundKey).documentVersions)` | `lib/overview.ts:32-35` ← `lib/overview-load.ts:62` — **fondsbreed, niet per agent (F-26)** |
| Status — badge per agent / fonds | `deriveAgentStatus` / `deriveFundStatus` | `packages/analytics/src/outcomes.ts:206-223` ← `lib/overview.ts:26-30` |
| Meetdatum-melding | `measurementStartedAt` | `packages/analytics/src/outcomes.ts:195-203` ← `lib/overview-load.ts:60` |
| Actualiteit — 8 rijen | `getRecentInteractions({ since }, 8)` | `lib/overview-load.ts:63` — **venster zonder `until` (F-27)**, **geen id → geen permalink (F-38)** |
| Acties — "N kennisgaten" | `refusedJustifiedRate(refusedByStrength).numerator` | `packages/analytics/src/outcomes.ts:110-113` — **label dekt het getal niet (F-35)** |

Elk getal is herleidbaar. Twee zijn herleidbaar tot een functie die iets anders meet dan het label
zegt (F-26, F-35).

## §2 · Gemeten DB-stand (grondslag onder F-26, F-29, F-41, F-42, F-56, F-70)

| Fonds | events | rijen met `outcome_reason` | `theme` gevuld | agent-instances | bijzonderheid |
|---|---|---|---|---|---|
| `oomt` | 119 | 0 | 0 | 3 (cao, arbo, roleplay) | 1 event van `roleplay` → dubbeltelling F-42 |
| `elektronische-detailhandel` | 103 (23 in 30d) | 0 | 0 | **0** | badge "Nog niet live" op live fonds (F-29) |
| `demo` | 5 | 0 | 0 | 1 | — |
| `eval-fixtures` | 0 | 0 | 0 | 1 | — |
| `testfonds` | n.v.t. | **kolom bestaat niet** | — | 0 | migratie `0003` ontbreekt → SQL-fout (F-70) |

Alle 227 bestaande rijen hebben `outcome = 'unknown'` en `outcome_reason IS NULL`. Daarom staat op
**elk** scherm nu "Meting nog niet gestart", zijn alle uitkomstsplitsingen leeg, en is Signalen
fondsbreed leeg.

---

## Tabel 2 — open eindjes

| # | Wat is besloten | Wat staat er | Wat het raakt | Kleinste stap om het te sluiten |
|---|---|---|---|---|
| O-1 | Rollenspelagent hoort bij het fonds (instance + scenario's) én bij de LMS-kant (leerling-UI) | **Beide, en niet afgebakend.** Fondskant: instance in `control.agent_instances`, scenario's + LTI-tab in de fondsconsole, `roleplay_sessions` in het fondsschema. LMS-kant: eigen app `apps/roleplay`, LTI 1.1. Maar hij schrijft óók naar `interaction_events` alsof hij een grounded agent is, en dát is de bron van F-36, F-42 en het randgeval in F-59 | Overzicht, Gesprekken, Signalen | Beslis of oefen-turns in `interaction_events` thuishoren. Zo niet: filter oefenagents uit `loadGrounded`/`loadQuestionSignals`. Zo wel: markeer ze en sluit ze uit van uitkomstsplitsingen |
| O-2 | Profieltype bepaalt tabs en rendering (D3, S15) | Feitelijk **twee** types, en ze staan niet op de agent maar in een sleutellijst: `GROUNDED_AGENT_KEYS` in `packages/shared/src/config/agent-keys.ts`. Een agent zonder vermelding valt stil terug op "oefenagent": Scenario's-tab, geen corpus-tab, geen uitkomstsplitsing | Agentpagina, Gesprekken, Signalen | Zet het profieltype als expliciet veld op de agentdefinitie en laat `isGroundedAgentKey` dat lezen; faal hard op een onbekende agent i.p.v. terugvallen |
| O-3 | Rijen van vóór PR-A2 tellen mee in volume, niet in splitsingen (D6) | Dat werkt zoals bedoeld — en het is nu de **enige** stand die bestaat: alle 227 rijen zijn `unknown`. Zichtbaar gevolg: Activiteit toont echte volumes, Status toont "geen meetbare turns" (want `unknown` valt buiten `qualityDenominator`), Acties en Signalen zijn leeg, overal "Meting nog niet gestart" | Alle vier de Overzicht-blokken | Niets in de leeslaag. Wel: één fonds met geclassificeerde turns is nodig om F-41, F-55 en F-75 empirisch te kunnen controleren |
| O-4 | Fonds zonder agents / agent zonder corpus zijn normale onboardingstanden | Fonds zonder agents: lege staat mét vervolgstap, **maar** de fondsbadge zegt dan "Nog niet live" ook bij live verkeer (F-29). Agent zonder corpus: corpuspaneel toont "n.n.b." en het goedkeurformulier is dan niet aanroepbaar (`decision.corpusVersion === null`) | Overzicht, agentpagina | Leid de fondsstatus af uit events wanneer er geen instances zijn, of onderscheid "geen agents geconfigureerd" van "offline" |
| O-5 | Schaal is niet besloten | Overzicht doet **2 queries per agent** bovenop 5 vaste queries, ongebounded parallel (`Promise.all`); bij 4 agents zijn dat 13 gelijktijdige transacties op een pool van 3 (dev) / 10 (prod). Gesprekken heeft een harde `limit 50` **zonder paginering en zonder "er zijn meer"-melding**; bij 10.000 rijen zie je 50 en niets wat dat zegt | Overzicht, Gesprekken | Gesprekken: cursor-paginering of minimaal een "meer dan 50 — versmal je filter"-regel. Overzicht: één query met `group by agent_id` i.p.v. N× |
| O-6 | Clustering, visuele lagen, analytics-agent, kwartaalexport zijn bewust niet gebouwd | Twee halve beginnen liggen stil: (a) de kolom `theme` bestaat, wordt nooit gevuld, en `getTopThemes` retourneert daardom altijd `[]` — plus een thema-filter in `SignalsQuery` dat de UI niet aanbiedt; (b) `packages/analytics/src/kpi.ts` bevat een oudere KPI-laag (`getKpiSummary`, `getUnansweredQuestions`, `answeredWithCitationsRate`) die de S18-drempel niet kent en nog door de adminoverzichten wordt gebruikt (F-13) | Signalen, adminoverzichten | Markeer `theme`/`getTopThemes` expliciet als "dood tot clustering", en zet de adminoverzichten op `getOutcomeBreakdown` zodat de oude laag kan verdwijnen |
| O-7 | Gate-uitslag hoort op de fondspagina (S14) | `release-manifest.ts` is een stub (`stub: true`), en datum + artefactlink zijn hardgecodeerd `null` (F-50). De poortsectie kan dus nooit iets anders tonen dan "n.n.b." | Agentpagina, corpus-tab | Manifestbron aansluiten of de sectie tot die tijd verbergen i.p.v. drie lege velden tonen |
| O-8 | Integratietest hoort schoon af te sluiten | `control.agent_instances` wordt niet opgeruimd; weesrijen `gate-proef-*` blijven staan (F-76). Ze zijn op de schermen onzichtbaar omdat er geen fonds bij hoort, dus de schade is administratief | Control plane, testhygiëne | `delete from control.agent_instances where tenant_id = <fundKey>` in de after-hook; bestaande weesrijen apart opruimen |
| O-9 | Buiten scope, wel opgeschreven | (a) `top_score` float4-vs-float8-drift (F-22); (b) `interaction_events.theme` staat in het schema zonder schrijver; (c) de fondskant heeft geen redirectlijst voor oude paden (F-10); (d) gedeelde componenten importeren uit `app/(admin)/…` (F-64) | Migraties, pijlregel | Per punt een eigen kleine PR; geen van deze raakt de leeslaag-besluiten |

---

## Slotsectie — wat ik niet heb kunnen vaststellen

Deze sectie is niet leeg. Vijf punten.

1. **De oorzaak van de rode integratietest (F-75).** Vastgesteld: de test faalt reproduceerbaar op
   `assert.ok(started instanceof Date)` (`fund-environment.integration.test.ts:113`), terwijl
   `getKpiSummary` in dezelfde test de 2 net geschreven rijen wél telt. Uitgesloten door meting:
   het niet-parsen van `timestamptz` door postgres.js (eigen leesprobe gaf een echte `Date`, ook in
   `.values()`-modus); een terugval naar `public.interaction_events` (die tabel bestaat niet); een
   ontbrekende `outcome_reason` in verse schema's (`fund-ddl.ts` maakt de kolom aan en de ledger
   registreert `0003`); caching in `withSearchPath` (geen); een stale `dist` van `@wunderstack/db`
   (het package exporteert `src/`). Ook uitgesloten: dat de rijen in een ander fondsschema landden —
   geen van de vier bestaande schema's bevat rijen van dit testfonds. **Wat ik nodig had:** één
   geïnstrumenteerde run die `started` en `select outcome, outcome_reason` uit het wegwerpschema
   afdrukt vóór de after-hook. Dat vereist het testbestand aanpassen, wat deze audit verbiedt. Ik
   heb ook een schrijfprobe via `recordInteractionEvent` naar het lege `eval-fixtures`-fonds
   overwogen en **niet uitgevoerd**, omdat dat de database muteert.
2. **Of de filtertellingen in Gesprekken kloppen voor de interessante filters (F-41).** Voor het
   ongefilterde geval heb ik beide getallen gemeten (119 vs. 119, plus de 135 uit F-42). Voor
   `uitkomst=refused` of `reden=…` kan ik niets meten: alle 227 rijen zijn `unknown`, dus elk zinnig
   filter geeft 0 tegen 0. **Nodig:** één fonds met geclassificeerde turns.
3. **De S18-versmallingstest empirisch (F-55).** Ik heb de SQL gelezen en de drempelmechaniek
   bevestigd, maar de gevraagde combinatie *één agent + korte periode + één onderwerp* is niet
   uitvoerbaar: het thema-filter zit niet in de UI en `theme` is nergens gevuld (F-56). De uitkomst
   is nu voor elk filter leeg, dus een lege lijst bewijst hier niets. **Nodig:** een thema-filter en
   ≥ 3 gelijke geweigerde vragen in één slice.
4. **De exacte formulering van S9–S21 en D1–D9.** `DECISION-dashboard-indeling.md` en
   `IMPLEMENTATIEPROMPT-dashboard-indeling.md` staan niet in de repo (§0). Ik heb tegen de
   teruggehaalde prompttekst uit het implementatietranscript gemeten. Waar mijn interpretatie de
   zwaarte bepaalt, staat dat in de bevinding (nadrukkelijk bij F-06 en F-35). **Nodig:** de
   besluitdocumenten in de repo.
5. **Runtime-gedrag van de schermen.** Ik heb geen dev-server gestart en geen pagina opgevraagd; alle
   schermbevindingen komen uit code plus DB-queries. De routetest die echte HTTP-statussen zou
   controleren wordt geskipt omdat `DASHBOARD_ORIGIN` niet is gezet. F-70 (SQL-fout op `testfonds`)
   is daarmee vastgesteld uit de ontbrekende kolom plus de query die hem gebruikt, **niet** uit een
   waargenomen 500. **Nodig:** één run met `DASHBOARD_ORIGIN` gezet.

### Wat ik tijdens deze audit wél heb aangeraakt

Geen code, geen tests, geen drempels. Wel: `pnpm turbo typecheck` en de unit-suites gedraaid, en de
analytics-**integratie**suite driemaal — die provisioneert een wegwerpfonds en laat weesrijen achter
in `control.agent_instances` (F-76). Die rijen heb ik laten staan. Verder alleen lezende SQL tegen
de bestaande fondsschema's.
