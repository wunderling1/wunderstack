# Ingest-structuurrapport — `oomt`

> **Gegenereerd:** 2026-08-23T18:54:33.179Z · **Bron:** read-only meting op de opgeslagen chunks
> **Status:** visibility, **geen gate** — dit rapport zet geen drempels en laat geen run falen
> (open besluit B4). Alle cijfers zijn **[gemeten]**.
> **Instrument:** `scripts/ingest/report.ts`

## Documenten in dit fonds

| Bron | Versie | Laatste ingest | Chunks |
|---|---|---|---|
| `oomt/arbo_catalogus_oomt.pdf` | arbo-oomt-2 | 2026-08-23 18:54:28 | 73 |
| `oomt/cao_oomt.pdf` | 1 | 2026-08-12 14:35:18 | 668 |

## Structuurdekking

| Maat | Waarde |
|---|---|
| Chunks totaal | 741 |
| Chunk-types | 683 text · 58 table |
| Met `article` | 616/741 (83.1%) |
| Met `source_ref` | 728/741 (98.2%) |

## Verloren structuur

Chunks waarin de structuur wél in de tekst staat, maar niet als anker is vastgelegd. Dit is het
signaal uit §2 van de diagnose: staat er een regel-leidende `Artikel N` in de chunk terwijl
`article` leeg is, dan is er structuur weggegooid die er wel was.

| Maat | Waarde |
|---|---|
| Regel-leidende `Artikel N` in de tekst | 439 |
| Regel-leidende `N.M` in de tekst | 93 |
| Regel-leidende `Artikel N` **zonder** `article` | 1 |
| Regel-leidende `N.M` **zonder** `article` | 66 |
| Door de chunker ankerbaar, toch niet geankerd | 63 |

De laatste regel is de strengste lezing: die eist dat de regel ook door `isHeading` heen komt
(≤120 tekens, kop-vormig). Ligt hij lager dan de twee regels erboven, dan staat de structuur
mid-proza en zou de chunker hem ook op een schone regel niet hebben gezien.

## Chunkkwaliteit

| Maat | Waarde |
|---|---|
| Begint mid-zin (D4) | 58/741 (7.8%) |
| Inline `artikel`-kruisverwijzingen | 301 in 196 chunks |

Mid-zin-start is een heuristiek, geen drempel: chunk-starts met een kleine letter of een leesteken,
met lijst-items en cijfers uitgezonderd. Inline kruisverwijzingen zijn context, geen defect — ze
tellen mee omdat een citaat nooit aan een kruisverwezen artikel geankerd mag worden.

---

*Rapportdatum 2026-08-23. Reproduceren:* `pnpm --filter @wunderstack/ingest report --fund oomt`

## Arbo G2 answer-gate fixtures

After every `corpus_version` bump for `oomt` / `arbo`, re-export the committed G2 passages:

```bash
pnpm --filter @wunderstack/eval-scripts export-arbo-passages
```

Writes `golden-passages.arbo.oomt.jsonl`, `golden-set.arbo.oomt.g2.jsonl`, and
`golden-passages.arbo.oomt.meta.json` (with `contentHash`). G1 fails if the hash drifts without a
re-export. Bump `FUND_SET_META["arbo.oomt"].corpusVersion` in the same change.
