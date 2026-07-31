# Ingest-structuurrapport — `elektronische-detailhandel` (na-parsefix)

> **Gegenereerd:** 2026-07-30T19:14:23.297Z · **Bron:** read-only meting op de opgeslagen chunks
> **Status:** visibility, **geen gate** — dit rapport zet geen drempels en laat geen run falen
> (open besluit B4). Alle cijfers zijn **[gemeten]**.
> **Instrument:** `scripts/ingest/report.ts`

## Documenten in dit fonds

| Bron | Versie | Laatste ingest | Chunks |
|---|---|---|---|
| `elektronische-detailhandel/cao_elektronische_detailhandel.pdf` | cao-etd-2023 | 2026-07-30 19:14:20 | 245 |

## Structuurdekking

| Maat | Waarde |
|---|---|
| Chunks totaal | 245 |
| Chunk-types | 233 text · 12 table |
| Met `article` | 221/245 (90.2%) |
| Met `source_ref` | 244/245 (99.6%) |

## Verloren structuur

Chunks waarin de structuur wél in de tekst staat, maar niet als anker is vastgelegd. Dit is het
signaal uit §2 van de diagnose: staat er een regel-leidende `Artikel N` in de chunk terwijl
`article` leeg is, dan is er structuur weggegooid die er wel was.

| Maat | Waarde |
|---|---|
| Regel-leidende `Artikel N` in de tekst | 1 |
| Regel-leidende `N.M` in de tekst | 104 |
| Regel-leidende `Artikel N` **zonder** `article` | 0 |
| Regel-leidende `N.M` **zonder** `article` | 0 |
| Door de chunker ankerbaar, toch niet geankerd | 0 |

De laatste regel is de strengste lezing: die eist dat de regel ook door `isHeading` heen komt
(≤120 tekens, kop-vormig). Ligt hij lager dan de twee regels erboven, dan staat de structuur
mid-proza en zou de chunker hem ook op een schone regel niet hebben gezien.

## Chunkkwaliteit

| Maat | Waarde |
|---|---|
| Begint mid-zin (D4) | 1/245 (0.4%) |
| Inline `artikel`-kruisverwijzingen | 86 in 29 chunks |

Mid-zin-start is een heuristiek, geen drempel: chunk-starts met een kleine letter of een leesteken,
met lijst-items en cijfers uitgezonderd. Inline kruisverwijzingen zijn context, geen defect — ze
tellen mee omdat een citaat nooit aan een kruisverwezen artikel geankerd mag worden.

---

*Rapportdatum 2026-07-30. Reproduceren:* `pnpm --filter @wunderstack/ingest report --fund elektronische-detailhandel`
