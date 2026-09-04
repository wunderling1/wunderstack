# PLAN — Q4-gereedheid

**Status:** sturend vanaf 4 september 2026.
**Doel:** één agent live voor één echt fonds in Q4, op een basis die standhoudt.
**Richtdatum:** oktober 2026 (Q1). Eerste fonds: OOMT (Q2).
**Eigenaar:** Jordy.

Vervangt de fasering uit `docs/audit/RUBRIC-externe-review.md` als rangschikking.
De rubric blijft de meetlat voor codekwaliteit; hij sorteert het werk niet meer.
De externe beoordelaar was een denkraam. Dat raam heeft de verticale doorsnede,
de begrippenlijst en de beloftes-zonder-test opgeleverd. Het sorteert op wat een
lezer in twee dagen opvalt, en dat is niet hetzelfde als wat een systeem in
productie overeind houdt.

---

## Meetlat

**Primaire as is operationeel risico**, niet reviewerindruk.

| Veld | Waarden | Betekenis |
|---|---|---|
| `risico` | `hoog` / `midden` / `laag` | Kans × schade voor een draaiend fonds. **Sorteert.** |
| `ernst` | `blokkerend` / `zwaar` / `licht` | Wat een lezer ervan vindt. Informatief. |

De weegregel (max drie blokkerend, max een derde zwaar) vervalt als sturing. Die
bestond om te voorkomen dat alles zwaar werd op een as die indruk mat. Op een
risico-as is een plafond schadelijk.

---

## Drie sporen

Geen rechte lijn. Deels parallel.

### Spoor 1 — Uitrolbaarheid (langste pad, begin hier)

Alles draait lokaal. Daardoor staan vier dingen die als `gebouwd` geclassificeerd
waren feitelijk `ontworpen`:

| Wat | Waarom `ontworpen` |
|---|---|
| Vlootmodel — één instance per fonds, gepind op releasetags | Code en ADR bestaan; er draait één gedeelde Scalingo-app (`wunderstack`), `TENANT` unset |
| `docs/runbooks/*` | Geschreven, nooit uitgevoerd tegenover een echte uitrol |
| Provisioneringsketen — `createFundEnvironment` en de migratieledger | Buiten de testomgeving niet bewezen |
| Analytics-laag | 191 events in `fund_oomt` uit een lokaal proces (`tenant_id=oomt`); nul echte gebruikersbeurten. De Scalingo-app heeft `CAO_FUNDS=elektronische-detailhandel,demo` |

Correctie op de fase-0-audit: `docs/audit/AUDIT-fase-0-repo-2026-09-04.md`,
addendum 2026-09-04.

**De ingreep is één keer echt uitrollen.** Eén fonds, op Scalingo, via het
runbook, door de stappen te volgen in plaats van te improviseren. Wat daar
stukgaat, is de klasse fouten die geen codeaudit vindt: env-drift tussen repo en
app, migratievolgorde, koude start, timeouts, gedrag bij de eerste vraag buiten
het corpus, en of `TENANT` überhaupt gezet wordt.

Uitrolvorm: **vlootmodel, één instance** (Q3). De huidige gedeelde app is nooit
als besluit vastgelegd; die vorm vasthouden zou alsnog een ADR vragen.

Dit maakt en passant de vier rijen hierboven waar, of het toont waar ze falen.

### Spoor 2 — Klantgereedheid buiten de code

Niet zichtbaar in de repo, dus in geen auditfase. Voor een O&O-fonds kijkt een
privacyfunctionaris en vaak een OR mee vóór er getekend wordt.

Wat er moet liggen vóór het eerste contract:

- **Verwerkersovereenkomst**, met een subverwerkerslijst die klopt: Mistral,
  Scaleway, Scalingo, Langfuse. Per subverwerker: wat gaat erheen, waar staat
  het, op welke grondslag.
- **Bewaartermijn die waargemaakt wordt.** `interaction_events` bevat vragen van
  werknemers over hun arbeidsvoorwaarden. De negentigdagenclaim (F1-06) is een
  commentaar op een kolom, zonder job en zonder test. In de audit `licht`; in
  een inkooptraject een belofte die je niet kunt aantonen. **`risico: hoog`.**
- **AI Act artikel 50** — transparantie richting de eindgebruiker. De eis is
  bekend; de vraag is waar het bewijs ligt dat de widget eraan voldoet.
- **Datalocatie en soevereiniteit** als document, niet als codecommentaar.
  F1-13 hoort hier: de guard die `sovereign: false` weigert, is nooit
  uitgeoefend. Een claim zonder uitgeoefende controle is geen controle.
- **Incident- en supportpad.** Wie belt het fonds als de agent verkeerde
  antwoorden geeft, en binnen welke termijn gebeurt er wat.

Geen codewerk. Kan naast spoor 1.

### Spoor 3 — Code-audit, herwogen

Fase 2 t/m 4 blijven zinvol, niet in de oorspronkelijke vorm en niet vooraan.

- **Fase 2 (`apps/runtime`)** — waardevol, ná spoor 1. Oppervlak dat een fonds
  raakt. Open uit de fase-1-bijlage: wie vult `AgentQuestion.fund`; of de
  analytics-schrijver dezelfde string gebruikt; of `didPass` het model-oordeel
  overrulet. Herwegen op de risico-as. Niet ervoor: een audit van code die de
  uitrol alsnog verandert, is deels weggegooid.
- **Fase 3 (`apps/dashboard`)** — wacht. Intern; een verkeerd getal kost geen
  klantvertrouwen op dag één.
- **Fase 4** (playground, marketing, roleplay) — na go-live.

---

## Wat uit fase 0 en 1 blijft staan

Herwogen op operationeel risico. `ernst` uit de audit blijft informatief.

**Hoog risico, vóór go-live**

| Id | Wat |
|---|---|
| F1-06 | Bewaartermijn waarmaken of de claim schrappen. Contractueel, niet licht. |
| F1-01 | Eén canonieke schemafunctie plus identiteitstest. Tak A bevestigd (2026-09-04): geen incident. Het tweede fonds is het moment waarop drie verhalen over één string duur worden. |
| F0-04 | Evalsuite die `PASSED` afdrukt terwijl G2/G3 skippen. Een groen scherm dat niets bewijst. |
| F1-13 | Soevereiniteitsguard uitoefenen met één unit-test. |
| F1-04 | Theme-validatie op de leesroute. Wit-label is fonds twee tot en met vijf. |

**Midden, meenemen als het uitkomt:** F1-03, F1-08, F1-02, F0-13 (bearer in
`.env.example`), F0-03 (commando-oppervlak).

**Laag, na go-live:** README, documentdrift, `claude/`-index, F1-05, F1-09 t/m
F1-12, F1-14. Ze worden niet minder waar; ze worden minder dringend.

De omkering t.o.v. de reviewvolgorde is bewust: README en documentdrift stonden
bovenaan en zakken nu.

Inventaris van ids: `docs/audit/BACKLOG-remediatie-voor-review.md` (niet meer
sturend).

---

## Volgorde

1. Spoor 2 starten (loopt lang, hangt niet van code af).
2. Eén fonds uitrollen — spoor 1 (OOMT, vlootmodel, runbook volgen).
3. Wat daar stukgaat repareren; de vier classificaties (`ontworpen` → `gebouwd`
   of een eerlijke rest) corrigeren.
4. Fase 2 (`apps/runtime`), herwogen op risico.
5. De hoog-risicolijst hierboven (voor zover spoor 1 en 2 die niet al hebben
   afgedwongen).
6. Fase 3 en 4, en het reviewgerichte werk, na go-live.

---

## Besluiten

Defaults bij zwijgen; hier vastgelegd.

| # | Vraag | Besluit |
|---|---|---|
| Q1 | Wanneer in Q4? | Oktober als richtdatum. Bij december kan spoor 3 vóór spoor 1. |
| Q2 | Welk fonds is het eerste? | OOMT — corpus en golden set bestaan. Een nieuw fonds zet ingest en kalibratie op het kritieke pad. |
| Q3 | Vlootmodel of de huidige gedeelde app? | Vlootmodel, één instance. De gedeelde vorm is nooit als besluit vastgelegd en zou dan een ADR nodig hebben. |
| Q4 | Blijft de externe beoordeling sturend? | Nee. Reviewgericht werk blijft op de lijst, achteraan. |
| Q5 | Wordt de rubric herschreven? | Nee. Hij blijft meetlat. Dit document vervangt alleen de rangschikking. |
