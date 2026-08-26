# DECISION — scaffold-content van de PR-hot-path (26 augustus 2026)

**Status:** besloten  
**Context:** PR #40 (roleplay stack) faalde herhaaldelijk op de accuracy-eval door zachte
kwaliteitscijfers en een `[C]`-slotvraagvloer, gemeten tegen dummy/starter-fixtures. Besluit D9
(`PLAN-ui-ecosystem.md`: "Demo: dummy corpus, geen gating") werd niet nageleefd.

## Beleid in één zin

> **Mechanismegroen is merge-blocking. Inhoudsgroen is promotie-blocking.**
> Zolang een set scaffold-content is, wordt hij *gemeten en gerapporteerd*, niet *afgedwongen*.

## Drie lekken die dit besluit dicht

1. Zachte kwaliteitscijfers (`completeness`, `relevance`, `softFaithfulness`, `citationCorrectness`,
   en de roleplay `[C]`-vloeren) blokkeerden elke same-repo PR via `EVAL_REQUIRE_ALL=1`.
2. Elke PR draaide de volle G2, ook als de diff er niet aan raakte (`EVAL_ONLY` verboden onder
   `EVAL_REQUIRE_ALL`).
3. `promote-check` blokkeerde PRs die `packages/db|rag|tenant` raakten op een demo-NO-GO.

## Gekozen snede

- Classificatie volgt de bestaande bronlabels: **`[X]` → mechanism**, **`[C]` → content**.
- Nieuwe statussen: `advisory-failed` (gedraaid, rood, niet-blokkerend) en `not-applicable`
  (bewust niet gedraaid wegens path-scope). **Geen skip die als pass leest.**
- `EVAL_TIER=pr|merge|nightly`; content floors zijn advisory alleen op `pr`.
- Path-scope op bestandsniveau; `evals/roleplay-*` trekt niet de CAO-gates aan.
- `contentStatus` op elke fondsset: `scaffold | starter | fund-reviewed` (verplicht, geen default).
- Exit-criterium: `fund-reviewed` maakt content floors weer merge-blocking op de PR.

## Uitzonderingen

- `maxEndFlagMismatchCount` blijft mechanism ondanks `[C]` — mismatch bereikt het LMS van de leerling.
- Derived multi-turn cases (etd-d02/d03) zijn uitgesloten van de per-case citatie-eis — dat is een
  checkdefect, geen beleidversoepeling.

## Niet in scope

Judge≠generator, `scoreCitationCorrectness`-dode code, G3-isolation alleen 's nachts.
