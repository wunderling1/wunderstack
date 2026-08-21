# NOTE — Retrieval-kopie `elektronische-detailhandel`

Datum: 21 augustus 2026
Schema: `fund_elektronische-detailhandel` (kopie; `public` ongemoeid)
Tak: B — exact (flat) search, geen HNSW/ivfflat, geen sibling-expansie, geen rerank.

## Methode

- Zelfde query-vector per vraag (één embed, twee searches).
- `retrieveFromVector` met `minScore=0`, `candidateK=15` (pgvector LIMIT, niet post-rerank topK).
- Geen `retrieveContext` (dat herschrijft, rerankt en sibling-expandeert).
- Index ongewijzigd: btree op `(fund, agent_key)` / document_id; embeddings 4096-dim exact cosine.
- Golden sets: `etd-full`.

## Uitkomst

**Identiteit bevestigd.** 15 vragen: chunk-id-set en volgorde gelijk tussen `public` en `fund_elektronische-detailhandel`.

## Kopie (`scripts/db/provision-fund.ts`)

Live Scalingo addon, 21 augustus 2026. Geen `CREATE ROLE` (tak B). Isolatie blijft D15.

| tabel | `public` (na kopie) | `fund_elektronische-detailhandel` |
|---|---|---|
| `documents` | 1 | 1 |
| `chunks` | 245 | 245 |
| `interaction_events` | 103 | 103 |
| `eval_cases` | n.v.t. (`control`, leeg) | niet gekopieerd |

CHECK-tripwire: `documents.fund = 'elektronische-detailhandel'` (domein-key, niet het `fund_`-prefix). Geen `PARTITION BY`, geen HNSW/ivfflat. Chunk-ids zijn gelijk gehouden (`INSERT … SELECT *`), anders is deze identiteitsmeting betekenisloos. `public.*` is niet gedropt.

## Retrieval per vraag

| case | agent | set equal | order equal | max \|Δscore\| | public k | schema k |
|---|---|---|---|---|---|---|
| `etdf-01` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-02` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-03` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-04` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-05` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-06` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-07` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-08` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-09` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-10` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-11` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-12` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-13` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-14` | `cao` | yes | yes | 0.000000 | 15 | 15 |
| `etdf-15` | `cao` | yes | yes | 0.000000 | 15 | 15 |

## Wat dit niet is

- Geen fail-closed SET ROLE-test (tak B; CREATE ROLE bestaat niet op de addon).
- Geen claim dat `search_path` een security boundary is.
- Geen sibling-expansie in deze meting (ADR: niet in dezelfde PR als de kopieermeting).

