# Verificatierun — de guard-correctie gemeten op de echte pipeline

> **Hoort bij:** `docs/eval/BESLUIT-refusal-guard-2026-07-31.md` (optie A, uitgevoerd) en het
> interventielog (C4-entry 2026-07-31).
> **Datum:** 2026-07-31 · **Labels:** [gemeten] · [feit]
> **Uitdrukkelijk géén P0.2-baseline** — zie §4 voor waarom, en wat er nog moet gebeuren.

**Kort:** de volledige suite staat voor het eerst **integraal groen**, inclusief de twee fonds-sets op
een echt geïngest corpus (`demo` en `etd-full`) die nooit eerder groen zijn geweest. De refusal-guard
haalt op alle drie de fondsen 3 van 3 lege out-of-corpus-probes. Daarmee is de voorspelling uit de
besluitnota gemeten in plaats van beredeneerd, en geeft `promote-check` voor het eerst GO.

---

## 1. Twee runs, één uitkomst

| # | Profiel | Duur | Uitkomst |
|---|---|---|---|
| 1 | nachtelijk (`EVAL_JUDGE_SAMPLES=3`, `EVAL_GENERATION_SAMPLES=3`) | 22 min 08 s | **Afgebroken** op `Mistral request failed (429): Rate limit exceeded` bij de start van G2-answer. `docs/eval/run-2026-07-31-429-aborted.log` |
| 2 | goedkoop (`EVAL_JUDGE_SAMPLES=1`, `EVAL_GENERATION_SAMPLES=2`) | 35 min 30 s | **`EVAL_EXIT=0`** — alle negen gates groen. `docs/eval/verify-guard-run-2026-07-31.log` |

Beide met `EVAL_REQUIRE_DB=1 EVAL_REQUIRE_ALL=1` op commit `963de45`, dus de DB-gates waren verplicht
en een skip zou rood zijn geweest.

**Over de 429 [feit].** Geen te krap retry-budget: elke LLM-call-site gebruikt
`{ baseDelayMs: 5000, maxAttempts: 8 }` — ruim tien minuten cumulatieve backoff — en `retry.ts:56`
merkt een 429 expliciet als retryable aan. De throttling hield dus langer dan dat aan. Run 2 liep
daarna 35 minuten zonder één 429, dus het was een venster, geen structureel gebrek. Categorie **C5**
(rerun) in het interventielog.

**Wat run 1 wél liet zien.** G1-contract, G2-retrieval en G2-multi-turn waren groen en reproduceerden
de baseline tot op de decimaal (hit@1 95,8%, MRR 0,979). Het artefact is via het foutpad geschreven
met alleen die drie gates en `passed: false`, en de promotieledger bleef onaangeroerd — een halve run
kan geen fondsresultaat produceren, precies zoals de Fase 4-afleiding bedoeld is.

## 2. Uitslag run 2 [gemeten]

| Gate | Status | Kern |
|---|---|---|
| G1-contract | PASS | — |
| G2-retrieval | PASS | hit@1 95,8% · recall@3/@5 100% · MRR 0,979; rerank 24/24 zonder failures, delta +0,000 |
| G2-multi-turn | PASS | 4/4 condensatie, 0 van 4 onverifieerbaar na `verifyAndBuild` |
| G2-answer | PASS | alle twaalf floors gehaald én alle regressiechecks binnen tolerantie (bij één judge-sample) |
| G3-pipeline | PASS | vier retrieval-drempels + minScore-guard ≥ 2 van 3 leeg |
| G3-fund [demo] | PASS | hit@1 **100%** · MRR **1,000** (11 vragen) · guard **3/3 leeg** |
| G3-fund [etd-full] | PASS | hit@1 **92,9%** · MRR **0,929** (14 vragen) · guard **3/3 leeg** |
| G3-fund [etd] | PASS | hit@1 95,7% · recall@3/@5 100% · MRR 0,978 (23 vragen) · guard **3/3 leeg** |
| G3-isolation | PASS | 0 cross-fund leakage over drie fondsen |

Elke fonds-set rapporteert nu ook zijn niet-gescoorde bijna-treffers (2 · 1 · 3), zowel in de console
als als `unscoredNearMissCases` in het artefact. Een case die geen gate voedt kan dus niet meer
gedekt lijken.

## 3. De promotieketen werkt end-to-end [gemeten]

De run schreef **3 van 3 fondsrecords** naar `docs/eval/gate-results/g3-fund.jsonl`, nu mét commit-SHA
(run 1 van 2026-07-30 had `commitSha: null` — dat gat is in Fase 4 gedicht). Daarna:

```
pnpm promote-check demo 963de45                        → GO
pnpm promote-check elektronische-detailhandel 963de45  → GO
pnpm promote-check eval-fixtures 963de45               → GO
```

Alle vijf de voorwaarden gehaald voor alle drie de fondsen: een `G3-fund`-resultaat dat bestaat,
groen is, zich aan de gevraagde commit koppelt, een structuurrapport heeft, en waarvan de laatste
ingest vóór de gate-run ligt. Op 2026-07-31 om 09:00 gaf dezelfde opdracht nog drie keer NO-GO om
drie verschillende redenen.

## 4. Wat dit niet is: P0.2 blijft open

Deze run gebruikte het **goedkope** profiel (judge 1, generatie 2). Voor de fondslaag maakt dat niets
uit — `G3-fund` is retrieval-only en raakt de judge niet aan — maar de baseline van dit project wordt
geschreven onder het nachtelijke profiel (`write-baseline` in `ci.yml` gebruikt judge 3 én generatie 3),
en de regressietoleranties in `baseline.json` zijn op mediaan-van-drie gekalibreerd. Een baseline uit
één sample zou dus een andere ruisverdeling hebben dan waar de drempels tegen ijken.

Voor P0.2 resteert daarom: **één run onder het nachtelijke profiel** die integraal groen eindigt, plus
het baseline-artefactdocument (`BASELINE-<fonds>-<datum>.md`) met scores, drempels, kosten, duur,
commit-SHA en corpusversies. De inhoudelijke blokkade is weg; wat rest is het profiel en de
administratie.

## 5. Wat hier bewust NIET is gedaan

Geen drempel aangeraakt, geen re-ingest, geen wijziging aan `baseline.json`. De guard-correctie zelf
zat al in commit `c795081`; deze run meet hem alleen.
