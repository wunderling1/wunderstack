# OOMT arbocatalogus — Veilig werken met elektrische voertuigen

Sample catalog for fund `oomt`, agent `arbo`. Scored by fund set `arbo.oomt`
(`golden-set.arbo.oomt.jsonl`, corpusVersion `arbo-oomt-1`).

## Ingest

```sh
pnpm --filter @wunderstack/ingest ingest arbo-oomt --fund oomt --agent arbo --version arbo-oomt-1 --prune
```

The path is relative to `scripts/ingest/`. This README is skipped (documentation, not corpus).
Do not drop this PDF into `input/`: CI ingests that directory as the ETD CAO.
