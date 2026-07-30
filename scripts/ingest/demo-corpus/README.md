# Demo corpus — "CAO Fictief" (tenant zero)

A fully fictional CAO for the public demo (tenant zero, `TENANT=demo`, fund `demo`). It is deliberately
structured like a real CAO (hoofdstukken / artikelen / leden + a salary table) so it runs through the
**same** ingestion pipeline and gates as a real corpus (Fase 5 DoD).

## Ingest it (you run this — needs `SCALEWAY_API_KEY` + `DATABASE_URL`)

```sh
pnpm --filter @wunderstack/ingest ingest demo-corpus --fund demo --version 1 --prune
```

- The path is relative to `scripts/ingest/`, because `pnpm --filter` runs the script in the package
  directory. A repo-root-relative path fails with ENOENT — that is how this corpus went uningested
  until 2026-07-30 (see `docs/eval/ingest/FINDING-demo-corpus-mismatch-2026-07-30.md`).
- `--fund demo` matches the tenant-zero fund (`CAO_FUNDS` must include `demo`; the runtime's dev
  default tenant `demo` maps to fund `demo`).
- `--prune` states that this directory IS the fund's whole corpus, so anything else the fund still
  holds is retracted. Leave it off to add to a corpus instead of replacing it.
- This README is skipped automatically: documentation next to a corpus is not corpus.
- Dry-run first to inspect chunking without touching the DB/embeddings:
  `pnpm --filter @wunderstack/ingest ingest demo-corpus --fund demo --version 1 --dry-run`
- Every run ends with a structure report (`docs/eval/ingest/INGEST-demo-<date>.md`) showing how many
  chunks carry an `article` / `source_ref` anchor. Visibility, not a gate.

## Its goldenset

The fund-layer demo cases live in `packages/agents/src/evals/fixtures/golden-set.demo.jsonl`
(registered as `FUND_SET_META.demo`, fund `demo`). They score the real ingested demo corpus on the
nightly integration gate (`EVAL_REQUIRE_DB`), matched on article/lid — exactly like a real fund. Run
the gates the normal way once the corpus above is ingested into the gate's DB.
