# Golden set review log

Referenced by `GOLDEN_CORPUS_VERSION` in `golden-set.ts`. Records the manual case-by-case review
that must accompany every corpus version (the fixtures are hand-curated; the generator was removed
in E10).

Per case, check: (a) the question matches its expected passage, (b) `expectedArticle` is correct,
(c) the `referenceAnswer` actually answers the question (the judge scores completeness/faithfulness
against it), and (d) refusal cases carry non-empty distractor context.

## v3 (E12) — real CAO Elektrotechnische Detailhandel 2023 (fund ETD)

The prior v2 synthetic "CAO Voorbeeldsector" set (58 cases / 23 passages) was replaced by the real
ETD corpus (28 cases / 31 passages). The v2 review is therefore obsolete and has been removed. The
v3 review belongs with that content change — to be filled in by the curator who verified the cases
against the source PDF (expert-reviewed OOMT-branche questions, incl. conditional / date-
disambiguation traps).

> TODO (E12 content work): record the per-case v3 findings here before recording the v3 baseline.
