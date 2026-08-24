# Compositiecheck — addon `elektronische-detailhandel` (2026-08-24)

> **Hoort bij:** G3-fund `corpusCompositionCheck` (schema v8, `FundLayerReport.documents`).
> **Datum:** 2026-08-24 · **Labels:** [gemeten] · [feit]
> **Status:** gemeten vóór `--prune`; daarna prune gedraaid.

**Kort:** de compositiecheck is op deze addon **niet rood** geworden. Fonds
`elektronische-detailhandel` hield al precies het gedeclareerde document. `--prune` trok niets in.
De 668 OOMT-chunks uit de CI-vervuiling (18–24 augustus, `ingest input/` met twee PDF's) lagen hier
niet (meer) in dat fonds.

Artefact van de run (gitignored, gekopieerd vóór overschrijven):
`/tmp/eval-report-composition-etd-full-2026-08-24.json` (schema v8).

## 1. G3-fund tegen de addon, vóór prune [gemeten]

`EVAL_GATES=G3-fund EVAL_REQUIRE_DB=1` (filter niet gecommit). Tunnel naar de Scalingo-addon.

Logregel:

```
corpus — 1 document(s): "cao_elektronische_detailhandel" (vcao-etd-2023)
```

Check: `fund "etd-full" corpus: holds exactly the 1 declared document(s)` — **PASS**.
hit@1 **92.9%** (13/14), MRR 0.929. etdf-07 blijft `unranked` (expected 5.1).

SQL op `fund_elektronische-detailhandel.documents` (agent `cao`): één rij,
`source_uri = elektronische-detailhandel/cao_elektronische_detailhandel.pdf`, **245** chunks.

## 2. `--prune` [gemeten]

```
pnpm --filter @wunderstack/ingest ingest input/cao_elektronische_detailhandel.pdf \
  --fund elektronische-detailhandel --agent cao --version 1 --prune
```

```
unchanged elektronische-detailhandel/cao_elektronische_detailhandel.pdf (245 chunks, …)
retracted nothing: fund "elektronische-detailhandel" held no documents outside this input set.
```

Geen `retracted … (668 chunks removed)`. De diagnose “tweede PDF in dít fonds” klopt niet voor
deze addon op dit moment.

## 3. Waar de 668 chunks wél staan [gemeten]

Structuurrapport `INGEST-oomt-2026-08-23.md`: fonds `oomt` bevat `oomt/cao_oomt.pdf` v1,
**668** chunks, naast de arbocatalogus. `listCorpusDocuments` is gescoped op `agent_key`; G3-fund
`arbo.oomt` (agent `arbo`) ziet die CAO dus niet. Dat is geen ETD-vervuiling.

De CI-run van 24 augustus (hit@1 64.3% op etd-full) mat tegen een **verse** gate-database die
`ingest input` draaide — beide PDF's in één map, één fonds. Die database is weg. Deze addon is
een ander corpus.
