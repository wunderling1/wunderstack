# Gate-resultaten

`g3-fund.jsonl` is de **promotieledger**: één regel per fonds per eval-run, met de uitkomst van de
`G3-fund`-gate. Hij bestaat omdat `eval-report.json` gitignored is en door de volgende run wordt
overschreven — dan is er niets meer om "mag fonds X gepromoveerd worden?" mee te beantwoorden.

- **Wie schrijft:** elke eval-run (`packages/agents/src/evals/cao.eval.ts`), en `record.ts` voor een
  artefact dat elders is gemaakt. Toevoegen is idempotent op (set, run, commit).
- **Wie leest:** `pnpm promote-check <fonds> <tag>`.
- **Vorm en betekenis:** `packages/agents/src/evals/fund-ledger.ts`; de promotievoorwaarden staan in
  `../GATE-ARCHITECTURE.md` §7.

**Niet met de hand bijwerken.** Dit is bewijsmateriaal: een regel hier zegt dat een gate op een
gemeten moment op een gemeten commit een uitkomst had. Een handgeschreven regel maakt de poort
waardeloos. Append-only — regels verwijderen of herschrijven hoort niet.
