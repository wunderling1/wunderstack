# Rerank ablation report

Generated: 2026-07-10T12:53:00.750Z

Measures whether the rerank step changes retrieval ordering versus pure pgvector
cosine ordering. MEASUREMENT ONLY — production config is unchanged.

## Config

- Fund (corpus): `eval-fixtures`
- Rerank model: `qwen3-embedding-8b` (same model as retrieval embeddings)
- candidateK: 15 · topK: 5
- minScore: 0.35 (production default)
- skipAboveScore (production): 0.85 — ignored here so rerank always runs

## Summary

- Single-turn cases: **27**
  - compared (>=2 candidates): 25
  - single-candidate (rerank trivially skipped): 2
  - no hits at minScore 0.35: 0
- Top-5 identical to pure vector: **23/25** (92%)
- Top-5 changed by rerank: **2/25** (1 with a different chunk set, 1 same set reordered)
- Mean Kendall tau (full-pool ordering): **0.991**
- Would be SKIPPED in production by skipAboveScore 0.85: **0/27**

## Per-query

| id | kind | pool | topScore | prod-skip | top-K identical | tau | in→ / out← |
|---|---|---|---|---|---|---|---|
| etd-001 | compared | 15 | 0.699 | no | yes | 1.000 | — |
| etd-002 | compared | 15 | 0.776 | no | NO | 0.981 | +[194a4fe9] / -[b38d23ae] |
| etd-003 | compared | 15 | 0.817 | no | yes | 1.000 | — |
| etd-004 | compared | 12 | 0.745 | no | yes | 1.000 | — |
| etd-005 | compared | 15 | 0.655 | no | yes | 0.981 | — |
| etd-006 | compared | 9 | 0.744 | no | yes | 1.000 | — |
| etd-007 | single-candidate | 1 | 0.685 | no | yes | 1.000 | — |
| etd-008 | compared | 14 | 0.607 | no | yes | 0.978 | — |
| etd-009 | compared | 3 | 0.753 | no | yes | 1.000 | — |
| etd-010 | compared | 15 | 0.658 | no | yes | 1.000 | — |
| etd-011 | compared | 15 | 0.609 | no | yes | 1.000 | — |
| etd-012 | compared | 8 | 0.636 | no | yes | 1.000 | — |
| etd-013 | compared | 12 | 0.749 | no | yes | 1.000 | — |
| etd-014 | compared | 7 | 0.656 | no | yes | 1.000 | — |
| etd-015 | compared | 15 | 0.697 | no | yes | 0.981 | — |
| etd-016 | compared | 6 | 0.542 | no | yes | 1.000 | — |
| etd-017 | compared | 14 | 0.645 | no | yes | 0.956 | — |
| etd-018 | compared | 15 | 0.666 | no | yes | 1.000 | — |
| etd-019 | compared | 13 | 0.699 | no | yes | 0.949 | — |
| etd-020 | compared | 15 | 0.723 | no | yes | 1.000 | — |
| etd-021 | compared | 15 | 0.650 | no | yes | 0.962 | — |
| etd-022 | compared | 15 | 0.772 | no | yes | 1.000 | — |
| etd-023 | compared | 15 | 0.683 | no | NO | 0.981 | reordered (same set) |
| etd-024 | single-candidate | 1 | 0.366 | no | yes | 1.000 | — |
| etd-025 | compared | 8 | 0.575 | no | yes | 1.000 | — |
| etd-026 | compared | 13 | 0.536 | no | yes | 1.000 | — |
| etd-d01 | compared | 15 | 0.764 | no | yes | 1.000 | — |

## Conclusion

**Does rerank change ordering materially? NO.** The rerank moved the top-5 on 2/25 compared queries (8%); mean full-pool Kendall tau = 0.991 (1.0 = rerank reproduces the vector order exactly).

**Cost.** Pure vector = 1 embedding round-trip + 1 pgvector query per query. Enabling rerank adds exactly 1 Scaleway `/v1/rerank` round-trip per query, EXCEPT the 0/27 queries where the top vector score already clears skipAboveScore (0.85) and production skips the call.

