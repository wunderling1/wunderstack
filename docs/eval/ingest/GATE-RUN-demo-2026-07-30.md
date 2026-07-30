# Gate-run na de demo re-ingest — `G3-fund [demo]`

> **Hoort bij:** Fase 2 van het ingest-herstelplan · **Datum:** 2026-07-30 · **Labels:** [gemeten] · [feit] · (aanname)
> **Runcondities:** commit `79894c1`, schone tree (werk geparkeerd, byte-identiek teruggezet),
> nachtelijke CI-condities (`EVAL_REQUIRE_DB=1`, `EVAL_REQUIRE_ALL=1`, `EVAL_JUDGE_SAMPLES=3`,
> `EVAL_GENERATION_SAMPLES=3`) · **Duur:** 37 min 44 s · **Log:** `gate-run-demo-2026-07-30.log`
> **Uitkomst:** `EVAL_EXIT=1` — **niet groen**, dus **P0.2 blijft open**.

**Kort:** de re-ingest heeft gedaan wat hij moest doen. `G3-fund [demo]` gaat van 0% naar **100% op
alle vier de retrieval-maten**. Er blijft één check rood, en die was in de baseline groen — maar
vacuüm groen. We hebben een nietszeggende groene ingeruild voor een informatieve rode.

---

## 1. Voor en na [gemeten]

| Check | Baseline (`docs/eval/baseline-run-2026-07-30.log`) | Na re-ingest |
|---|---|---|
| `fund "demo"` retrieval hit@1 ≥ 70,0% | **FAIL** (0%) | **PASS — 100,0%** |
| `fund "demo"` retrieval recall@3 ≥ 80,0% | **FAIL** (0%) | **PASS — 100,0%** |
| `fund "demo"` retrieval recall@5 ≥ 80,0% | **FAIL** (0%) | **PASS — 100,0%** |
| `fund "demo"` retrieval MRR ≥ 0,750 | **FAIL** (0) | **PASS — 1,000** |
| `fund "demo"` refusal-guard ≥ 1 lege probe | PASS (2/2 leeg) | **FAIL — 0/2 leeg** |

Alle overige gates bleven groen: G1-contract, G2-retrieval (incl. baseline-regressies),
G2-multi-turn, G2-answer (alle 20 checks), G3-pipeline, `G3-fund [etd]` (hit@1 95,7%, MRR 0,978) en
G3-isolation (0 cross-fund op alle drie fondsen, nu 15 chunks per fonds).

## 2. De omgeslagen check was vacuüm groen [feit]

In de baseline haalden de twee out-of-corpus-probes 0 hits op — net als alle elf inhoudelijke vragen.
Het opgeslagen corpus was een niet-passend placeholder-bestand, dus niets matchte met niets. De
refusal-guard stond groen omdat retrieval categorisch niks vond, niet omdat hij out-of-corpus-vragen
kon onderscheiden. Dat is precies het patroon dat beslisregel **R7** benoemt: een groene die niets
bewijst omdat er niets te bewijzen viel.

Nu retrieval wél werkt (100% op de elf inhoudelijke vragen) halen de twee probes — `demo-f12`
kinderopvang en `demo-f13` pensioen — allebei iets op boven `minScore = 0.48`.

**De maat is dus niet verslechterd; hij is voor het eerst meetbaar geworden.**

## 3. Wat de rode check wél en niet betekent

**Niet:** dat de agent een verkeerd antwoord geeft op een out-of-corpus-vraag. De weigerbelofte zit
in de antwoordlaag, en die is groen gebleven in deze run: over-refusal-rate 0,0%,
refusal-calibration 96,8% (drempel 90%), hard-hallucination 100%. Wat faalt is de **pre-LLM-snelweg**
("retrieval levert niets → weiger zonder LLM-call"), niet de weigering zelf.

**Wel:** dat op dit corpus de goedkope weigerroute niet aanslaat, dus elke out-of-corpus-vraag een
LLM-call kost, en dat de agent moet weigeren op basis van context die semantisch in de buurt ligt.

Er zijn twee lezingen en ik kies er geen van:

1. **De guard is voor dit corpusformaat mis-gespecificeerd.** Bij 32 chunks is de vectorruimte dun;
   een willekeurige Nederlandse arbeidsvoorwaardenvraag komt dan makkelijk boven 0,48 uit. De guard
   werkt aantoonbaar op de 31 gecureerde fixture-passages (3/3 leeg) en op `etd` (3/3 leeg), maar
   dat zijn andere corpora. (aanname: welke chunks de probes precies ophalen is **niet gemeten** —
   het run-artefact registreert alleen aantallen, en extra probe-calls vielen buiten het
   goedgekeurde kostenkader.)
2. **Het signaal is echt en het corpus is te klein om te weigeren.** Een fictieve CAO van 88 regels
   heeft over kinderopvang en pensioen niets te zeggen, maar wel over reiskosten, bijzonder verlof
   en salaris — begrippen die dicht genoeg liggen om boven de drempel te komen.

## 4. Open besluit — de rode blijft staan

**Besloten op 2026-07-30:** de refusal-guard op `demo` blijft rood en wordt vastgelegd als open
besluit, niet weggenomen. Threshold-calibratie staat buiten scope van dit plan. **Gevolg voor Fase 4:**
de promotiekoppeling geeft voor fonds `demo` een **NO-GO** zolang dit besluit niet gevallen is — wat
precies de bedoeling is van die koppeling: een openstaande rode blokkeert promotie naar dát fonds,
zonder `main` te blokkeren (D5). Op te nemen in `GATE-ARCHITECTURE.md` bij de open besluiten (Fase 6).

## 5. Waarom ik dit niet heb "opgelost"

`minScore` verlagen of de guard versoepelen zou de rode wegnemen. Dat is categorie **C4** uit het
interventielog: *"Rode vlag — mag niet. Een rode score op nieuw corpus repareer je in de pipeline,
nooit in de drempel."* Threshold-calibratie staat expliciet buiten scope van dit plan. De rode blijft
dus staan tot er een besluit over is.

## 6. Gevolg voor P0.2

**P0.2 kan niet dicht.** De eis is één groene volledige run als bevroren baseline; deze run eindigt
op `EVAL_EXIT=1`. Wat wél gesloten is: de oorzaak van het rode `G3-fund [demo]` uit de baseline is
weg, en de resterende rode is een andere, nieuw zichtbare kwestie met een eigen besluit.

Twee nevenbevindingen over het meetinstrument zelf, relevant voor Fase 4:

- `eval-report.json` bevat `"commitSha": null` bij een lokale run (de waarde komt uit `GITHUB_SHA`).
  Een resultaat dat een promotie moet kunnen blokkeren, moet zichzelf kunnen identificeren.
- Het artefact registreert bij de refusal-guard alleen `probes`/`empty`/`required`, niet **welke**
  chunks werden opgehaald. Bij een rode guard is dat precies wat je wil weten.
