# Ingest-structuurrapport — `eval-fixtures`

> **Gegenereerd:** 2026-07-31T07:55:25.108Z · **Bron:** read-only meting op de opgeslagen chunks
> **Status:** visibility, **geen gate** — dit rapport zet geen drempels en laat geen run falen
> (open besluit B4). Alle cijfers zijn **[gemeten]**.
> **Instrument:** `scripts/ingest/report.ts`

## Documenten in dit fonds

| Bron | Versie | Laatste ingest | Chunks |
|---|---|---|---|
| `eval-fixtures://golden-passages.jsonl` | 17ac5ac3b993 | 2026-07-10 07:56:38 | 31 |

## Structuurdekking

| Maat | Waarde |
|---|---|
| Chunks totaal | 31 |
| Chunk-types | 27 text · 4 table |
| Met `article` | 31/31 (100.0%) |
| Met `source_ref` | 31/31 (100.0%) |

## Verloren structuur

Chunks waarin de structuur wél in de tekst staat, maar niet als anker is vastgelegd. Dit is het
signaal uit §2 van de diagnose: staat er een regel-leidende `Artikel N` in de chunk terwijl
`article` leeg is, dan is er structuur weggegooid die er wel was.

| Maat | Waarde |
|---|---|
| Regel-leidende `Artikel N` in de tekst | 0 |
| Regel-leidende `N.M` in de tekst | 31 |
| Regel-leidende `Artikel N` **zonder** `article` | 0 |
| Regel-leidende `N.M` **zonder** `article` | 0 |
| Door de chunker ankerbaar, toch niet geankerd | 0 |

De laatste regel is de strengste lezing: die eist dat de regel ook door `isHeading` heen komt
(≤120 tekens, kop-vormig). Ligt hij lager dan de twee regels erboven, dan staat de structuur
mid-proza en zou de chunker hem ook op een schone regel niet hebben gezien.

## Chunkkwaliteit

| Maat | Waarde |
|---|---|
| Begint mid-zin (D4) | 0/31 (0.0%) |
| Inline `artikel`-kruisverwijzingen | 10 in 6 chunks |

Mid-zin-start is een heuristiek, geen drempel: chunk-starts met een kleine letter of een leesteken,
met lijst-items en cijfers uitgezonderd. Inline kruisverwijzingen zijn context, geen defect — ze
tellen mee omdat een citaat nooit aan een kruisverwezen artikel geankerd mag worden.

---

*Rapportdatum 2026-07-31. Reproduceren:* `pnpm --filter @wunderstack/ingest report --fund eval-fixtures`
