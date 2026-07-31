# Bevinding — de generatie loopt door na het antwoord en vult het tokenplafond

> **Datum:** 2026-07-31 · **Labels:** [gemeten] · [feit] · (aanname)
> **Status:** gemeten, niet gerepareerd. Reparatie raakt productiegedrag (promptcontainment of
> `maxTokens`) en verschuift daarmee gate-scores en mogelijk de baseline — eigen besluit.

**Kort.** Bij een deel van de Gate C-cases stopt het model niet na zijn antwoord. Het zet het
citatieblok neer en begint daarna een **nieuw, verzonnen voorbeelddocument** te genereren — compleet met
een `+++++ examples/cao/10.md`-scheiding, een `<context>`-blok en artikelen uit een CAO die hier niets te
zoeken heeft — tot het tokenplafond valt. Meestal is dat alleen geldverspilling. Eén keer besmette het
het antwoord zelf, en toen viel de zero-tolerance hard-hallucinatiegate om.

## 1. Wat er gemeten is [gemeten]

Twee runs van dezelfde dag, op vrijwel dezelfde code, judge 1:

| run | uitloop-cases | `finishReason: length` | hard-hallucinatie |
|---|---|---|---|
| `30641602708` (groen, DB-run) | `etd-001`, `etd-005`, `etd-010` | 3 | geen |
| `30644173343` (rood, PR #10) | dezelfde drie + `etd-014`, `etd-026` | 4 | `etd-026` |

`etd-001`, `etd-005` en `etd-010` lopen in **beide** runs uit. Dat is dus geen variantie maar stabiel
gedrag. Wat varieert, is welke cases er nog bij komen — en dat bepaalt of een gate omvalt.

Omvang per uitloop: ruwe antwoorden van 6100–6800 tekens, terwijl het echte antwoord in de eerste
136–470 tekens staat. De rest is verzonnen documentatie.

## 2. Waarom dit één keer de gate sloopte [feit]

`etd-026` is een **refusal**-case: "Hoeveel weken zwangerschapsverlof krijg ik?" staat niet in de CAO
Elektrotechnische Detailhandel, dus het juiste antwoord is weigeren. In de rode run deed het model dit:

- het antwoordde uit algemene kennis ("volgens de Wet Arbeid en Zorg 16 weken"), niet uit de context;
- het verzon daarbij een bron: `chunk_id: "wet-arbeid-zorg"` met quote `"Wet Arbeid en Zorg is van
  toepassing"` — die chunk bestaat niet;
- en het liep daarna door in een verzonnen voorbeeld over de CAO Gehandicaptenzorg, artikel 3.4.

Dat is precies wat de hard-hallucinatiegate hoort te vangen, en hij ving het: 96,8% bij een lat van 98%.
Met 31 cases betekent die lat **nul fouten**, dus één case is genoeg. De regressiecheck bleef groen
(0,968 tegen baseline 1,000, binnen 5%), dus alleen de absolute vloer sloeg aan.

Deze case is ook de `under-refusal` die op de rand balanceert: de gate staat 1 geantwoorde
refusal-case toe en dit is hem. Vandaar dat dezelfde case in de nachtelijke run op `main` (2 van 3) de
uitslag kantelde.

## 3. Bereikt die uitloop de gebruiker? (aanname, deels gemeten)

In alle vijf de gevallen begint de uitloop **na** het `<<<CITATIONS>>>`-blok (gemeten: positie van de
marker ligt steeds voorbij die van het blok). Wie het antwoord afkapt bij dat blok, serveert de rommel
dus niet. Wat wél bij de gebruiker zou komen bij `etd-026` is het antwoord vóór het blok — en dat is
inhoudelijk fout, want het beantwoordt een vraag die buiten het corpus valt met wetgeving en een
verzonnen bron.

Niet gemeten: of elke serveerroute (widget, REST, MCP) daadwerkelijk op dat blok afkapt.

## 4. Wat dit betekent voor de gate-stabiliteit

De variantie in de antwoordlaag die P0.2 open houdt, is hiermee deels **mechanisch verklaard** in plaats
van als judge-ruis afgedaan. Een generatie die soms doorschiet, produceert soms een judge-zichtbaar
defect. Zolang de uitloop bestaat, is een groene antwoordgate deels geluk.

## 5. Kandidaat-reparaties (geen keuze gemaakt)

- **Stopcontainment**: het model expliciet laten afsluiten met een eigen eindmarkering en die als
  `stop`-sequence meegeven, zodat generatie na het citatieblok onmogelijk is. Raakt de prompt, dus
  raakt alle scores.
- **`maxTokens` verlagen** voor de antwoordcall. Snijdt de kosten maar niet de oorzaak: het antwoord
  blijft dan afgekapt in plaats van netjes beëindigd.
- **Niets doen aan de generatie en `etd-026` los behandelen.** Laat de kosten en de wankele gate staan.

Kosten van niets doen zijn wél meetbaar: drie tot vier antwoorden per run vullen het volledige
uitvoerbudget in plaats van ~200 tekens, en dat gebeurt ook in productie, niet alleen in de eval.
