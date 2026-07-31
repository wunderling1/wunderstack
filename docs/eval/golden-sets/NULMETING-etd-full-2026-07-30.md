# Nulmeting — golden set `etd-full` op het echte ETD-corpus

> **Hoort bij:** Fase 5 van het ingest-herstelplan · **Datum:** 2026-07-30 · **Labels:** [gemeten] · [feit] · (aanname)
> **Runcondities:** commit `28b1911`, nachtelijke CI-condities (`EVAL_REQUIRE_DB=1`,
> `EVAL_REQUIRE_ALL=1`, `EVAL_JUDGE_SAMPLES=3`, `EVAL_GENERATION_SAMPLES=3`) ·
> **Duur:** 54 min 12 s · **Log:** `nulmeting-etd-full-2026-07-30.log` ·
> **Artefact:** `packages/agents/eval-report.json` (`generatedAt` 2026-07-30T20:32:11Z)
> **Uitkomst:** `EVAL_EXIT=1` — retrieval groen, refusal-guard rood.

**Kort:** de eerste golden set die volgens het startersjabloon op een echt, net opnieuw geïngest
CAO-corpus is gebouwd, komt **in één keer door alle vier de retrieval-drempels** (hit@1 92,9%,
MRR 0,929) en **valt om op de refusal-guard**. Dat tweede is geen verrassing meer: dezelfde guard
staat sinds Fase 2 ook rood op `demo`. Hij is nu op twee onafhankelijke fondsen rood en op één groen,
en dat maakt hem tot een eigenschap van de pipeline in plaats van een eigenaardigheid van één corpus.

---

## 1. Wat er gemeten is [gemeten]

Golden set `etd-full`: 15 cases over fonds `elektronische-detailhandel`, corpus `vetd-full-1`,
fixture-hash `bef6a7a1cdf24d494b943110b05fb300717bfc6948f3364e0b4ce8cb0c480b9c`.
Verdeling: 12 `in_scope`, 1 `derived`, 1 `table`, 1 `refusal` — dus 14 beantwoordbare vragen plus
één out-of-corpus-probe.

| Maat | Drempel | Gemeten | Uitkomst |
|---|---|---|---|
| hit@1 | ≥ 70,0% | **92,9%** | PASS |
| recall@3 | ≥ 80,0% | **92,9%** | PASS |
| recall@5 | ≥ 80,0% | **92,9%** | PASS |
| MRR | ≥ 0,750 | **0,929** | PASS |
| refusal-guard | ≥ 1 lege probe | **0 van 1 leeg** | **FAIL** |

Alle overige gates bleven groen: G1-contract (15/15), G2-retrieval inclusief de
baseline-regressies (11/11), G2-multi-turn (13/13), G2-answer (21/21), G3-pipeline (5/5),
`G3-fund [etd]` (5/5) en G3-isolation (0 cross-fund op alle drie fondsen).

**De vier retrieval-maten zijn exact gelijk, en dat is informatief.** 92,9% = 13/14, en omdat MRR
gelijk is aan hit@1 staan alle dertien treffers op **plek 1** en valt de veertiende **volledig buiten
de top-5**. Het is dus geen rangordeprobleem maar één vraag waarvan het verwachte anker niet wordt
gevonden. (Welke case dat is, is **niet gemeten**: het run-artefact registreert alleen de
geaggregeerde maten per fonds, geen uitkomst per case — zie §4.)

## 2. Wat dit zegt over de schaalbaarheidsvraag [feit]

Dit is het eerste echte antwoord op "kan een nieuw fonds er zelf door?", want dit corpus is niet
gecureerd voor de gates: het is de productie-ingest van een publieke CAO-PDF, met de parse-fix uit
Fase 3 als enige voorbereiding.

- **Retrieval haalt de drempels zonder enige afstemming.** Geen drempel aangeraakt, geen
  chunk-parameter gedraaid, geen vraag herschreven om hem haalbaar te maken. Dat is het sterkste
  signaal uit deze fase.
- **De refusal-guard haalt ze niet, en doet dat reproduceerbaar.** Stand nu: `demo` 0/2 leeg,
  `etd-full` 0/1 leeg, `eval-fixtures`/`etd` 3/3 leeg. Twee echte, van elkaar onafhankelijke corpora
  falen; het enige corpus dat slaagt is de handgecureerde fixtureset. Dat verschuift de
  waarschijnlijke oorzaak van "dit corpus is te klein" (lezing 2 uit
  `../ingest/GATE-RUN-demo-2026-07-30.md` §3) naar "`minScore = 0.48` is gekalibreerd op de
  fixtureset en generaliseert niet". Het ETD-corpus is met 245 chunks bijna acht keer zo groot als
  `demo`, dus corpusgrootte verklaart het niet meer. (aanname: welke chunks de probe ophaalt en met
  welke score is nog steeds niet gemeten.)

**Gevolg voor de zelfservice-eigenschap:** een nieuw fonds landt op dit moment groen op retrieval en
rood op de guard. Zonder besluit over die drempel betekent "een fonds toevoegen" dus per definitie
"een rode gate toevoegen", en dat is geen zelfservice.

## 3. Niet gerepareerd, en waarom

`minScore` verlagen of de guard versoepelen zou beide rode checks wegnemen. Dat is categorie **C4**
uit het interventielog — een rode score op nieuw corpus repareer je in de pipeline, nooit in de
drempel. Threshold-calibratie staat buiten scope van dit plan. De rode blijft dus staan, nu met een
tweede meetpunt dat de diagnose scherper maakt.

## 4. Twee gaten in het meetinstrument, relevant voor Fase 4

Beide zijn hier concreet hinderlijk geworden, niet theoretisch:

1. **Geen uitkomst per case in het artefact.** Bij 13/14 wil je weten *welke* vraag miste. Nu is
   daarvoor een nieuwe retrieval-run nodig (14 embedding-calls) omdat het resultaat niet is bewaard.
2. **`commitSha` is `null` bij een lokale run** (de waarde komt uit `GITHUB_SHA`). Al gemeld na de
   demo-run; blijft staan. Een resultaat dat een promotie moet kunnen blokkeren, moet zichzelf
   kunnen identificeren.

## 5. Voorstel voor het startersjabloon — niet uitgevoerd

Het jabloon eist nu **één** refusal-case. Daardoor is de guard voor een nieuw fonds
alles-of-niets: 0 van 1 leeg is meteen rood, zonder enige marge, terwijl `etd` met 3 probes wel
ruimte heeft. Voorstel: het jabloon vraagt **drie** refusal-cases met een drempel van ≥ 2 lege
probes, gelijk aan wat `etd` feitelijk doet. Dat maakt de guard een maat in plaats van een munt.
Niet doorgevoerd — dit verandert een gate-drempel voor toekomstige fondsen en hoort daarom een
expliciet besluit te zijn.

## 6. Eerlijkheid over de runcondities

De run is gestart op een schone tree, maar het geparkeerde MCP-werk is **tijdens** de run
teruggezet, nadat de modules waren geladen. De gemeten waarden komen dus van commit `28b1911`, maar
de tree was niet de hele run schoon. Voor een run die als baseline moet dienen is dat niet goed
genoeg; voor een nulmeting van een nieuwe golden set is het bruikbaar. **P0.2 blijft open** — er is
nog steeds geen groene volledige run.
