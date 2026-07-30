# Bevinding — fonds `demo` bevat een ander corpus dan de golden set toetst

> **Hoort bij:** Fase 2 van het ingest-herstelplan (demo re-ingest), en **corrigeert §2 van**
> `docs/eval/diagnosis-fund-article-metadata-2026-07-30.md`.
> **Datum:** 2026-07-30 · **Labels:** [feit] · [gemeten] · (aanname)
> **Status:** Fase 2 **gepauzeerd** vóór enige datamutatie. Geen API-kosten gemaakt (alleen dry-run).

**Kort:** de diagnose schreef het rode `G3-fund [demo]` toe aan verouderde chunker-output op het
juiste corpus. Dat is niet wat er aan de hand is. In fonds `demo` staat een **ander corpus** dan
waarvoor de demo-golden-set is geschreven. De re-ingest-verwachting houdt stand, maar de oorzaak en
daarmee de benodigde ingreep zijn anders — en het productiepad kan de ingreep niet uitvoeren.

---

## 1. Wat er werkelijk in fonds `demo` staat [gemeten]

Het structuurrapport van Fase 1 noemt één document:

| Bron | Versie | Laatste ingest | Chunks |
|---|---|---|---|
| `demo/sample-cao.txt` | 1 | 2026-07-03 08:55:09 | 10 |

Dat is `scripts/ingest/sample/sample-cao.txt` (2,3 KB, 43 regels) — een vroeg smoke-test-bestand.
Het gedocumenteerde demo-corpus is een ander bestand: `scripts/ingest/demo-corpus/cao-fictief.md`
(88 regels), volgens `scripts/ingest/demo-corpus/README.md:3` "a fully fictional CAO for the public
demo (tenant zero, fund `demo`)". **Dat bestand is nooit ingeladen.**

## 2. Waarom de gate niet kón slagen [feit]

De demo-golden-set verwacht de artikelnummering van `cao-fictief.md`. Die van het opgeslagen corpus
is een andere:

| Verwacht artikel (golden set) | In `cao-fictief.md` | In het opgeslagen `sample-cao.txt` |
|---|---|---|
| 2 (looptijd) | Artikel 2 — Looptijd | **bestaat niet** |
| 3 (proeftijd) | Artikel 3 — Proeftijd | Artikel 3 — Proeftijd ✓ |
| 4 (deeltijd/arbeidsduur) | Artikel 4 — Arbeidsduur | **bestaat niet** |
| 5 (loontabel, € 2.455) | Artikel 5 — Salaris | Artikel 5 — **Opzegtermijn** |
| 6 (overwerktoeslag) | Artikel 6 — Overwerk | **bestaat niet** |
| 7 (reiskosten) | Artikel 7 — Reiskosten | **bestaat niet** |
| 8 (vakantiedagen) | Artikel 8 — Vakantie | Artikel 8 — **Arbeidsduur** |
| 9 (bijzonder verlof) | Artikel 9 — Bijzonder verlof | **bestaat niet** |
| 10 (wachtdag/ziekte) | Artikel 10 — Arbeidsongeschiktheid | **bestaat niet** |
| 11 (opleidingsbudget) | Artikel 11 — Opleidingsbudget | Artikel 26 (ander nummer) |

Van de tien verwachte artikelen bestaan er **zeven niet** in het opgeslagen corpus, en twee van de
drie die wel bestaan gaan **over iets anders**. Alleen Artikel 3 (proeftijd) valt per ongeluk samen.
`demo-f10` vraagt naar "functiegroep B, trede 1" — dat bedrag (`€ 2.455`) staat in
`cao-fictief.md:50` en komt in `sample-cao.txt` nergens voor.

**Gevolg:** 0% retrieval was **overbepaald**. Ook met perfecte ankers had deze gate niet kunnen
slagen, want het gevraagde staat niet in de opgeslagen tekst. De diagnose noemde één oorzaak
(ontbrekende ankers) waar er twee waren, en de tweede is de dominante.

## 3. Wat dit doet met de diagnose

- **§3 van de diagnose staat overeind** en is in Fase 1 onafhankelijk herbevestigd: de PDF-ingest
  levert geen structuurankers. Dat is de dragende claim voor Fase 3, 4 en 5; die wijzigt niet.
- **§2 van de diagnose is onjuist in mechanisme.** "De chunker kende `article`/`sourceRef` nog niet
  toen dit corpus werd geladen" is feitelijk waar over de ingest-datum, maar het is niet de reden dat
  de gate faalde. Het label *vals-rood* blijft correct — er is niets kapot aan de pipeline — maar de
  reden is "verkeerd corpus", niet "oude chunker".
- De 6 chunks met regel-leidende `Artikel N` uit §2 bleven daarmee onbedoeld misleidend bewijs: ze
  bewezen dat de structuur in de tekst zat, en niet dat het de juiste tekst was.

## 4. De re-ingest-verwachting zelf houdt stand [gemeten, dry-run, geen kosten]

`pnpm --filter @wunderstack/ingest ingest demo-corpus --fund demo --version 1 --dry-run`:

```
  dry-run   demo/cao-fictief.md (32 chunks, 1 table, 31 with sourceRef)
             refs: Hoofdstuk 1 | Artikel 1, lid 1 | Artikel 1, lid 2 | Artikel 1, lid 3 | Artikel 2, lid 1
  dry-run   demo/README.md (2 chunks, 0 table, 0 with sourceRef)

  chunks                     34 (33 text, 1 table)
  article coverage           26/34 (76.5%)
  source_ref coverage        31/34 (91.2%)
  anchorable but unanchored  0
  mid-sentence starts        0/34 (0.0%)
```

Op het juiste corpus doen de bevroren chunker-patronen precies wat ze moeten doen: 31 van de 34
chunks krijgen een leesbaar anker, en de loontabel komt als **1 table-chunk** door. De aanname uit
Fase 2 ("`article` en `source_ref` worden gevuld") is hiermee bevestigd zonder één euro embeddings.

## 5. Twee blokkades die het plan niet voorzag

### 5.1 Het productiepad kan geen document terugtrekken [feit]

`run.ts` is idempotent **per document**, gekeyd op `source_uri` (`run.ts:143-153`), en vervangt bij
een wijziging de chunks van dát document (`run.ts:183`). Er is geen stap die documenten van een
fonds verwijdert die niet meer in de bron staan. Een re-ingest van `demo-corpus` voegt dus
`demo/cao-fictief.md` **toe** en laat `demo/sample-cao.txt` staan.

Fonds `demo` zou daarna twee tegenstrijdige CAO's bevatten: twee verschillende Artikel 5 (Salaris én
Opzegtermijn), twee verschillende Artikel 8 (Vakantie én Arbeidsduur). Dat is een corpus-isolatie-
probleem *binnen* één fonds, en het raakt niet alleen de gate: tenant zero is de **publieke demo**,
dus die zou uit een mix van twee CAO's antwoorden.

Dit is breder dan demo. Een echt fonds dat zijn CAO vervangt door een nieuwe editie onder een andere
bestandsnaam loopt hier direct tegenaan: de oude editie blijft vindbaar, stil. **Er is geen enkele
gate die dit ziet** — het structuurrapport uit Fase 1 zou zelfs braaf 91% dekking rapporteren over
de twee corpora samen.

### 5.2 De gedocumenteerde ingest-opdracht laadt de README mee als CAO-tekst [feit]

`listInputFiles` (`run.ts:67-83`) neemt elk `.md`/`.txt`/`.pdf`-bestand in de map mee. In
`demo-corpus/` staat naast `cao-fictief.md` ook `README.md` — ontwikkelaarsdocumentatie. Het
commando uit `demo-corpus/README.md:10` maakt daar 2 doorzoekbare chunks van, in het corpus van de
publieke demo. Zichtbaar in de dry-run hierboven.

## 6. Waarom hier gestopt is

Fase 2 schrijft voor: *"Valt de verwachting anders uit: stoppen, rapporteren."* De verwachting zelf
klopt (§4), maar de oorzaak is anders (§2) en de ingreep vraagt iets dat het productiepad niet kan
(§5.1). Kerndiscipline 2 verbiedt ad-hoc scripts die data schrijven, dus een losse `DELETE` is geen
optie die ik zelf mag nemen.

**Nog niets gemuteerd:** geen ingest, geen embeddings, geen gate-run, geen euro. De keuze uit §5.1
ligt voor.
