# Nulmeting — `arbo.oomt` (2026-08-22)

Starter-set voor fonds `oomt`, agent `arbo`, corpusVersion `arbo-oomt-1`.
Bron: `scripts/ingest/arbo-oomt/arbo_catalogus_oomt.pdf` (OOMT — Veilig werken met elektrische voertuigen).

## Scope

| Maat | Waarde |
|---|---|
| Cases | 15 (12 in_scope + 3 refusal) |
| Match | `expectedChapter` (arbo-chunker sectiekoppen) |
| Gedragscases | Arbowet, CAO-vakantie, individueel bedrijfsarts-advies |

## Ankers (uit extract van de PDF)

- `1.2. Risicobeschrijving` — risico’s, oranje bedrading, jongeren &lt; 18
- `2.1. Spanningsloos maken HV-systeem in stappen` — serviceplug, klasse-0 handschoenen, 10 minuten
- `2.3. Aanwijsbeleid…` — ev VOP / VP / WV
- `2.5. Richtlijnen BHV…` — calamiteitenrisico’s
- `2.6. Persoonlijke beschermingsmiddelen (PBM’s)` — S3, klasse 0, halfjaarlijkse controle

## Status

Nog niet door het fonds gereviewd. Eerste G3-fund-score volgt op de eerstvolgende nightly / `run_db_gates` nadat deze set is gemerged.
