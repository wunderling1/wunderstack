# Diagnose — `G3-fund [demo]` rood, en wat eronder lag

> **Hoort bij:** `docs/plans/PLAN-gate-scalability-test.md` (Fase 4 stap 2: echt-rood vs. vals-rood) en
> `docs/eval/baseline-run-2026-07-30.md` (de run die dit blootlegde).
> **Datum:** 2026-07-30 · **Labels:** [gemeten] · [feit] · (aanname)
> **Status:** **AFGEROND (2026-07-31).** Alle drie de openstaande opties uit §5 zijn uitgevoerd via het
> ingest-herstelplan (Fase 2, 3 en 5) en de blinde vlek uit §3.2 is gedicht (Fase 4 en 6). Eén
> mechanisme in §2 bleek onjuist en is gecorrigeerd; zie §6 hieronder voor wat er van deze diagnose
> overeind staat en wat niet.

**Kort:** de rode gate is *vals-rood* (verouderde data), maar het onderzoek legde daaronder een
*echt-rood* bloot dat geen enkele gate bewaakt: **de productie-ingest haalt uit een echte CAO-PDF geen
enkel structuuranker.** Het fonds dat de gate wél haalt, is precies het fonds dat níét via die ingest
is geladen.

---

## 1. De meting [gemeten, read-only queries op de gate-DB]

| Fonds | Bron | Chunks | Met `article` | Met `source_ref` | Chunks met regel-leidende "Artikel N" | Chunk-types | Laatste ingest |
|---|---|---|---|---|---|---|---|
| `demo` | markdown (`cao-fictief.md`) | 10 | **0** | **0** | **6** | 10 text | 2026-07-03 |
| `elektronische-detailhandel` | **PDF** (echte CAO) | 107 | **0** | **0** | **0** | 107 text | 2026-07-09 |
| `eval-fixtures` | fixture-adapter | 31 | **31** | **31** | 0 | 27 text + 4 table | 2026-07-10 |

---

## 2. `demo` — vals-rood (verouderde ingest)

De CAO-bewuste chunking landde in commit `9fb0a29` (feat(phase-10), **2026-07-05**). Het
`demo`-corpus is ingeladen op **2026-07-03**, twee dagen daarvóór: die rijen zijn simpelweg
geschreven door een chunker die `article`/`sourceRef` nog niet kende.

Dat het om verouderde data gaat en niet om een kapotte pipeline blijkt uit de bron: **6 van de 10
opgeslagen chunks bevatten nog steeds een regel-leidende `Artikel N`**, dus de structuur zit in de
tekst. De huidige chunker zou die herkennen (`isHeading` matcht `/^(artikel|hoofdstuk|bijlage|paragraaf)\b/i`,
`extractArticle` matcht `/^artikel\s+(\d+[a-z]?)/i`).

**Verwachting (aanname, toetsbaar):** opnieuw ingesten van het `demo`-corpus vult `article` en
`source_ref` en maakt `G3-fund [demo]` groen. Dat is de goedkoopste falsifieerbare test en tegelijk
de fix — mits punt 3 hem niet inhaalt.

**Waarom dit maandenlang onzichtbaar bleef:** `G3-fund` draait alleen nachtelijk (heeft een DB nodig),
en een nachtelijke fail is nu **visibility, geen blokkade** (open besluit B4). Er was dus niets dat
iemand tegenhield. De claim "nulmeting integraal groen" in `GATE-ARCHITECTURE.md` slaat op `etd`; de
`demo`-laag kwam later (Fase 5, tenant zero) en is nooit groen geweest.

---

## 3. Het echte probleem — de PDF-ingest levert geen enkel anker [feit]

`elektronische-detailhandel` is ingeladen op **2026-07-09**, vier dagen ná Fase 10. De schrijfkant is
aantoonbaar in orde: `scripts/ingest/run.ts:193-195` mapt `article`, `lid` en `sourceRef` gewoon mee
naar de insert. Toch is `article` **null voor alle 107 chunks**, en is er **geen enkel table-chunk**
terwijl dit een echte CAO met loontabellen is.

De oorzaak zit vóór de chunker. De opgeslagen tekst is doorlopend proza zonder regelstructuur:

```
chunk 1: "cao voor de Elektrotechnische Detailhandel 2023 27 februari 2023 1 CAO voor de Elektrotech…"
chunk 5: "…vakantiewerkers. 1.3. Ged…"
chunk 6: "…niet: • Schriftelijke bevestiging (artikel 3.1. , tweede, derde en vierde punt) • Indeling…"
```

Paginanummers en kopteksten staan middenin de zin, en sectienummers als `1.3.` staan mid-regel. Alle
structuurdetectie in `chunk.ts` werkt op **regel-leidende** patronen, dus:

- `isHeading` vuurt nooit → geen splitsing op artikelgrenzen;
- `extractArticle` vuurt nooit → `article = null`;
- `extractSectionArticle` (de `N.M`-fallback) vuurt nauwelijks — slechts 5 van 107 chunks hebben een
  regel-leidende `N.M`;
- tabelherkenning vuurt niet → 0 table-chunks.

"artikel" komt wel 29× voor (case-insensitief), maar als **inline kruisverwijzing**
(`"(artikel 3.1. , tweede…)"`), niet als kop. Er is dus niets om op te ankeren.

**Classificatie: echt-rood.** Niet op de gate die faalde, maar op het pad eronder.

### 3.1 Twee gevolgen die verder reiken dan deze gate

1. **Citaties verliezen hun leesbare anker op de echte corpus.** `assemble.ts:65` rendert
   `` ` (${sourceRef})` `` alleen als `sourceRef` bestaat; bij `null` verschijnt er niets. Het model
   ziet in zijn context dus geen "(Artikel 5, lid 2)", en de UI-citatiekaart heeft geen label.
   *Nuance:* citatie-**verificatie** blijft werken — die matcht op `chunkId` + verbatim quote, niet op
   `sourceRef` (zie `GATE-ARCHITECTURE.md` §4.5). De belofte "elk citaat is verifieerbaar" staat dus
   overeind; de belofte "we citeren artikel en lid" niet, op dit corpus.
2. **Chunkgrenzen lopen midden door zinnen.** De voorbeelden hierboven beginnen mid-zin. Dat is
   precies wat injectie **I5** kunstmatig zou zaaien ("chunkgrenzen midden door artikelen"), en het
   gebeurt hier in productie, ongemeten.

### 3.2 Waarom geen enkele gate dit ziet

`G3-fund` draait alleen op fondsen met een golden set: `etd` (→ fonds `eval-fixtures`) en `demo`. Het
fonds `elektronische-detailhandel` heeft er geen, dus geen gate kijkt ernaar. En `eval-fixtures`
haalt zijn `article`/`sourceRef` uit de **fixture-adapter**, niet uit `scripts/ingest`. Daardoor
bewijst de groene `G3-fund [etd]` iets anders dan hij lijkt te bewijzen: hij toetst de retrieval- en
antwoordketen, maar **niet de productie-ingest**. Dat is een blinde vlek in het lagenmodel, geen
kapotte gate.

---

## 4. Directe consequentie voor de schaalbaarheidstoets

**Alle drie de corpora uit Fase 1 zijn PDF's** (Staatscourant-avv-publicaties en een
sectorteksteditie). Als §3 blijft staan, produceren ze alle drie chunks zonder `article`, zonder
`sourceRef` en zonder tabelherkenning — en dan meet Fase 2 niet "is de pipeline corpus-onafhankelijk"
maar "faalt de PDF-parse opnieuw". Drie keer dezelfde bevinding, geen portabiliteitssignaal.

Dit is precies de winst die het protocol moest opleveren, alleen eerder dan gepland: **de eerste koude
doorloop zou een raadselachtige rode hebben opgeleverd, en nu weten we vooraf waarom.**

Aantekening voor het interventielog van Fase 2: een fix hiervoor is een **C1** (codewijziging,
"pipeline niet corpus-onafhankelijk") — de zwaarste categorie. Hij telt mee, ook al wordt hij vóór
corpus 1 gemaakt in plaats van tijdens.

---

## 5. Wat hier bewust NIET is gedaan

Geen fix, geen re-ingest, geen drempelwijziging. Openstaande keuzes, in volgorde van kosten:

| # | Optie | Kosten | Effect |
|---|---|---|---|
| 1 | `demo`-corpus opnieuw ingesten | Minuten | Toetst de aanname uit §2 en maakt waarschijnlijk `G3-fund [demo]` groen → P0.2 kan dicht |
| 2 | PDF-parse regelstructuur laten behouden | Echt werk in `scripts/ingest/parse.ts` | Lost §3 op; vereist daarna een re-ingest van `elektronische-detailhandel` en herijking |
| 3 | Een golden set voor `elektronische-detailhandel` | Groter | Sluit de blinde vlek uit §3.2 permanent, zodat de productie-ingest ook bewaakt wordt |

Optie 1 en 2 zijn onafhankelijk: 1 sluit P0.2, 2 is nodig vóór Fase 2 zinvol is.

---

## 6. Afronding (2026-07-31) — wat hiervan overeind staat

Uitgevoerd via `docs/plans/`-losse opdracht "ingest-herstelplan", Fase 2 t/m 6. Per onderdeel:

| Uit deze diagnose | Uitkomst | Bewijs |
|---|---|---|
| §2 `demo` vals-rood door **verouderde chunker** | **Mechanisme onjuist.** Het label *vals-rood* klopt, de oorzaak niet: in fonds `demo` stond een ánder bestand (`sample-cao.txt`) dan de golden set toetst. De verwachte fix (re-ingest) werkte wél, om een andere reden | `ingest/FINDING-demo-corpus-mismatch-2026-07-30.md` · `intervention-log.md` (C3, 2026-07-30) |
| §3 PDF-ingest levert **geen enkel anker** | **Bevestigd en opgelost.** `article` 0/107 (0,0%) → **221/245 (90,2%)**, `source_ref` → 99,6%, table-chunks 0 → **12**, mid-zin-starts 86,0% → 0,4% | `ingest/PARSE-FIX-2026-07-30.md` · `intervention-log.md` (C1, 2026-07-30) |
| §3.1 citaties zonder leesbaar anker | Opgelost door §3; verificatie was en blijft `chunkId` + verbatim quote | `ingest/INGEST-elektronische-detailhandel-2026-07-30-na-parsefix.md` |
| §3.2 blinde vlek: `G3-fund [etd]` bewijst de ingest niet | **Gedicht op twee manieren.** Een golden set op het echt geïngeste PDF-corpus (`etd-full`, 15 cases) én de regel expliciet vastgelegd als `Bewijst niet` bij G2/G3 in `GATE-ARCHITECTURE.md` | `golden-sets/NULMETING-etd-full-2026-07-30.md` · `GATE-ARCHITECTURE.md` §G3 |
| §4 "de drie corpora zijn PDF's, dus Fase 2 meet de parse opnieuw" | Nog steeds geldig als waarschuwing, maar de aanleiding is weg: de parse haalt nu ankers uit een echte CAO-PDF | `ingest/PARSE-FIX-2026-07-30.md` |
| §5 optie 1, 2 en 3 | **Alle drie uitgevoerd** (Fase 2, Fase 3, Fase 5) | `intervention-log.md` |
| "nachtelijk rood houdt niemand tegen" (§2, §3.2) | **Niet meer waar.** B4 herzien: rood blokkeert `main` niet, maar wel promotie van dat fonds — `pnpm promote-check <fonds> <tag>` | `ingest/PROMOTION-GATE-2026-07-31.md` · `GATE-ARCHITECTURE.md` §7 |

**Wat níet is opgelost en bewust openstaat:** de refusal-guard is rood op `demo` én `etd-full`
(drempelcalibratie stond buiten scope), er is nog geen volledig groene run als bevroren baseline
(P0.2), en er zijn drie kleinere residu's uit Fase 3 (inhoudsopgave als doorzoekbare inhoud,
vals-positieve koppen uit afgebroken kruisverwijzingen, drie onleesbare PDF-pagina's). De actuele
lijst staat onder *Openstaand* in `intervention-log.md`; de samenvatting in
`SLOTVERSLAG-ingest-herstelplan-2026-07-31.md`.
