# Baseline-run 2026-07-30 — gemeten, **niet bevroren**

> **Hoort bij:** `docs/plans/PLAN-gate-scalability-test.md` P0.2.
> **Verdict: deze run is NIET geschikt als baseline.** Eén verplichte gate is rood
> (`G3-fund [demo]`). De baseline-integriteitsinvariant (`GATE-ARCHITECTURE.md` §4.4) verbiedt dat een
> rode run de lat wordt, en het vloerprincipe (C4) verbiedt de drempel te verlagen om hem groen te
> maken. Dit document legt de meting vast; P0.2 blijft open.
> **Labels:** [gemeten] · [feit] · (aanname)

---

## 1. Runcondities [gemeten]

| Veld | Waarde |
|---|---|
| Commit | `70e7404` (branch `fix/eval-gate-enforcement`) |
| Working tree | **schoon** — het lopende MCP-werk was geparkeerd in een stash en is daarna byte-identiek teruggezet (39 bestanden, hashes vóór/ná gelijk) |
| Gestart / geëindigd | 2026-07-30 14:28:42Z → 15:08:46Z |
| **Duur** | **2.404 s (40 min 4 s)** |
| Profiel | CI-nightly-equivalent: `EVAL_REQUIRE_ALL=1`, `EVAL_REQUIRE_DB=1`, `EVAL_JUDGE_SAMPLES=3`, `EVAL_GENERATION_SAMPLES=3`, `EVAL_WRITE_BASELINE` niet gezet |
| Generator | `mistral-large-2512` (= `DEFAULT_LLM_MODEL`) |
| Judge | `mistral-large-2512`, 0 parse-retries |
| Embedding / rerank | `qwen3-embedding-8b` @ 4096 dim (gepind) |
| Corpus | base `v4`; fondslagen `etd-1`, `demo-1` |
| Artefact | `packages/agents/eval-report.json` (schemaVersion 6) |

---

## 2. Uitslag per gate [gemeten]

| Gate | Status | Kernwaarden |
|---|---|---|
| `G1-contract` | **passed** | 15/15 checks |
| `G2-retrieval` | **passed** | hit@1 95,8% · recall@3 100% · recall@5 100% · MRR 0,979 · rerank 0 failures · MRR-delta +0,000 |
| `G2-multi-turn` | **passed** | 4/4 elliptische cases; 0 van 4 onverifieerbaar na `verifyAndBuild` |
| `G2-answer` | **passed** | alle 11 absolute floors gehaald; 0 unverified citaties, 0 dangling markers, 0 under-refusals. Regressie: relevance 0,968 (baseline 0,971), completeness 0,932 (baseline 0,919), rest gelijk |
| `G3-pipeline` | **passed** | hit@1 95,8% · MRR 0,979 · minScore-guard 3/3 probes leeg @ 0,48 |
| `G3-fund [etd]` | **passed** | hit@1 95,7% · recall 100% · MRR 0,978 · refusal-guard 3/3 |
| `G3-fund [demo]` | **FAILED** | hit@1 **0,0%** · recall@3 **0,0%** · recall@5 **0,0%** · MRR **0,000** (drempels 0,70/0,80/0,80/0,75) · refusal-guard 2/2 **wel** goed |
| `G3-isolation` | **passed** | 3 fondsen geprobed, 0 cross-fund chunks |

Overige waarnemingen: de G2-retrieval- en G3-cijfers reproduceren de nulmetingen van 2026-07-21 uit
`GATE-ARCHITECTURE.md` §G2/§G3 tot op de decimaal. De pipeline is op de bestaande corpora dus stabiel
over negen dagen en vier commits.

---

## 3. De rode gate — diagnose voor zover vastgesteld

**Wat er gemeten is:** 11 beantwoordbare `demo`-vragen, geen enkele vindt het verwachte artikel, ook
niet in de top-5. Tegelijk is de refusal-guard groen (2/2 out-of-corpus-probes leeg) en levert de
isolatie-probe voor fonds `demo` 10 chunks op.

**Waarom dat opvallend is:** het `demo`-corpus (`scripts/ingest/demo-corpus/cao-fictief.md`, 11
artikelen) is zó klein dat topK=5 ruwweg de helft van het corpus teruggeeft. `recall@5 = 0` betekent
dan dat het verwachte artikel structureel niet gematcht wordt — dat gedraagt zich als een
**metadata-/matchingprobleem, niet als een semantisch retrieval-probleem**. Semantisch falen zou
op 11 vragen vrijwel zeker íets raken.

**Uitgesloten:** de chunker zou deze koppen moeten herkennen. De bron gebruikt kale regels in de vorm
`Artikel 2 — Looptijd`; `isHeading` matcht `/^(artikel|hoofdstuk|bijlage|paragraaf)\b/i` en
`extractArticle` matcht `/^artikel\s+(\d+[a-z]?)/i` → `"2"`, wat overeenkomt met de
`expectedArticle: "2"` in `golden-set.demo.jsonl`. Op basis van de repo-code zou dit dus moeten
werken.

**Bevestigd [gemeten]:** `chunks.article` en `chunks.source_ref` zijn **null voor alle 10**
`demo`-chunks, terwijl 6 van die 10 nog wél een regel-leidende `Artikel N` in hun tekst hebben. De
structuur zit dus in de bron; alleen de metadata-kolommen zijn leeg — het beeld van een ingest van
vóór de feature.

**Classificatie volgens Fase 4 stap 2 — vastgesteld:** `demo` is **vals-rood** (ingeladen 2026-07-03,
twee dagen vóór de CAO-bewuste chunking landde), maar de diagnose legde daaronder een **echt-rood**
bloot dat geen gate bewaakt: de productie-ingest haalt uit een echte CAO-PDF geen enkel
structuuranker. Volledige uitwerking, bewijs en opties:
`docs/eval/diagnosis-fund-article-metadata-2026-07-30.md`.

**Waarom dit los staat van de nulmeting van 21 juli:** de `demo`-fondslaag is later toegevoegd
(Fase 5, tenant zero). De claim "integraal groen" in `GATE-ARCHITECTURE.md` dekt `etd`, niet `demo`.
Deze rode gate is dus geen regressie van 21 juli maar een gat dat sindsdien open staat — en dat
in CI alleen nachtelijk zichtbaar wordt, waar een fail nu **visibility** is en geen blokkade
(besluit B4).

---

## 4. Bevindingen over het meetinstrument zelf

Twee dingen die deze run blootlegde en die P0.2 raken:

1. **Het run-artefact is buiten CI niet zelf-identificerend** [feit]. `eval-report.json` heeft een
   `commitSha`-veld, maar dat wordt gevuld uit `GITHUB_SHA` en is bij een lokale run dus `null`.
   Samen met het al bekende gat in `baseline.json` (geen commit, geen model, geen datum) betekent dat:
   een lokaal gemeten baseline is alleen reproduceerbaar als de commit **extern** wordt vastgelegd —
   zoals in §1 van dit document.
2. **Kosten per run zijn niet uit het artefact te halen** [feit]. Het rapport bevat geen kostenveld,
   dus het richtsnoer uit Fase 6 (≤ ~5% van de jaarprijs) is nu alleen via Langfuse te toetsen. Voor
   Fase 6 is dat een aandachtspunt: óf de kosten in het artefact opnemen, óf de Langfuse-uitlezing
   als vaste stap in het protocol zetten. Duur is wél gemeten: **40 minuten voor een volledige run**,
   wat bij drie corpora × meerdere runs een reële factor is in de schaalbaarheidsvraag.

Eén observatie zonder verdict: **generator en judge zijn hetzelfde model** (`mistral-large-2512`, de
judge is een hardcoded literal in `judge.ts`). Het oorspronkelijke plan-item P4 heette
"judge ≠ generator". Of zelf-beoordeling hier acceptabel is, is een besluit dat nergens expliciet is
vastgelegd — het staat hier gesignaleerd, niet beoordeeld.

---

## 5. Wat P0.2 nog nodig heeft

| # | Nodig | Waarom |
|---|---|---|
| 1 | `G3-fund [demo]` classificeren (echt-rood of vals-rood) | Bepaalt of er een pipeline-fix nodig is of een corpus-herIngest |
| 2 | Na de fix één **groene** volledige run | Een rode run mag de lat niet worden (§4.4) |
| 3 | Kostenbepaling via Langfuse voor die run | De DoD van P0.2 vraagt kosten én duur |

Tot dan blijft Fase 2 geblokkeerd: zonder vaste groene referentie is "portabiliteit" niet meetbaar —
je zou de nieuwe corpora vergelijken met een lat die zelf niet vaststaat.
