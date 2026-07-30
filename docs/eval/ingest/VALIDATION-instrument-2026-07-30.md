# Instrumentvalidatie — ingest-structuurrapport

> **Hoort bij:** `docs/eval/diagnosis-fund-article-metadata-2026-07-30.md` (de cijfers waartegen
> gevalideerd is) en Fase 1 van het ingest-herstelplan.
> **Datum:** 2026-07-30 · **Instrument:** `scripts/ingest/report.ts` · **Labels:** [gemeten] · [feit] · (aanname)
> **Status:** instrument gevalideerd; twee afwijkingen gevonden en verklaard, beide in het voordeel
> van het instrument.

Een meetinstrument dat je niet eerst tegen een bekende meting houdt, is een meningsgenerator. De
diagnose van 2026-07-30 mat de structuurschade met losse SQL-queries. Het rapport moet die cijfers
reproduceren voordat het gebruikt mag worden om een fix te beoordelen.

## Uitkomst [gemeten]

| Fonds | Maat | Diagnose | Rapport | Oordeel |
|---|---|---|---|---|
| `demo` | chunks | 10 | **10** | gelijk |
| `demo` | met `article` | 0 | **0** | gelijk |
| `demo` | met `source_ref` | 0 | **0** | gelijk |
| `demo` | regel-leidende `Artikel N` | 6 | **6** | gelijk |
| `demo` | chunk-types | 10 text | **10 text, 0 table** | gelijk |
| `elektronische-detailhandel` | chunks | 107 | **107** | gelijk |
| `elektronische-detailhandel` | met `article` | 0 | **0** | gelijk |
| `elektronische-detailhandel` | met `source_ref` | 0 | **0** | gelijk |
| `elektronische-detailhandel` | table-chunks | 0 | **0** | gelijk |
| `elektronische-detailhandel` | regel-leidende `N.M` | 5 | **3** | afwijking A |
| `elektronische-detailhandel` | inline `artikel` | "29×" | **90 in 29 chunks** | afwijking B |

Baselines: `INGEST-demo-2026-07-30.md` en `INGEST-elektronische-detailhandel-2026-07-30.md`.

## Afwijking A — 5 versus 3 regel-leidende `N.M` [feit]

De diagnose telde met een losse patroonvergelijking, het rapport spiegelt `extractSectionArticle`
uit de bevroren chunker (dat een sectienummer eist dat op wit of regeleinde eindigt). Het verschil
is precies twee chunks, en beide zijn **geen sectienummer maar een salarisbedrag**:

```
[BEIDE]        "4.3 Arbeidsduurverkorting (ADV) Een fulltime werknemer heeft per jaar recht op 104 rooster…"
[BEIDE]        "5.10. Vakantie na bevalling Een werknemer heeft het recht om maximaal vijf vakantiedagen…"
[ALLEEN LOOS]  "1.785,60 1.785,60 1.785,60 1.785,60 1.785,60 1 1.785,60 1.785,60 1.785,60 1.785,60 1.785,60"
[ALLEEN LOOS]  "1.791,80 1.791,80 1.791,80 1 1.791,80 1.791,80 1.791,80 1.791,80 1.791,80 1.791,80 2 1.791,…"
[BEIDE]        "6.12 Maaltijdvergoeding Als een werknemer na 19.00 uur moet werken en deze dag langer dan…"
```

Het rapportcijfer (3) is dus het juiste: `1.785,60` is een bedrag uit een loontabel, geen artikel
`1.785`. **De diagnose telde 2 valse positieven; die correctie staat hiermee vast.**

De twee valse positieven zijn ondertussen zelfstandig bewijs: dit zijn de **loontabellen**, die als
één lange rij herhaalde bedragen zonder enige rijstructuur zijn binnengekomen. Ze verklaren de
0 table-chunks aan de bronkant en leveren meteen twee concrete spot-check-kandidaten voor de
parse-fix.

## Afwijking B — "artikel komt 29× voor" [feit]

De diagnose noemt 29 voorkomens; het rapport meet **90 voorkomens verspreid over 29 chunks**. De 29
uit de diagnose was dus een chunk-telling, niet een voorkomen-telling. Geen tegenspraak, wel een
dubbelzinnig cijfer dat nu ondubbelzinnig is. Het rapport houdt beide getallen apart.

## Positieve controle — `eval-fixtures` [gemeten]

Een instrument dat overal nul rapporteert is niet te onderscheiden van een instrument dat kapot is.
Daarom dezelfde meting op het fonds waarvan bekend is dat de ankers er wél zijn (niet weggeschreven
als baseline, alleen als controle):

```
chunks                     31 (27 text, 4 table)
article coverage           31/31 (100.0%)
source_ref coverage        31/31 (100.0%)
anchorable but unanchored  0
mid-sentence starts        0/31 (0.0%)
```

Dat is exact rij 3 uit §1 van de diagnose (31/31/31, 27 text + 4 table). Het instrument meet dus
zowel afwezigheid als aanwezigheid van structuur correct.

## Wat het instrument toevoegt boven de diagnose [gemeten]

1. **86% van de ETD-chunks begint mid-zin** (92/107). Tegenover 0% bij `demo` en 0% bij
   `eval-fixtures`. De diagnose noemde dit kwalitatief ("chunkgrenzen lopen midden door zinnen"),
   nu staat er een getal onder — en het is de eerste keer dat de I5-achtige schade in productie
   gemeten is in plaats van kunstmatig gezaaid.
2. **"Door de chunker ankerbaar, toch niet geankerd" scheidt vals-rood van echt-rood mechanisch.**
   Voor `demo` is dat **6**: de structuur staat op eigen regels, de huidige chunker zou die zonder
   meer herkennen, dus er is niets kapot behalve de leeftijd van de data. Voor
   `elektronische-detailhandel` is het **0**: daar staat de structuur mid-proza, en zelfs een
   perfecte chunker had er niets kunnen ankeren. Dat is het verschil tussen "opnieuw inladen" en
   "de parse repareren", uitgedrukt in één cijfer in plaats van in een betoog — en het is
   tegelijk de rechtvaardiging om `chunk.ts` bevroren te houden.
3. **De drie overgebleven `N.M`-koppen laten zien waarom.** "4.3 Arbeidsduurverkorting (ADV) Een
   fulltime werknemer heeft…" is één regel waarin kop én lopende tekst aan elkaar geplakt zitten.
   `isHeading` weigert die (te lang, niet kop-vormig), en dat is correct gedrag: het probleem is
   dat de regelovergang tussen kop en tekst in de PDF-extractie verdwenen is.

## Reproduceren

```bash
pnpm --filter @wunderstack/ingest report --fund demo
pnpm --filter @wunderstack/ingest report --fund elektronische-detailhandel
pnpm --filter @wunderstack/ingest report --fund eval-fixtures --no-write
```

Read-only: het rapport leest chunks en documenten, schrijft alleen een markdown-bestand in
`docs/eval/ingest/` en raakt de database nooit aan. Geen embedding- of model-calls, dus geen
API-kosten. Bestaande rapporten worden nooit overschreven (het instrument nummert door), zodat een
voor-meting niet stiekem door een na-meting vervangen kan worden.

## Grenzen van dit instrument (bewust)

- Het **zet geen drempels en laat niets falen** (open besluit B4). Drempels komen pas na calibratie
  en bewegen daarna alleen omhoog.
- De mid-zin-heuristiek (D4) is een signaal, geen waarheid: een chunk die met een kleine letter
  begint kán een legitieme voortzetting zijn. Lijst-items en cijfers zijn uitgezonderd.
- De structuurpatronen zijn **gespiegeld** uit `chunk.ts` in plaats van geïmporteerd, omdat die file
  voor dit werk bevroren is. `scripts/ingest/report.test.ts` haalt echte tekst door de echte
  `chunk()` en controleert dat spiegel en chunker het nog eens zijn; loopt dat uiteen, dan faalt
  G1 in plaats van dat het rapport stil scheef gaat staan.
