# Ingest-structuurrapport — `elektronische-detailhandel`

> **Gegenereerd:** 2026-07-30T18:04:36.813Z · **Bron:** read-only meting op de opgeslagen chunks
> **Status:** visibility, **geen gate** — dit rapport zet geen drempels en laat geen run falen
> (open besluit B4). Alle cijfers zijn **[gemeten]**.
> **Instrument:** `scripts/ingest/report.ts`

## Documenten in dit fonds

| Bron | Versie | Laatste ingest | Chunks |
|---|---|---|---|
| `elektronische-detailhandel/cao_elektronische_detailhandel.pdf` | cao-etd-2023 | 2026-07-09 12:29:54 | 107 |

## Structuurdekking

| Maat | Waarde |
|---|---|
| Chunks totaal | 107 |
| Chunk-types | 107 text · 0 table |
| Met `article` | 0/107 (0.0%) |
| Met `source_ref` | 0/107 (0.0%) |

## Verloren structuur

Chunks waarin de structuur wél in de tekst staat, maar niet als anker is vastgelegd. Dit is het
signaal uit §2 van de diagnose: staat er een regel-leidende `Artikel N` in de chunk terwijl
`article` leeg is, dan is er structuur weggegooid die er wel was.

| Maat | Waarde |
|---|---|
| Regel-leidende `Artikel N` in de tekst | 0 |
| Regel-leidende `N.M` in de tekst | 3 |
| Regel-leidende `Artikel N` **zonder** `article` | 0 |
| Regel-leidende `N.M` **zonder** `article` | 3 |
| Door de chunker ankerbaar, toch niet geankerd | 0 |

De laatste regel is de strengste lezing: die eist dat de regel ook door `isHeading` heen komt
(≤120 tekens, kop-vormig). Ligt hij lager dan de twee regels erboven, dan staat de structuur
mid-proza en zou de chunker hem ook op een schone regel niet hebben gezien.

## Chunkkwaliteit

| Maat | Waarde |
|---|---|
| Begint mid-zin (D4) | 92/107 (86.0%) |
| Inline `artikel`-kruisverwijzingen | 90 in 29 chunks |

Mid-zin-start is een heuristiek, geen drempel: chunk-starts met een kleine letter of een leesteken,
met lijst-items en cijfers uitgezonderd. Inline kruisverwijzingen zijn context, geen defect — ze
tellen mee omdat een citaat nooit aan een kruisverwezen artikel geankerd mag worden.

---

*Rapportdatum 2026-07-30. Reproduceren:* `pnpm --filter @wunderstack/ingest report --fund elektronische-detailhandel`
