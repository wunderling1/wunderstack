# Promotiepoort per fonds — `promote-check`

> **Hoort bij:** Fase 4 van het ingest-herstelplan · **Datum:** 2026-07-31 · **Labels:** [gemeten] · [feit] · (aanname)
> **Besluit:** D5 — B4 herzien: nachtelijk `G3-fund`-rood blokkeert `main` niet, blokkeert promotie van
> dat fonds wél. Vastgelegd in `../GATE-ARCHITECTURE.md` §5 (B4) en §7 (de poort zelf).

**Kort:** een nachtelijk fonds-rood was tot nu toe een gat. Het blokkeerde niets, en het bewijs
overleefde de volgende run niet omdat `eval-report.json` gitignored is en wordt overschreven. Nu
schrijft elke run per fonds één duurzame regel, en `pnpm promote-check <fonds> <tag>` maakt daar een
harde GO/NO-GO van. Toegepast op de echte data van de run van 2026-07-30 komt er geen enkel fonds
door — drie NO-GO's om drie verschillende redenen.

---

## 1. Wat er gebouwd is [feit]

| Onderdeel | Pad | Rol |
|---|---|---|
| Ledger-vorm + schrijver | `packages/agents/src/evals/fund-ledger.ts` | Bezit de recordvorm, de vaste locatie en de afleiding uit een run-artefact |
| Vaste locatie | `docs/eval/gate-results/g3-fund.jsonl` | Append-only, **gecommit** — daarom leesbaar na de volgende run en in een verse clone |
| Aanroep in de eval | `packages/agents/src/evals/cao.eval.ts` (`writeRunArtefact`) | Elke run voegt zijn fondsregels toe, ook een gefaalde run |
| De poort | `scripts/promote/check.ts` + `decide.ts` | Leest de ledger + de structuurrapporten, geeft GO/NO-GO, exitcode 0/1 |
| Nalevering uit CI | `scripts/promote/record.ts` | Leidt de regels af uit een geüpload artefact, met dezelfde functie |
| Commando | `pnpm promote-check <fonds> <tag>` | Root-script, zodat het als scriptstap én checklistregel werkt |

De vijf GO-voorwaarden en hun motivatie staan in `../GATE-ARCHITECTURE.md` §7 en worden hier niet
herhaald.

### Waarom een JSONL en geen tabel of service

Besluit D2. Een append-only bestand in de repo is het goedkoopste dat het antwoord auditeerbaar
maakt: geen migratie, geen credentials, geen service om te draaien. De poort leest daardoor **geen
database en geen netwerk**, wat belangrijker is dan het lijkt — een promotiecheck die credentials
nodig heeft, is een promotiecheck die wordt overgeslagen. Herzien zodra meerdere fondsen frequent
her-ingesten (D1).

## 2. Bewijs — drie NO-GO's op echte data [gemeten]

De ledger is gevuld uit het artefact van de nulmeting-run van 2026-07-30 (`record.ts`, dus dezelfde
afleiding die een live run gebruikt):

```
$ pnpm --filter @wunderstack/promote record ../../packages/agents/eval-report.json
3 van 3 fondsregel(s) toegevoegd aan docs/eval/gate-results/g3-fund.jsonl
  demo · failed · corpus demo-1 · 2026-07-30T20:32:11.776Z
  etd-full · failed · corpus etd-full-1 · 2026-07-30T20:32:11.776Z
  etd · passed · corpus etd-1 · 2026-07-30T20:32:11.776Z
```

**`demo` — rood resultaat.** Exitcode 1.

```
NO-GO — fonds "demo" @ HEAD
  G3-fund   failed · set "demo" · fonds "demo"
  corpus    demo-1
  run       2026-07-30T20:32:11.776Z · commit (onbekend)
  ingest    laatste ingest 2026-07-30T18:21:30Z
  rapport   docs/eval/ingest/INGEST-demo-2026-07-30-na-reingest.md

  Blokkerend:
    - Het laatste G3-fund-resultaat is "failed", niet "passed". Gefaald: fund "demo" refusal-guard: >= 1 out-of-corpus probes return 0 hits (refuse-without-LLM).
    - Het resultaat vermeldt geen commit, dus het kan niet aan deze release worden gekoppeld.
```

**`etd-full` — rood resultaat.** Zelfde vorm, gefaald op de eigen refusal-guard (0/1 leeg).

**`etd` — groen resultaat, en tóch NO-GO.** Dit is het interessantste geval, want het laat zien dat de
poort meer eist dan een groen vinkje:

```
NO-GO — fonds "etd" @ HEAD
  G3-fund   passed · set "etd" · fonds "eval-fixtures"
  corpus    etd-1
  run       2026-07-30T20:32:11.776Z · commit (onbekend)
  ingest    laatste ingest 2026-07-10T07:56:38Z
  rapport   docs/eval/ingest/INGEST-eval-fixtures-2026-07-31.md

  Blokkerend:
    - Het resultaat vermeldt geen commit, dus het kan niet aan deze release worden gekoppeld.
```

Bij de eerste meting had `etd` twee blokkades: geen commit én geen structuurrapport voor fonds
`eval-fixtures`. De tweede is opgelost met een **read-only** hermeting
(`pnpm --filter @wunderstack/ingest report --fund eval-fixtures`, geen re-ingest, geen API-kosten;
31 chunks, 100% `article`-dekking). Dat het rapport daarmee is opgeschreven op 2026-07-31, ná de
gate-run van 2026-07-30, blokkeert terecht níet — zie §4.

**Wat dit zegt:** op dit moment mag geen enkel fonds gepromoveerd worden. Dat is geen storing in de
poort; dat is de poort die zijn werk doet op een repo waar twee refusal-guards openstaan en waar het
groene fonds zijn run niet aan een commit kan koppelen.

## 3. Bewijs — GO [gemeten]

Een GO is niet op de echte ledger te tonen, want geen enkel bestaand resultaat noemt een commit: het
artefact legde `commitSha` alleen vast uit `GITHUB_SHA` en die is leeg bij een lokale run. Een commit
met de hand in de ledger schrijven zou het bewijs vervalsen, dus dat is niet gedaan.

In plaats daarvan loopt het GO-pad end-to-end over echte bestanden in een tijdelijke map, door
dezelfde lezers en dezelfde beslisfunctie als het commando gebruikt
(`scripts/promote/check.test.ts` — "gives GO when a green run, its commit and an older ingest all line
up"). Wat daar níet in zit, is het `argv`-parsen en het printen.

Vanaf de volgende run is een echte GO wél mogelijk: `commitSha` valt nu terug op de lokale `HEAD`
(`resolveCommitSha`), zodat een lokaal groen zich kan identificeren. Dat sluit een gat dat al bij de
demo-run was gemeld.

**Testdekking:** 26 tests in `@wunderstack/promote` (beslisregels, sha-vergelijking, beide parsers,
en het end-to-end lees-pad), 9 in `fund-ledger.test.ts` (afleiding + idempotentie).

## 4. Eén ontwerpfout, tijdens de bouw gevonden en gerepareerd [feit]

De eerste versie vergeleek de **datum van het structuurrapport** met de gate-run: een rapport dat
nieuwer was dan de run gold als "corpus opnieuw geïngest". Dat is fout. Een read-only hermeting van
een onveranderd corpus levert ook een nieuw rapport op, en die zou dan onterecht elke promotie
blokkeren — precies wat gebeurde bij het rapport voor `eval-fixtures` hierboven.

De poort vergelijkt nu de **laatste ingest** uit de documenttabel van het rapport. Daar zat nog een
tweede val in: die kolom wordt gerenderd als `toISOString().slice(0, 19)`, dus UTC **zonder**
tijdzone-markering. Dat terugparsen zonder de `Z` laat Node het als lokale tijd lezen en schuift het
moment met de offset — in het slechtste geval verandert "geïngest ná de gate-run" daarmee in "ervoor".
Vastgelegd in een test die de UTC-lezing eist.

## 5. Wat de poort niet kan zien (aanname)

Hij leest alleen gecommit bewijs, dus hij mist een ingest die is gedaan **zonder** dat er een
structuurrapport is geschreven. Via `scripts/ingest/run.ts` kan dat niet gebeuren — het rapport is
daar onvoorwaardelijk sinds Fase 1 — maar dat is een aanname over het gebruikte pad, geen bewijs.
Een tweede beperking: een CI-run kan niet committen, dus de ledger loopt achter tot iemand
`record.ts` op het geüploade artefact draait. Dat is een handmatige stap, en dus een plek waar het
proces kan verwateren.

## 6. Afwijking van het plan

Het plan noemde `scripts/promote-check.ts`. Het is `scripts/promote/` geworden — een
workspace-package met `check.ts` (IO + CLI), `decide.ts` (de pure beslissing) en `record.ts` (de
nalevering uit CI). Reden: een los `.ts`-bestand in `scripts/` is geen workspace-package en zou dus
buiten `turbo run typecheck/lint/test:unit` en buiten de dependency-cruiser vallen. Nu draait het mee
in alle drie. De aanroep is `pnpm promote-check <fonds> <tag>`, zoals het plan bedoelde.

## 7. Gates na deze fase [gemeten]

- `pnpm turbo run typecheck lint` — 34 van 34 taken groen.
- `pnpm turbo run test:unit` — 9 van 9 pakketten groen; 186 tests in `@wunderstack/agents`, 26 in
  `@wunderstack/promote`, 36 in `@wunderstack/ingest`.
- `pnpm depcruise` — 321 modules, 753 dependencies, geen violations. De pijl-regel dekte
  `scripts/*` al generiek, dus er was geen nieuwe grensregel nodig.
- `G1`/`G2` niet opnieuw gedraaid: deze fase raakt geen retrieval-, prompt- of antwoordlogica. De
  enige wijziging in de eval is één regel na het schrijven van het artefact.
