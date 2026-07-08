# PLAN-eval-gates.md — de eval-gates hard maken vóór Fase 9

> **Status: UITGEVOERD (7 jul 2026).** Alle acht punten zijn geïmplementeerd. `typecheck`,
> `lint` en Gate A + Gate B (met echte Scaleway-embeddings) draaien groen; Gate B bevestigt de
> artikel/lid-matching (hit@1 97,5%) en de nieuwe rerank-gate. De deterministische Gate C-scorers
> (hard-hallucination, refusal-richtingen, aggregatie) zijn offline geverifieerd. Twee dingen zijn
> geen code en blijven open: (1) een **live** Gate C end-to-end run tegen Mistral (brak lokaal af op
> een transient `fetch failed` in de generatielus — geen assertiefout); (2) **branch protection**:
> markeer de `verify`-check als required en zet de **merge queue** aan in de repo-instellingen — dat
> is de GitHub-kant van P1 die niet in de workflow-yaml kan. Details per punt onderaan onder
> "Uitvoering".
>
> **Los addendum bij `PLAN-v2.md` (Fase 9).** De eval-architectuur (A → B → C, offline
> Gate A, vóór/na-rerank, mix deterministisch + LLM-as-judge) staat en is verdedigbaar.
> Maar de gates zijn nu **strenger op papier dan in werkelijkheid**. Dit plan dicht die
> gaten. Doel: als de eval groen is, dan is dat een *echte* kwaliteitsgarantie — niet een
> promptdiff-detector die op forks zonder secrets vanzelf slaagt.
>
> Voer dit uit **vóór of als eerste stap ván** Fase 9. Bron van waarheid voor het gedrag
> blijft `packages/agents/src/evals/cao.eval.ts`, `judge.ts`, `clarify.ts`, `golden-set.ts`
> en `.github/workflows/ci.yml`. Leidend blijven `docs/PRODUCT_SPEC.md` en `.cursor/rules/*.mdc`.

## Zo voer je dit uit
- **Blokkers eerst.** P1, P5 en P7 (+ modelpinning uit P3) vóór de rest — anders bouw je
  binnen Fase 9 werk dat je meteen weer moet herbouwen.
- **Skipped ≠ passed** is het rode draad-principe: een gate die niet kon draaien in een
  context waar hij verplicht is, is een **fail**, geen no-op.
- **Reproduceerbaar meten:** pin modelversies vóór je drempels afstelt, anders is elke
  baseline giswerk.
- **Alle code, namen en commits in het Engels**; packages onder `@wunderstack/*` (`000-core.mdc`).
- **Soeverein blijft soeverein:** judge en generator blijven beide Mistral (EU). Geen niet-EU-model in het eval-pad.
- **Groen afsluiten:** `typecheck + lint + test` groen + commit per ingreep.

---

## Statusoverzicht (getoetst aan de code)

| # | Punt | Status in code vandaag | Ernst |
|---|------|------------------------|-------|
| P1 | Skip ≠ pass voor Gate B/C | **Kapot** — skip laat `allPassed` groen | Blokkerend |
| P5 | Faithfulness op één hoop, drempel 80% | **Bevestigd** — één LLM-float, geen harde-hallucinatie-gate | Blokkerend |
| P7 | Bron-identificatie op chunk-id i.p.v. artikel/lid | **Deels** — `expectedArticle`/`expectedLid` bestaan al; recall scoort nog op `id`; Gate B test fixtures i.p.v. echte pijplijn | Blokkerend |
| P3 | Flakiness / modelpinning | **Half** — `temperature: 0` staat er; modellen zijn floating `-latest` | Blokkerend (pinning) + Belangrijk (rest) |
| P2 | Gate A test tekst, niet gedrag | **Correct benoemen** — clarify ís deterministisch (hoort in A); prompt-checks zijn contract-test | Belangrijk |
| P4 | Judge = generator | **Bevestigd** — beide `mistral-small-latest` | Belangrijk |
| P6 | Refusal-calibration één richting | **Genuanceerd** — beide richtingen wórden gemeten, niet apart gerapporteerd | Belangrijk |
| P8 | Rerank = rapport / statistiek / lagen / kosten / mermaid | **Divers** — rerank-check is hardcoded `ok: true` | Klein |

---

## Blokkerend — vóór Fase 9-implementatie

### P1 — skipped ≠ passed (regressiebescherming die echt bindt)
**Probleem.** In `cao.eval.ts` logt een ontbrekende key alleen `SKIPPED` en laat `allPassed`
ongemoeid; de run eindigt groen. Een fork of omgeving zonder secrets merget dus groen op
enkel Gate A — precies de meest-zeggende gate (C) is het makkelijkst te omzeilen.

**Ingreep.**
- `packages/agents/src/evals/cao.eval.ts` — drie uitkomsten i.p.v. twee:
  `PASS` · `SKIP` (bewust, dev-only) · `REQUIRED-BUT-UNAVAILABLE` → **fail**. Introduceer een
  env-vlag `EVAL_REQUIRE_ALL=1` (gezet in CI op merge naar `main`) die een ontbrekende
  `SCALEWAY_API_KEY`/`MISTRAL_API_KEY` tot een fail promoveert i.p.v. een skip.
- `.github/workflows/ci.yml` — Gate B en C als **required status checks** op `main` via een
  merge queue; zet `EVAL_REQUIRE_ALL=1` in die job. PR-pushes van forks mogen skippen (geen
  secrets), maar de merge naar `main` kan niet groen worden zonder dat B en C echt draaiden.

**DoD.** Een merge naar `main` zónder werkende B+C-run faalt aantoonbaar; een dev-run lokaal
zonder keys skipt expliciet en zegt dat het skipt.

### P5 — faithfulness splitsen: harde hallucinatie ≠ zachte drift
**Probleem.** `faithfulness` is één LLM-judge-float met drempel `0.8`. "1 op 5 mag
faithfulness-issues hebben" is onverenigbaar met een no-hallucination-belofte in het portal.
Verzonnen *artikelnummers* worden deels gevangen door `scoreCitationCorrectness`, maar
verzonnen **bedragen/termijnen/percentages** worden nergens hard gegate — de gevaarlijkste
klasse (loonschalen, Fase 10 `table`-chunks).

**Ingreep.**
- `packages/agents/src/evals/judge.ts` — splits de metric:
  - **hard-hallucination (deterministisch):** extraheer getallen/bedragen/termijnen uit het
    antwoord en assert dat elk letterlijk (of genormaliseerd) in de aangeleverde context
    voorkomt. Verzonnen artikel/lid valt hier ook onder. Aparte score.
  - **soft-faithfulness (LLM-judge):** parafrasedrift / nuanceverlies — de bestaande judge.
- `packages/agents/src/evals/cao.eval.ts` — twee drempels:
  `hardHallucination` tolerantie **~0** (bv. ≥ 0.98) als eigen gate; `softFaithfulness`
  0.80–0.90 mag. Rapporteer ze gescheiden.

**DoD.** Een verzonnen bedrag of artikel in een golden-antwoord doet de hard-gate falen,
onafhankelijk van de LLM-judge; de portal-belofte is afgedekt door de hard-gate.

### P7 — bron-identificatie op artikel/lid, niet op chunk-id
**Probleem.** Fase 9/10 brengt structure-aware chunking. `scoreRecall` matcht nu op passage-
`id`; zodra Gate B op de echte pijplijn draait, breekt elke chunkingverbetering de gate om de
verkeerde reden. Nuance: vandaag her-embedt Gate B de fixtures in `golden-passages.jsonl` en
doet cosine in-memory — het raakt de chunker niet, maar test daardoor ook niet de
productie-retrieval. Het schema heeft `expectedArticle`/`expectedLid` al.

**Ingreep.**
- `packages/agents/src/evals/cao.eval.ts` (`scoreRecall`) — match relevantie op **artikel/lid**
  i.p.v. passage-`id`. Velden staan al in `goldenCaseSchema`.
- Gate B richten op de **echte retrieval-pijplijn** (`packages/rag`) tegen een
  **corpus-snapshot**, niet op een los fixture-setje. Versioneer de golden set tegen die
  snapshot (bv. `corpusVersion` in de fixtures + een gepinde ingest-snapshot), zodat een
  nieuwe CAO-tekst Gate B niet laat falen zonder retrieval-regressie.

**DoD.** Een chunking-refactor die dezelfde artikelen terugvindt houdt Gate B groen; recall
wordt gerapporteerd op artikel/lid-niveau; de set is aan een corpus-snapshot gekoppeld.

### P3a — modelpinning (reproduceerbare baseline)
**Probleem.** `EVAL_LLM_MODEL` en `JUDGE_MODEL` zijn `"mistral-small-latest"` — een floating
tag. Een stille endpoint-update verschuift scores zonder codewijziging; je "baseline" is dan
niet reproduceerbaar, wat P5 en P7 stilletjes ondermijnt.

**Ingreep.**
- `packages/agents/src/evals/cao.eval.ts` + `judge.ts` — pin versie-gesuffixte modelnamen
  (concrete gepinde Mistral-versie), niet `-latest`. Verifieer beschikbare versie vóór pinnen
  (web search aan; `100-stack.mdc`).

**DoD.** Modelnamen in het eval-pad zijn gepind; twee identieke runs geven identieke scores
(binnen temperature-0-ruis).

---

## Belangrijk — niet blokkerend, wel vóór portal/procurement

### P2 — Gate A eerlijk benoemen (contract-test, geen gedragsgate)
- De promptchecks zijn regex over de prompt-string: een **contract-/snapshot-test** die
  bewuste promptwijzigingen afdwingt, geen bewijs dat het model de regel *volgt*.
- Clarify hoort wél in Gate A: `detectClarification` is expliciet deterministisch (geen LLM),
  dus offline testbaar in beide richtingen.
- **Ingreep:** hernoem/documenteer in `cao.eval.ts` en `PLAN-v2.md`: Gate A = "prompt- &
  clarify-**contract**"; gedragsnaleving van de prompt-regels wordt in Gate C getest.

### P4 — judge ≠ generator (self-preference bias verkleinen)
- Beide zijn nu `mistral-small-latest`. Binnen soevereiniteit: gebruik een **ander
  Mistral-model** als judge dan als generator (bv. `mistral-large` beoordeelt `mistral-small`).
- Houd de deterministische checks (citations, refusals, hard-hallucination) zo breed mogelijk.
- **Ingreep:** aparte gepinde `JUDGE_MODEL`; benoem de resterende bias expliciet in de
  eval-documentatie (procurement-relevant).

### P6 — over-refusal expliciet rapporteren
- `scoreRefusalCalibration` bestraft over-refusal al (`in_scope` + refusal → `0`), maar het zit
  verstopt in één geaggregeerde metric.
- **Ingreep:** rapporteer **under-refusal** (terecht weigeren gemist) en **over-refusal**
  (weigeren terwijl het antwoord in het corpus staat) apart, elk met eigen drempel — spiegel
  het clarify-beide-richtingen-patroon uit Gate A.

### P3b — flakiness dempen
- **Majority-vote** op twijfelgevallen: meerdere judge-samples, meerderheid telt.
- Overweeg Gate C op de **merge queue of nightly** met **trendlogging in Langfuse** i.p.v. op
  elke PR-push, zodat één flaky judge-oordeel geen gate flipt en niemand "rerunt tot groen".

---

## Klein — backlog / afronding

- **Rerank van rapport naar gate.** De rerank-check is nu hardcoded `ok: true`. Maak er een
  echte gate van: `after.mrr ≥ before.mrr` (delta ≥ 0), anders is "rerank aan" niet falsifieerbaar.
- **Statistiek op ~40 items.** Voeg **regressie-relatieve** drempels toe ("niet meer dan X punt
  onder baseline") naast de absolute minima; sla een baseline op (nu zijn drempels losse consts,
  ondanks de Fase 9-DoD "baseline vastleggen").
- **Twee-lagen-golden-set expliciet per gate.** A + behavioral checks in C = corpus-agnostische
  basisset; Gate B + correctness-checks = fonds-specifiek. Scheid dit in de fixtures — maakt
  multi-tenant eval in v3 schoon.
- **Latency/kosten** worden nergens gegate. Niet urgent; backlog richting productie.
- **Mermaid.** `PLAN-v2.md` bevat geen mermaid, dus niets te fixen in de repo. Als er een
  diagram naar een klant/procurement-pack gaat: geldige `flowchart LR`, geen los pijl-blok.

---

## Volgorde van uitvoering
1. **P3a modelpinning** (goedkoop, maakt de rest reproduceerbaar).
2. **P1 skip-gedrag** (`EVAL_REQUIRE_ALL` + required checks + merge queue).
3. **P7 artikel/lid-recall** (+ Gate B op echte pijplijn/corpus-snapshot).
4. **P5 faithfulness-splitsing** (hard-hallucination-gate voor bedragen/termijnen eerst).
5. Daarna P4, P6, P2, P3b en de kleine punten meelopen in de reguliere Fase 9-DoD.

## DoD van dit addendum
Groen betekent groen: een merge naar `main` kan niet slagen zonder dat B en C echt draaiden;
verzonnen bedragen/artikelen falen een aparte hard-gate; een chunking-refactor breekt Gate B
niet zolang dezelfde artikelen worden teruggevonden; de baseline is reproduceerbaar door
gepinde modellen. Pas daarna is de Fase 9-belofte ("elk antwoord verwijst naar het juiste
CAO-artikel en verzint niets") ook echt door de gates gedekt.

---

## Uitvoering (wat er concreet is gewijzigd)
- **P3a** — `packages/ai/src/models.ts`: pinned `mistral-large-2512` (Large 3) en
  `mistral-small-2603` (Small 4) geregistreerd naast de `-latest`-aliassen (versies geverifieerd
  tegen Mistral-changelog 7 jul 2026). Eval-generator = `mistral-small-2603`.
- **P1** — `packages/shared/src/env.ts` (`EVAL_REQUIRE_ALL`), `cao.eval.ts` (`reportUnavailable`:
  derde uitkomst `REQUIRED-BUT-UNAVAILABLE` → fail), `.github/workflows/ci.yml` (`merge_group`-
  trigger + `EVAL_REQUIRE_ALL` gezet op merge/push/nightly). **Nog te doen in repo-settings:**
  `verify` als required check + merge queue aanzetten.
- **P7** — `cao.eval.ts` (`scoreRecall`/`passageMatchesCase` matchen op artikel/lid i.p.v. chunk-id);
  `golden-set.ts` (`GOLDEN_CORPUS_VERSION`). Bevestigd tegen echte embeddings.
- **P5** — `judge.ts` (`scoreHardHallucination`, deterministisch, near-zero tolerantie voor verzonnen
  bedragen/percentages/termijnen); `cao.eval.ts` (aparte drempels `hardHallucination` ≥ 0.98 en
  `softFaithfulness` ≥ 0.80).
- **P4** — `judge.ts`: `JUDGE_MODEL = mistral-large-2512` (≠ generator), bias-disclaimer in de docs.
- **P6** — `judge.ts` + `cao.eval.ts`: aparte `overRefusalRate` (≤ 0.05) en `underRefusalRate`
  (≤ 0.10) naast refusal-calibration.
- **P2** — Gate A hernoemd naar "prompt & clarify CONTRACT (change-detector, not a behavioral gate)"
  in code en output; clarify blijft offline (deterministisch).
- **P3b** — `env.EVAL_JUDGE_SAMPLES` (default 1) → mediaan over N judge-samples; nightly-run zet 3.
- **Klein** — rerank is nu een echte gate (`MRR delta ≥ 0`); regressie-relatieve drempels via
  optionele `baseline.json` (`baseline.ts`, `EVAL_WRITE_BASELINE`); laag-labels (Gate A/behavioral
  = corpus-agnostisch, Gate B/correctness = fonds-specifiek) in de output; latency/kosten als
  backlog-comment vastgelegd.
