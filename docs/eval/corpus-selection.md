# Corpusselectie — koude doorloop (Fase 1)

> **Hoort bij:** `docs/plans/PLAN-gate-scalability-test.md` §2 (Fase 1). Dit is het selectielog:
> criteria, bronlinks en corpuskarakteristiek per CAO.
> **Datum:** 2026-07-30 · **Labels:** [feit] · [gemeten] · [ontwerp] · (aanname)

Doel: drie publieke avv-CAO's als **synthetische tenants** door de bestaande pipeline halen,
gestratificeerd van schoon naar rommelig. Elk corpus wordt een fonds-laag (eigen `fund`-id,
eigen `golden-set.<key>.jsonl`, eigen `corpusVersion`), geen nieuwe runtime.

**Contaminatieregel (uit het plan):** eerst eerlijk loggen, daarná pas polijsten voor demo — nooit
andersom. Niets uit deze corpora gaat naar demomateriaal vóórdat de interventielogs van Fase 2 af zijn.

---

## 1. Meetmethode van de karakteristiek [gemeten, met caveat]

De cijfers hieronder zijn gemeten op de **tekstextractie van de bron-PDF's zoals binnengehaald op
2026-07-30**, niet op de output van onze eigen parser (`scripts/ingest/parse.ts`). Ze zijn dus
*indicatief voor de moeilijkheidsgraad*, geen voorspelling van onze extractiekwaliteit — dat is precies
wat Fase 2 meet. Geteld is: bytes, regels, woorden, tabelregels, `€`-voorkomens, percentages,
"artikel"- en "bijlage"-vermeldingen.

Belangrijk: deze telling is **geen** nulmeting van de gates. Ze bestaat om de stratificatie
verdedigbaar te maken in plaats van op gevoel ("die voelt complexer").

---

## 2. De drie gekozen corpora

| # | Stratum | CAO | Bron | Omvang | Tabellen | € / % | Bijlage-verwijzingen |
|---|---|---|---|---|---|---|---|
| 1 | **Schoon** | Metalektro Hoger Personeel 2026/2028 | Stcrt. 2026 nr. **14650** (avv-besluit 18 mei 2026, van kracht 21 mei 2026) | 93 KB · 1.150 regels · 13.870 woorden | 72 tabelregels | 15 / 26 | 17 |
| 2 | **Complex** | Metalektro Basis 2026/2028 | Stcrt. 2026 nr. **14566** (avv-besluit 11 mei 2026, van kracht 14 mei 2026) | 205 KB · 2.413 regels · 31.045 woorden | 169 tabelregels | 19 / 109 | 28 |
| 3 | **Groot + rommelig** | Metaal & Techniek — Metaalbewerkingsbedrijf 2026–2028 | Vakraad/FNV-teksteditie (avv-besluit-nummer nog te achterhalen, zie §5) | 370 KB · 5.004 regels · 58.709 woorden | 213 tabelregels | 183 / 677 | 94 |

**Bronlinks**

1. `https://content.helloflex.com/PublicCaoDocument/2040f926-c7bc-4e0c-8b38-11578aee4398/downloadcao.pdf`
   (Stcrt. 2026 nr. 14650) — publicatie-overzicht: `https://caometalektro.nl/cao/`
2. `https://caometalektro.nl/wp-content/uploads/sites/3/2026/05/Basis-2026-14566.pdf`
   (Stcrt. 2026 nr. 14566)
3. `https://www.fnv.nl/getmedia/a448b42a-3973-4332-b70c-ef914eb250c7/529-metaal-en-techniek-metaalbewerkingsbedrijf-cao-01-02-2026-31-01-2028-v19032026.pdf`

### Waarom deze drie

- **Prospectsector-criterium gehaald** [ontwerp uit het plan]: alle drie liggen in Metalektro /
  Metaal & Techniek — de Ozone/A+O-route. Elke koude doorloop levert dus materiaal voor precies dat
  gesprek (ná de contaminatieregel).
- **Stratificatie is gemeten, niet gevoeld**: de as loopt van 13.870 → 31.045 → 58.709 woorden en van
  72 → 169 → 213 tabelregels. Corpus 3 is ~4× corpus 1 in woorden en ~5× in bijlage-verwijzingen.
- **Corpus 3 dekt het "rommelige bron"-restrisico** uit de risicotabel van het plan, en dat is
  aantoonbaar in plaats van aangenomen — zie §3.
- **Sector-meerdeligheid** zit in corpus 3: het Metaalbewerkingsbedrijf is één van **vijf** deel-cao's
  (carrosserie, goud- en zilvernijverheid, isolatie, metaalbewerking, technisch installatiebedrijf).
  Een fonds in deze sector heeft dus per definitie een meerdelig corpus.

---

## 3. Aangetroffen defect in corpus 3 (vóór de eerste run) [gemeten]

De loontabel in corpus 3 is in de brontekst al **kolom-gecollapst**: meerdere functiegroepen en
meerdere bedragen zitten samengeperst in één cel.

```
| salaris-functiegroep | | | A/2 | | B/3 C/4 D/5 E/6 F/7 | G/8 H/9 I/10 J/11 |
| 16 jaar              | | | 835,68 | | 1.029 1.065 |  |
| 17 jaar              | | | 956,79 | | 1.156 1.196 1.220 | |
| 18 jaar              | | | 1.211,95 | | 1.424 1.474 1.503 | |
```

Dit is exact de faalwijze die injectie **I5** ("chunkgrenzen/tabellen platgeslagen") kunstmatig zou
zaaien — hier komt hij gratis uit de bron. Twee consequenties:

1. **I5 wordt op corpus 3 deels een natuurlijk experiment.** Zaai I5 dus op een *ander* corpus, anders
   meet je de injectie niet los van het bronprobleem.
2. **Een loonvraag op corpus 3 is een verwachte rode**, en volgens het vloerprincipe (C4) repareer je
   dat in de pipeline of je noteert het als echt-rood — nooit in de drempel. Dit staat hier
   opgeschreven **vóór** de run, zodat het achteraf geen excuus kan worden.

---

## 4. Afgewezen kandidaten (bewust, met reden) [feit]

Twee even publieke Metalektro-avv-teksten zijn **niet** gekozen:

| CAO | Bron | Omvang | Reden van afwijzing |
|---|---|---|---|
| Metalektro Arbeidsmarkt & Opleiding 2026 | Stcrt. 2026 nr. 14645 | 63 KB · 827 regels · 9.239 woorden · 14 tabelregels · 0 × `€` | Thematisch een heffings-/opleidingsfonds-CAO. Dekt de goldenset-categorieën van Fase 3 (verlof, loon, toeslagen, ziekte, opzegging, werktijden) grotendeels **niet** |
| Metalektro Regeling Vervroegd Uittreden 2026 | Stcrt. 2026 nr. 14649 | 74 KB · 877 regels · 10.792 woorden · 0 tabelregels | Eén onderwerp (RVU). Zelfde probleem: geen ≥6 categorieën mogelijk |

**Dit is zelf een bevinding.** "Schoon" mag niet stiekem "dun" gaan betekenen: een corpus dat de
compositie-eis van Fase 3 (≥40 vragen over ≥6 categorieën) niet kan vullen, produceert een
**vacuous green** — precies waar risico "vacuous green door zwakke standaardset" tegen waakt. Daarom
is het schone stratum Hoger Personeel (een volledige arbeidsvoorwaarden-CAO met 93 genummerde
clausulekoppen) en niet de kleinste tekst die ik kon vinden.

Selectiecriterium dat hieruit volgt en dat het plan nog niet had [ontwerp]: **een corpus is alleen
geschikt als het de goldenset-compositie-eis kan dragen.** Omvang is de as; categoriedekking is de
toelatingseis.

---

## 5. Juridische poort — avv-besluit vs. sectorteksteditie [feit]

Niet alle "publieke CAO's" zijn even vrij bruikbaar, en dat raakt direct de demo-ambitie.

- **Corpora 1 en 2** komen uit de **Staatscourant** als avv-besluit van de Minister van SZW: een
  officiële overheidspublicatie.
- **Corpus 3** is de **teksteditie van de Stichting Vakraad Metaal en Techniek**, en die draagt een
  expliciet voorbehoud (regel 266 van de brontekst):

  > "Wilt u teksten uit deze cao ergens voor gebruiken of ergens publiceren? Dan moet u daarvoor eerst
  > toestemming hebben van de cao-partijen en de Vakraad. […] Dan moet u volgens de wet een vergoeding
  > betalen aan de Stichting Vakraad Metaal en Techniek."

**Gevolg (aanname die getoetst moet worden vóór demogebruik):** intern meten met corpus 3 is iets
anders dan er publiek demomateriaal van maken. De aanname in het plan dat "CAO's publiek zijn, dus
kun je ze vandaag gebruiken" geldt zonder meer voor de avv-besluiten, en **niet** zonder meer voor een
sectorteksteditie.

**Actie:** vóór corpus 3 in enig demo-oppervlak landt, het avv-besluit van het
Metaalbewerkingsbedrijf 2026–2028 in de Staatscourant opzoeken en die versie als bron gebruiken.
Gevonden zijn tot nu toe alleen aanpalende publicaties: Stcrt. 2026 nr. **6579** (verzoek tot avv,
O&O-fonds Metaalbewerkingsbedrijf) en Stcrt. 2026 nr. **14563** (verzoek tot avv, Metalektro). Het
besluitnummer voor de hoofd-CAO is nog niet vastgesteld — **niet verzinnen**, opzoeken via
`cao.minszw.nl` / `zoek.officielebekendmakingen.nl`.

Dit is dezelfde poort-gedachte als `600-connectors.mdc`: de vraag "mág dit" gaat vóór de techniek.

---

## 6. Intake & registratie per corpus

Voorgestelde ids [ontwerp] — de sleutel moet matchen op `/^golden-set\.([a-z0-9-]+)\.jsonl$/`:

| # | `fund`-id | Goldenset-bestand | `corpusVersion` |
|---|---|---|---|
| 1 | `metalektro-hp` | `golden-set.metalektro-hp.jsonl` | `metalektro-hp-1` |
| 2 | `metalektro-basis` | `golden-set.metalektro-basis.jsonl` | `metalektro-basis-1` |
| 3 | `mt-metaalbewerking` | `golden-set.mt-metaalbewerking.jsonl` | `mt-metaalbewerking-1` |

Per corpus:

1. Bron-PDF in `scripts/ingest/input/` (de bestaande intake-map; er staat al een CAO-PDF, dus dit is
   het bestaande pad, geen nieuw mechanisme).
2. `pnpm --filter @wunderstack/ingest ingest <path> --fund <fund> --version <v>`
3. profile sidecar toevoegen in `fixtures/fund-sets/<key>.json` — zónder sidecar
   faalt het laden bewust. **Let op:** dit bestand valt onder `700-evals.mdc`; deze registratie is de
   bedoelde data-plane-uitbreiding en géén C4-interventie, maar raak in dezelfde wijziging niets
   anders in `src/evals/` aan.
4. Alles loggen in `docs/eval/cold-run-<corpus>.md`.

**Nog te besluiten:** committen we de bron-PDF's in de repo? Precedent zegt ja
(`scripts/ingest/input/cao_elektronische_detailhandel.pdf` staat erin), maar voor corpus 3 raakt dat
het voorbehoud uit §5. Default [ontwerp]: corpora 1 en 2 committen, corpus 3 lokaal houden tot §5 is
afgehandeld.

---

## 7. Openstaande punten

| # | Punt | Blokkeert |
|---|---|---|
| 1 | Avv-besluitnummer (Staatscourant) van Metaalbewerkingsbedrijf 2026–2028 achterhalen | Demogebruik corpus 3, niet de meting |
| 2 | Besluit over committen van bron-PDF's | Fase 2 op corpus 3 |
| 3 | P0.2 (baseline bevroren) is nog niet af | Fase 2 volledig — zonder vaste referentie is portabiliteit niet meetbaar |
