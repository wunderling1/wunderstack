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

Vier runs van 31 juli, op vrijwel dezelfde code (PR #10 raakt geen prompt, model of retrieval):

| run | uitloop-cases | `finishReason: length` | hard-hallucinatie | `etd-026` geweigerd? |
|---|---|---|---|---|
| `30641602708` 15:08 · DB-dispatch, groen | 3 | 3 | geen | nee |
| `30644173343` 15:44 · PR #10, **rood** | 5 | 4 | `etd-026` | nee |
| `30646496343` 16:17 · herstart, groen | **8** | 8 | geen | nee |
| `30649427223` 17:00 · `main`, groen (judge 3) | 6 | 5 | geen | nee |

Drie conclusies die je alleen uit de vergelijking krijgt:

- **`etd-001`, `etd-005` en `etd-010` lopen in alle vier de runs uit.** Stabiel gedrag, geen variantie.
- **De omvang varieert sterk en is niet gekoppeld aan de gate-kleur**: de run met de mééste uitloop
  (8 van 31, allemaal tegen het plafond) was gróén, de rode run had er 5. Een groene antwoordgate zegt
  dus niets over dit defect.
- **`etd-026` wordt in alle vier de runs beantwoord in plaats van geweigerd.** De `under-refusal`-gate
  staat één geantwoorde refusal-case toe, dus die gate zit **elke run op zijn plafond**. Dat verklaart
  waarom de nachtelijke run op `main` (11:36, 2 van 3) omviel: één extra draai is genoeg.

Omvang per uitloop: ruwe antwoorden van 6100–6800 tekens, terwijl het echte antwoord in de eerste
136–470 tekens staat. De rest is verzonnen documentatie.

## 2. Waarom dit één keer de gate sloopte [feit]

`etd-026` is een **refusal**-case: "Hoeveel weken zwangerschapsverlof krijg ik?" Het aantal weken staat
niet in de CAO Elektrotechnische Detailhandel, dus het juiste antwoord is weigeren. In de rode run deed
het model dit:

- het noemde **16 weken**, met een uitsplitsing in 6 weken vóór en 10 weken ná de bevalling. Dat komt
  uit algemene kennis van de Wet Arbeid en Zorg en staat nergens in het corpus — dit is de invented
  amount waar de gate op aanslaat;
- en het liep daarna door in een verzonnen voorbeeld over de CAO Gehandicaptenzorg, artikel 3.4.

**Correctie op een eerdere lezing van dit log.** De bron die het model aanhaalt is *niet* verzonnen:
`chunk_id: "wet-arbeid-zorg"` bestaat wel degelijk — artikel 5.9 van deze CAO, met als inhoud "De Wet
Arbeid en Zorg is van toepassing" — en het geciteerde fragment staat er letterlijk in. Het citaat is dus
correct; alleen het getal is verzonnen. Dat maakt de case lastiger dan hij lijkt: het corpus bevát een
verwijzing naar de wet, maar niet de duur.

Dat is precies wat de hard-hallucinatiegate hoort te vangen, en hij ving het: 96,8% bij een lat van 98%.
Met 31 cases betekent die lat **nul fouten**, dus één case is genoeg. De regressiecheck bleef groen
(0,968 tegen baseline 1,000, binnen 5%), dus alleen de absolute vloer sloeg aan.

**Wat het model in de groene runs doet, is bijna goed** — en scoort toch nul. Daar zegt het: "De CAO
verwijst voor zwangerschapsverlof naar de Wet Arbeid en Zorg [1]. Voor het exacte aantal weken kun je
terecht bij je werkgever of het UWV", met datzelfde correcte citaat. Geen verzonnen getal, dus
hard-hallucinatie 1,0 — maar `faithfulness` en `refusalCalibration` staan op **0**, want de golden set
verwacht een weigering. Of een verwijzing-met-doorverwijzing hier als weigering moet tellen, is een
ontwerpvraag over de golden set en niet iets wat het model fout doet.

Hoe dan ook zit de `under-refusal`-gate hierdoor **elke run op zijn plafond** van één: `etd-026` telt
altijd mee. Eén willekeurige tweede draai elders kantelt de uitslag, zoals in de nachtelijke run op
`main` (2 van 3).

## 3. Bereikt die uitloop de gebruiker? (aanname, deels gemeten)

In alle vijf de gevallen begint de uitloop **na** het `<<<CITATIONS>>>`-blok (gemeten: positie van de
marker ligt steeds voorbij die van het blok). Wie het antwoord afkapt bij dat blok, serveert de rommel
dus niet. Wat wél bij de gebruiker zou komen bij `etd-026` is het antwoord vóór het blok — en dat is
inhoudelijk fout, want het beantwoordt een vraag die buiten het corpus valt met wetgeving en een
verzonnen bron.

Niet gemeten: of elke serveerroute (widget, REST, MCP) daadwerkelijk op dat blok afkapt.

## 4. Wat dit betekent voor de gate-stabiliteit

De variantie in de antwoordlaag die P0.2 open houdt, is hiermee deels **mechanisch verklaard** in plaats
van als judge-ruis afgedaan, en het gaat om twee losse dingen:

1. **Een gate zonder marge.** `under-refusal` staat één geantwoorde refusal-case toe en `etd-026` vult
   die plek in elke gemeten run. De gate is dus permanent verzadigd: hij meet niet of het weigergedrag
   goed is, hij meet of er toevallig een tweede geval bijkomt.
2. **Een generatie die doorschiet.** Drie tot acht van de 31 antwoorden lopen door tot het tokenplafond.
   Of dat een gate omvergooit hangt ervan af welke case het raakt — niet van hoe erg het is. De run met
   de meeste uitloop was groen.

Zolang beide bestaan, is een groene antwoordgate deels geluk, en is één rode run geen bewijs van een
regressie.

## 5. Kandidaat-reparaties (geen keuze gemaakt)

- **Stopcontainment**: het model expliciet laten afsluiten met een eigen eindmarkering en die als
  `stop`-sequence meegeven, zodat generatie na het citatieblok onmogelijk is. Raakt de prompt, dus
  raakt alle scores.
- **`maxTokens` verlagen** voor de antwoordcall. Snijdt de kosten maar niet de oorzaak: het antwoord
  blijft dan afgekapt in plaats van netjes beëindigd.
- **Niets doen aan de generatie en `etd-026` los behandelen.** Laat de kosten en de wankele gate staan.

Kosten van niets doen zijn wél meetbaar: drie tot vier antwoorden per run vullen het volledige
uitvoerbudget in plaats van ~200 tekens, en dat gebeurt ook in productie, niet alleen in de eval.
