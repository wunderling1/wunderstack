# Deploy note — drop public corpus (PR-C)

Datum: 21 augustus 2026.

## Commando

```bash
pnpm --filter @wunderstack/db-scripts drop-public-corpus
pnpm --filter @wunderstack/db-scripts drop-public-corpus -- --confirm
```

Guards: `canDropPublicCorpus` (`packages/db/src/drop-public-corpus.ts`). Weigert als public-tabellen al weg zijn, als `control.funds` leeg is, of als een fonds-schema kleiner is dan de public-kopie.

## Uitkomst (deze machine, 21 augustus 2026)

```
Refusing to drop public corpus tables:
  - public corpus tables are already gone
```

Geen `--confirm` gedraaid: er was niets te droppen. Dual-write in `packages/analytics/src/record.ts` is verwijderd; `publicCorpusExists` bestaat niet meer.

## Follow-up op een addon waar public nog staat

1. Guards groen (dry-run).
2. `--confirm`.
3. Deze notitie bijwerken met de DROP-regel.
