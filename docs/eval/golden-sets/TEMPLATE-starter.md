# Sjabloon — starter-golden-set voor een nieuw fonds

> **Waarom dit bestaat.** Zonder golden set zegt geen enkele gate iets over een nieuw corpus. Je kunt
> dan meten dat de ingest structuur oplevert (het structuurrapport), maar niet of de agent goede
> antwoorden geeft. Dit sjabloon verkort dat onbewaakte venster van weken naar dagen: je kunt het in
> één zitting invullen, zonder co-creatiesessie met het fonds.
>
> Een starter-set is **geen** vervanging voor een door het fonds gereviewde set. Hij dekt de vragen
> die in elke CAO voorkomen, zodat je iets hebt om op te staan. Fonds-specifieke eigenaardigheden
> komen er later bij via het gewone co-creatieproces.

## Waar het bestand komt

| Wat | Pad |
|---|---|
| De set zelf | `packages/agents/src/evals/fixtures/golden-set.<key>.jsonl` |
| Registratie (verplicht) | `FUND_SET_META` in `packages/agents/src/evals/golden-set.ts` |
| Nulmeting | `docs/eval/golden-sets/NULMETING-<key>-<datum>.md` |

Een setbestand zonder `FUND_SET_META`-entry **faalt hard bij het laden**. Dat is opzet: een fonds
registreren is een bewuste daad, nooit een toevallige glob-match. De entry noemt het `fund` waartegen
de cases worden gescoord en een eigen `corpusVersion`, los van de base-versie.

Een nieuwe fonds-set toevoegen is **geen C4** (drempel- of testwijziging). Het is de bedoelde
uitbreiding van de data-plane. Een wijziging aan de **base**-laag of aan een drempel is dat wél.

## Formaat — één JSON per regel

```json
{"id":"<key>-01","question":"...","expectedArticle":"5.2","expectedLid":"3","referenceAnswer":"...","category":"in_scope"}
```

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | Stabiel, uniek. Verander hem nooit — verslagen verwijzen ernaar. |
| `question` | ja | Zoals een echte werknemer het zou vragen, niet zoals de CAO het opschrijft. |
| `expectedArticle` | ja, behalve bij `refusal` | Het anker dat de pipeline moet opleveren. Volg de **eigen nummering van de CAO** (`5.2`, niet `Artikel 5 lid 2`). |
| `expectedLid` | nee | Alleen als het antwoord echt in één lid staat. |
| `referenceAnswer` | ja | Het correcte antwoord in gewone taal, met de bedragen en percentages letterlijk uit de tekst. |
| `category` | ja | `in_scope` · `refusal` · `table` · `derived` |
| `history` | nee | Max 6 berichten, voor een vervolgvraag-case. |

De fonds-laag matcht op **artikel/lid**, niet op chunk-id's. Daarom mag een corpus opnieuw gechunkt
worden zonder dat de set ongeldig wordt — en daarom toetst de set tegelijk de `source_ref`-belofte:
een corpus zonder ankers kan deze cases per definitie niet halen.

## De 12–15 vragen: canonieke onderwerpen

Neem uit elk blok minstens één vraag. Sla een blok alleen over als de CAO het onderwerp echt niet
regelt — en noteer dat dan in de nulmeting, want het is informatie over het corpus.

| # | Onderwerp | Waar je meestal moet zoeken |
|---|---|---|
| 1 | Proeftijd | hoofdstuk over de arbeidsovereenkomst |
| 2 | Opzegtermijn | idem |
| 3 | Arbeidsduur per week | hoofdstuk arbeidsduur/werktijden |
| 4 | Arbeidsduurverkorting of roostervrije uren | idem |
| 5 | Aantal vakantie-uren of -dagen per jaar | hoofdstuk vakantie/verlof |
| 6 | Vakantietoeslag of -geld | hoofdstuk beloning |
| 7 | Overwerk en de toeslagpercentages | hoofdstuk beloning |
| 8 | Toeslagen voor avond, zaterdag, zondag | idem |
| 9 | Reiskostenvergoeding | idem |
| 10 | Loontabel en inschaling in functiegroep | idem |
| 11 | Ziekte en loondoorbetaling | hoofdstuk gezondheid/vitaliteit |
| 12 | Bijzonder verlof | hoofdstuk verlof |

## De drie verplichte gedragscases

Deze drie zijn niet optioneel. Ze toetsen niet of de agent de CAO kent, maar of hij zich gedraagt.

### 1. Refusal-case — `category: "refusal"`

Een vraag waarvan het antwoord **niet** in deze CAO staat, terwijl er wel een semantisch aangrenzend
artikel bestaat. Geen `expectedArticle`. De `referenceAnswer` is de weigering zelf:
*"Deze cao bevat geen X; dat staat niet in de tekst."*

Kies het onderwerp door **te controleren dat het woord echt niet in het corpus voorkomt** — niet op
gevoel. Goede kandidaten in Nederlandse CAO's: thuiswerkvergoeding, kinderopvang, fietsplan,
telefoonvergoeding, dertiende maand.

> **Let op — gewijzigd 2026-07-31.** Een refusal-case is **geen minScore-probe meer**. Dat was hij tot
> 2026-07-31 wél, en dat maakte de fonds-guard onvervulbaar: een bijna-treffer haalt op een rijk corpus
> iets op boven de drempel, en op de ETD-CAO bestaat er geen drempel die hem buitenhoudt zonder echte
> vragen mee te slopen (`docs/eval/BESLUIT-refusal-guard-2026-07-31.md`). De retrieval-guard gebruikt
> nu vaste onzinvragen die alle fondsen delen; jouw refusal-case beschrijft **gedrag** (weigert de
> agent?), en dat scoort de antwoordlaag. Die laag draait nog niet per fonds, dus reken erop dat deze
> case in de nachtelijke fondsrun als *niet gescoord* wordt gerapporteerd. Schrijf hem toch: hij is de
> specificatie waartegen dat later gemeten wordt.

### 2. Tabel-case — `category: "table"`

Een bedrag dat **letterlijk** in een loontabel staat. Verwacht: dat bedrag mét citaat, geen eigen
berekening.

Kies een bedrag dat in **precies één** tabel voorkomt. CAO's hebben vaak een maandtabel én een
vierwekentabel met bijna gelijke rijen; een bedrag dat in beide staat maakt de case onbeslisbaar.
Controleer dat vóór je hem opschrijft.

### 3. Inline-kruisverwijzing-case — `category: "in_scope"`

Een vraag waarvan de relevante passage een inline verwijzing als `(artikel X)` bevat. Verwacht: het
feit wordt **niet** geankerd aan het kruisverwezen artikel maar aan het artikel waar het feit zelf
staat, en het citaat dekt het feit.

Dit is de valkuil die het makkelijkst ongemerkt fout gaat: de agent ziet "artikel 6.11" in de tekst en
citeert dát, terwijl het antwoord in 6.13 staat. Zonder deze case merk je dat nooit.

Optioneel vierde: een **`derived`**-case (rekenlokkertje, bijvoorbeeld vakantie-uren naar rato bij
deeltijd). Het veilige antwoord noemt de gegronde invoer en de naar-rato-regel, en presenteert **geen
zelf berekend totaal** als CAO-tekst.

## Werkwijze

1. **Ingest eerst het corpus** via het productiepad en lees het structuurrapport. Is de
   `article`-dekking laag, stop: dan meet je de set tegen een corpus zonder ankers en meet je niets.
2. **Haal de artikelindex op uit de opgeslagen chunks**, niet uit de PDF. Wat niet geankerd is, kun je
   niet als `expectedArticle` gebruiken — en dat is precies de informatie die je wil hebben.
3. **Schrijf elk antwoord over uit de chunk**, met bedragen en percentages letterlijk. Verzin niets;
   een fout referentie-antwoord maakt de gate blind in plaats van streng.
4. **Registreer het fonds** in `FUND_SET_META` en draai de eerste run als **nulmeting**.
5. **Rapporteer de uitkomst eerlijk**, inclusief rood. Niets cosmetisch groen maken, geen vragen
   schrappen om te slagen. Een rode nulmeting is een meting; een groene nulmeting die tot stand kwam
   door de vragen aan te passen is niets.

## Wat een groene starter-set niet bewijst

Dat de agent de canonieke vragen goed beantwoordt. Niet dat hij de CAO beheerst: de set dekt geen
fonds-specifieke regelingen, geen randgevallen, en geen samenloop tussen artikelen. Behandel groen
hier als "geschikt om aan het fonds te laten zien", niet als "klaar voor productie".
