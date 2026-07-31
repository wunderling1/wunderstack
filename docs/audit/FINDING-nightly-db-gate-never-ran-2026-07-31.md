# Bevinding — de nachtelijke DB-gate heeft nog nooit gedraaid

> **Datum:** 2026-07-31 · **Labels:** [gemeten] · [feit] · (aanname)
> **Status:** OORZAAK GEMETEN en verholpen — zie §7. Het secret `DATABASE_URL` bevatte een lokaal
> tunneladres; CI heeft nooit een database gezien. §4-§6 zijn de gedachtegang van vóór die meting en
> blijven staan; §6 is achterhaald door het besluit in §7.

**Kort.** De nachtelijke CI-run faalt elke nacht sinds 21 juli 2026, altijd op dezelfde stap: "Ingest
golden fixtures (nightly integration gate)". Die stap is de enige plek in de hele pipeline die een
database aanraakt, en hij sneuvelt vóór de eval-stap. Gevolg: **G3-pipeline, G3-fund en G3-isolation
hebben nog nooit in CI gedraaid.** Al het groene G3-bewijs dat we hebben — inclusief de drie fondsen
van 2026-07-31 — komt van een laptop.

## 1. Het is geen regressie, de stap heeft nooit gewerkt [gemeten]

De schedule-runs waren groen van 10 t/m 20 juli en zijn rood van 21 t/m 31 juli — elf nachten op rij,
elke keer dezelfde falende stap. Legt men de laatste groene nachtelijke commit (`c1e728f5`) naast de
eerste rode (`a35c13de`), dan blijkt de diff `scripts/ingest/fixtures.ts` **toe te voegen** (185 nieuwe
regels) samen met de CI-stap die hem aanroept. De nightly werd dus rood in de nacht dat de stap voor het
eerst op `main` bestond. Er is niets kapotgegaan; er is iets geïntroduceerd dat nooit heeft gelopen.

## 2. Waarom dit verder reikt dan één rode nachtrun [feit]

`DATABASE_URL` wordt uitsluitend op het schedule-event doorgegeven (`ci.yml:80-81`), met
`EVAL_REQUIRE_DB=1` alleen daar. PR's, pushes en merge-queue-runs draaien dus zonder database en de
DB-gates skippen daar netjes. De nightly is de enige plek met een database — en die stopt bij de
ingest-stap, waarna de eval-stap `skipped` is. Er is geen enkele CI-run waarin een DB-gate is
uitgevoerd.

Dat kwalificeert wat `gates-overview.md` en `GATE-ARCHITECTURE.md` over G3 zeggen: de *configuratie*
klopt (nightly is de afdwingplek), maar de *uitvoering* heeft nooit plaatsgevonden.

## 3. Waarom het elf nachten onzichtbaar bleef [feit]

De enige output was drizzle's eigen regel plus de parameters:

```
Failed query: select "content_hash" from "documents" where "documents"."source_uri" = $1 limit $2
params: eval-fixtures://golden-passages.jsonl,1
```

Daarna direct de exit van pnpm. Geen reden, geen foutcode. Oorzaak: de CLI ving de fout op en printte
alleen `error.message`, terwijl een postgres.js-verbindingsfout zijn reden in `code` en `cause` draagt —
en de `message` in dit geval leeg rendert. De fout kwam 0,65 seconde na de start, dus het is een
verbindings- of autorisatieprobleem en geen timeout.

## 4. Wat vandaag is uitgesloten [gemeten]

**Migratie 0004 is niet de oorzaak, en opnieuw draaien verandert niets.** `0004_namespace_source_uri_by_fund.sql`
is een pure data-`UPDATE` die bestaande `source_uri`-waarden van een fondsprefix voorziet, en hij slaat
de fixtures-URI expliciet over (die bevat een slash). De tabel `documents` wordt aangemaakt in
`0000_init.sql`. Een ontbrekende 0004 kan dus nooit een falende SELECT op die tabel veroorzaken.

**De database die lokaal in gebruik is, bevat de actuele fixtures.** `sha256` van
`packages/agents/src/evals/fixtures/golden-passages.jsonl` begint met `17ac5ac3b993`, precies de waarde
in de `version`-kolom van de `eval-fixtures`-rij (31 passages, `ingested_at` 2026-07-10 07:56:38). Tegen
díe database is het nachtelijke commando dus een aantoonbare no-op: het zou "Fixtures unchanged"
printen en groen zijn.

Daarmee resteren twee mogelijkheden:

1. **CI wijst een andere database aan** dan de lokale — het workflow-commentaar suggereert dat ooit ook
   zo bedoeld ("the staging DB is wired here just for the schedule"). Als die nooit gemigreerd is, mist
   hij niet 0004 maar `0000_init` en alles daarna.
2. **CI wijst dezelfde database aan maar komt er niet in** — TLS, credentials of netwerkfiltering. De
   client zet geen enkele SSL-optie (`postgres(env.DATABASE_URL, { max: 10 })`, `packages/db/src/client.ts:30`).

## 5. Hoe je het onderscheidt, zonder een nacht te wachten

Toegevoegd op 2026-07-31:

- **`scripts/ingest/diagnostics.ts`** — `describeFailure()` print naam, boodschap, de driver-velden
  (`code`, `errno`, `severity`, `detail`, `routine`, …), de hele `cause`-keten en enkele stackframes.
  Aangesloten op alle drie de ingest-CLI's (`fixtures.ts`, `run.ts`, `report.ts`), die alle drie
  hetzelfde `.message`-only patroon hadden.
- **Doelvingerafdruk** — `fixtures.ts` print vóór de eerste query één regel met een sha256-vingerafdruk
  van host+poort+database+gebruiker, plus poort, `sslmode` en de provider-staart van de hostnaam.
  **Bewust niet de host, gebruiker of databasenaam**: deze repo is publiek, workflow-logs zijn dus
  wereldwijd leesbaar, en GitHub maskeert alleen letterlijke secret-waarden — een uit `DATABASE_URL`
  geplukte hostnaam zou onverkort in het log staan.
- **`.github/workflows/db-preflight.yml`** — handmatig te starten (`workflow_dispatch`), draait exact
  het nachtelijke commando, kost geen LLM-calls. **Eigen jobnaam**, niet `verify`: `verify` is de
  verplichte check voor merges, en een handmatige run die de betaalde eval overslaat mag nooit een
  groene `verify` voor een commit kunnen opleveren.

**Beslisregel.** Start "DB preflight" vanuit het Actions-tabblad en vergelijk de vingerafdruk in dat log
met de vingerafdruk die lokaal geprint wordt door `pnpm --filter @wunderstack/ingest ingest:fixtures`.
Gelijk ⇒ dezelfde database, dus mogelijkheid 2 (verbinding of credentials). Verschillend ⇒ mogelijkheid
1 (andere, vermoedelijk niet-gemigreerde database).

## 6. Wat hier bewust NIET is gedaan

- **Geen migratiestap in CI.** Er staat in geen enkele workflow een `drizzle-kit migrate`. Blijkt CI naar
  een niet-gemigreerde database te wijzen, dan is migreren-vanuit-CI een eigen besluit (welke rol, welke
  rechten, wat bij een gefaalde migratie) en geen bijproduct van deze reparatie.
- **Geen SSL-optie toegevoegd** aan de client. Zolang niet vaststaat dat TLS het probleem is, zou dat
  een gok zijn die de echte oorzaak maskeert.
- **De nachtelijke cron niet aangeraakt.** Hij blijft rood tot de oorzaak weg is; dat is de juiste
  toestand voor een gate die niet draait.

## 7. De oorzaak, gemeten — en wat er is besloten

**Het secret wees naar een tunnel op de runner zelf.** De preflight (run `30640322363`, 2026-07-31
14:51 UTC) printte:

```
database target: fingerprint 6bd4402231da · port 10000 · sslmode prefer · host suffix 0.0.1
Error: Failed query: select "content_hash" from "documents" where "documents"."source_uri" = $1 limit $2
caused by: Error: connect ECONNREFUSED 127.0.0.1:10000
  code=ECONNREFUSED errno=-111 syscall=connect
```

`127.0.0.1:10000` is het adres dat `scalingo db-tunnel` op een ontwikkelmachine opent. In het secret
`DATABASE_URL` staat dus een tunnel-URL uit een lokale `.env`, en op een runner luistert daar niets.
Daarmee vallen beide hypothesen uit §4 af: het is niet mogelijkheid 1 (een andere, niet-gemigreerde
database) en niet mogelijkheid 2 (dezelfde database, verbinding geweigerd) — er was **geen** database.
Dat verklaart ook waarom lokaal alles altijd werkte: daar stond de tunnel open.

**Besluit: CI zet zijn eigen gate-database op** in plaats van naar een beheerde database te wijzen
(`ci.yml:77-116`). Overwogen alternatief was het secret vullen met de echte externe Scalingo-URL. Dat
is per run goedkoper — ingest is idempotent, dus na de eerste keer een no-op — en het betrapt je op
migratie-drift tegen de échte database. Het is niet gekozen om twee redenen:

1. **Verborgen gedeelde toestand.** Een blijvende database draagt resten van eerdere runs en van lokaal
   werk. Een gate kan daar groen zijn om een reden die niet in de commit zit. Dat is precies het soort
   onzichtbare input waardoor P0.2 nu open staat (lokaal groen, CI rood, oorzaak niet aanwijsbaar). Een
   verse database maakt van het corpus een gedeclareerde input: alles wat de gate meet, staat in de repo.
2. **Blootstelling.** Die variant vraagt een database die verbindingen vanaf GitHub-runners accepteert,
   dus vanaf het internet, bij een publieke repo — plus TLS-werk, want de client zet geen SSL-optie
   (`packages/db/src/client.ts:30`).

**Wat deze keuze níet dekt:** of de beheerde database nog bij onze migraties past. Dat gat blijft open
en hoort in een losse, incidentele migratiecheck — niet in de dagelijkse gate.

**Migreren in CI is hiermee wél ingevoerd**, tegen wat §6 zich voornam. De reden dat het daar werd
uitgesteld ("welke rol, welke rechten, wat bij een gefaalde migratie") vervalt voor een wegwerp-database
die met de runner verdwijnt: de rol is `postgres` op een lege container, en een gefaalde migratie faalt
de stap. Voor een beheerde database zou dat besluit nog steeds nodig zijn.

**`db-preflight.yml` is verwijderd.** Hij heeft zijn werk gedaan en zijn enige env was het inmiddels
bekend-onjuiste secret. Vervangen door `workflow_dispatch`-input `run_db_gates` op de CI-workflow, die
de DB-gates op verzoek nu draait in plaats van om 03:00 — met een eigen `verify`-job-gedrag dat de
betaalde eval wél meeneemt, zodat een handmatige run geen halve groene check kan opleveren.

**Nog te doen:** het onjuiste secret `DATABASE_URL` in de repo-settings opruimen. CI gebruikt het niet
meer, maar een secret dat een lokaal tunneladres bevat is misleidend voor de volgende lezer.
