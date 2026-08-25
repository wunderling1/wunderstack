# Nulmeting — `arbo.oomt` (2026-08-22 → aangevuld 2026-08-25)

Starter-set voor fonds `oomt`, agent `arbo`, corpusVersion `arbo-oomt-2` (was `arbo-oomt-1` bij eerste
nulmeting).
Bron: `scripts/ingest/arbo-oomt/arbo_catalogus_oomt.pdf` (OOMT — Veilig werken met elektrische voertuigen).

## Scope

| Maat | Waarde |
|---|---|
| Cases | 15 (12 in_scope + 3 refusal) |
| Match (G3-fund) | `expectedChapter` (arbo-chunker sectiekoppen) |
| Match (G2-answer) | `expectedPassageIds` / `distractorPassageIds` via `golden-set.arbo.oomt.g2.jsonl` |
| Gedragscases | Arbowet, CAO-vakantie, individueel bedrijfsarts-advies |

## Bronlabels

| Artefact | Label |
|---|---|
| Fund cases | `golden-set.arbo.oomt.jsonl` |
| G2 passages | `golden-passages.arbo.oomt.jsonl` (export uit gate-DB, geen normalisatie) |
| G2 cases | `golden-set.arbo.oomt.g2.jsonl` |
| Corpus pin | `arbo-oomt-2` (`FUND_SET_META` + meta.json) |
| Beleidsregel | [BWBR0042288](https://wetten.overheid.nl/BWBR0042288/2023-06-21) |
| OOMT letterlijke zinnen | [OOMT-REVIEW-PR0-2.md](../../compliance/OOMT-REVIEW-PR0-2.md) — status: wacht |

## Ankers (uit extract van de PDF)

- `1.2. Risicobeschrijving` — risico’s, oranje bedrading, jongeren &lt; 18
- `2.1. Spanningsloos maken HV-systeem in stappen` — serviceplug, klasse-0 handschoenen, 10 minuten
- `2.3. Aanwijsbeleid…` — ev VOP / VP / WV
- `2.5. Richtlijnen BHV…` — calamiteitenrisico’s
- `2.6. Persoonlijke beschermingsmiddelen (PBM’s)` — S3, klasse 0, halfjaarlijkse controle

## Status

G3-fund draait nightly. G2-answer (arbo) is toegevoegd als capability onder dezelfde gate-id
(`G2-answer [arbo …]`). Floors na drie hermetingen: alleen counts (B3). Set blijft **starter** tot
OOMT de cases reviewt en N groeit.
