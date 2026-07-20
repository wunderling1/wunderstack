# Baseline v4 — diagnosis (audit 2026-07-10, fase 6)

Diagnosis only. No fix is applied here: the prompt, `ANSWER_THRESHOLDS`, and `baseline.json`
are left untouched, per the branch boundaries. This document records **which cases fail, the
mechanism behind each failing metric, and a recommended fix direction** so the actual fix can be
scoped as a separate, measured iteration.

## Method

Gate C was reproduced locally with `EVAL_WRITE_BASELINE=0` — same generator (`mistral-small-2603`),
same `GENERATION_CONFIG` (temp 0, maxTokens 1024), same prompt, same deterministic scorers, over the
full 31-case base golden set (ETD corpus). The run additionally dumped per-case answer text plus the
hard-hallucination / citation breakdowns the aggregate hides (raw dump written to
`baseline-v4-diagnosis-dump.json` at repo root — **local, not committed**).

Gate C uses in-memory fixture context (`assembleEvalContext`), so no DB/Scaleway is involved — only
the Mistral generator + judge.

### The recorded baseline vs. the audit table

The audit brief listed different numbers than the ones actually in the working-tree `baseline.json`.
The mechanisms are identical; only the exact values shifted (LLM non-determinism between the run that
produced the brief's table and the run that produced the committed baseline). For accuracy this
diagnosis is stated against the **actual committed `baseline.json` v4** and my fresh reproduction:

| metric | audit-brief table | `baseline.json` v4 (committed) | fresh reproduction | threshold | verdict |
|---|---|---|---|---|---|
| hardHallucination | 0.857 | 0.9355 | 0.9355 | ≥ 0.98 | FAIL |
| relevance | 0.836 | 0.8419 | 0.8645 | ≥ 0.85 | FAIL (borderline) |
| citationVerification | 0.643 | 0.5161 | 0.4839 | ≥ 0.98 | FAIL |
| danglingMarkerRate | 0.393 | 0.5161 | 0.5484 | ≤ 0 | FAIL |
| underRefusalRate | 0.667 | 0.3333 | 0.0 | ≤ 0.1 | FAIL in baseline, PASS in fresh run |

`hardHallucination` reproduces to the digit (deterministic scorer, same two cases). The
citation metrics reproduce within one case. `relevance` and `underRefusalRate` are the flaky ones
(see below).

## Headline finding

**`citationVerification` and `danglingMarkerRate` are the same failure, confirmed.** In the fresh
run they correlate perfectly: every `citationVerification = 0` case has `danglingMarkerRate = 1`, and
every verified case has `danglingMarkerRate = 0`. But the hypothesised mechanism ("inline `[n]`
markers disappeared from the answer") is **wrong** — the markers are present in the prose in every
case. It is the **citation block behind the markers** that fails, via three distinct sub-mechanisms.

The two other flagged metrics (`hardHallucination`, `relevance`) do **not** share this root cause and
are diagnosed separately. `underRefusalRate` could not be reproduced as a failure at all.

---

## citationVerification (0.48–0.52, threshold ≥ 0.98) + danglingMarkerRate (0.52–0.55, threshold ≤ 0)

Same root cause, three sub-mechanisms. A citation is only "verified" when
`verifyCitations` finds the model's `chunk_id` in the passage map **and** the quote is a verbatim
substring of that passage (`packages/agents/src/cao/verify-citations.ts:29-40`). Any failure strips
the marker → `citationVerification = 0`, and because the `[n]` marker is still in the prose the same
case scores `danglingMarkerRate = 1`.

### A — malformed / truncated citation JSON block (8 cases)

Failing ids: **etd-004, etd-005, etd-007, etd-011, etd-012, etd-014, etd-d01, etd-d03**
(`citationParseFailed = true`, `modelCitationCount = 0`).

The model emits extra tokens around the JSON array after `<<<CITATIONS>>>`:
- a trailing empty array `[]` (etd-004, etd-005),
- a stray closing `]` (etd-011, etd-d01, etd-d03),
- multiple separate arrays instead of one (etd-007, etd-014 — the latter emitted 11 single-element
  arrays),
- a JSON block truncated mid-object by `maxTokens = 1024` (etd-012).

`parseGenerationOutput` → `extractJsonArray` (`packages/agents/src/cao/parse-generation.ts:71-77`)
grabs everything from the **first** `[` to the **last** `]`. With a duplicate or stray bracket the
span is not valid JSON, so `JSON.parse` throws and the whole block is discarded.

**Fix direction (do not apply here):** make `extractJsonArray` return the first *balanced* array via a
bracket-depth scan instead of first-`[`/last-`]`. That alone recovers 7 of these 8 cases. etd-012 is a
genuine `maxTokens` truncation on a verbose table answer — separate lever (raise the answer token
budget or make table answers terser), and it independently trips hardHallucination too (see below).

### B1 — `chunk_id` decorated with the article label → passage-map miss (5 cases)

Failing ids: **etd-002, etd-006, etd-022, etd-030, etd-d02** (parse succeeds, quotes are fine, but
`verifyCitations` can't find the chunk).

Root cause is in the assembler. `assemble` renders each chunk as
(`packages/rag/src/assemble.ts:66`):

```
[1] chunk_id=vakantie-uren (Artikel 5.2) Een fulltime werknemer ...
```

The `sourceRef` anchor `(Artikel 5.2)` follows `chunk_id=vakantie-uren` with only a space, so the
model cannot tell where the id ends and copies `chunk_id: "vakantie-uren (Artikel 5.2)"`. The passage
map is keyed on the bare `passage.id` (`golden-set.ts:178`, `chunkId: passage.id`), so the lookup
misses and the marker is stripped. The exact same passage verifies when the model happens to emit the
bare id (compare etd-003 `"vakantie-ouderen"` ✓ vs etd-030 `"vakantie-ouderen (Artikel 5.3)"` ✗) —
the behaviour is model-inconsistent but **provoked by the ambiguous context format**.

**Fix direction:** disambiguate the anchor in the assembler (e.g. quote the id `chunk_id="…"`, or move
`sourceRef` to a clearly separate field), **or** have `verifyCitations` strip a trailing ` (…)` from
the emitted `chunkId` before lookup. This is a code-layer fix (assembler / verify), not a prompt
change, so it stays inside the branch boundaries.

### B2 — quote is not verbatim: model inserted an ellipsis / paraphrase (3 cases)

Failing ids: **etd-010, etd-015, etd-018** (parse and id are fine; the quote fails the verbatim
substring check).

The model stitched two non-adjacent spans with `...`:
- etd-010: `"niet van toepassing op: ... vakantiewerkers."`
- etd-015: `"zon- en feestdagen: 100% ... zon- en feestdagen: 50%"`
- etd-018: a long quote joining two clauses with `...`.

`verifyCitations` requires the quote to be a contiguous substring of the chunk (after whitespace
normalization), so an elided quote never matches.

**Fix direction:** this is generation behaviour and the cleanest fix is a prompt instruction ("quote a
single contiguous span, never elide with …"), which is out of scope for this branch. A code-only
mitigation is to split a quote on `...` and require each fragment to verify — but that loosens the
verbatim contract and should be a deliberate, measured decision, not a quiet change.

### Extra dangling-only case

**etd-021** has `citationVerification = 1` but `danglingMarkerRate = 1`: the model emitted an empty
citations array `[]` while leaving `[1]` in the prose (and answered the question wrongly — see
relevance). Nothing to strip, so verification is vacuously clean, but the marker dangles. Same family
as sub-mechanism A (the model kept a marker with no citation behind it).

---

## hardHallucination (0.9355, threshold ≥ 0.98)

**Deterministic and reproducible** (identical to the committed baseline). Exactly **two** cases fail,
and the audit's hypothesis is **not supported**: the genuine derived pro-rata cases (etd-d01/d02/d03)
all *pass* hardHallucination. Both failures are guard normalization edges, not fabrications:

- **etd-012 (table):** flags `"€ 1.281,19"`. The value *is* in the grounding, but as a bare cell in a
  slash-delimited row `19 jaar: 1.164,71 / 1.222,95 / 1.281,19` with no adjacent `€`. `findUngroundedFacts`
  normalizes the answer's fact to `€1.281,19` and can't find that exact string (the `€` the model
  added is not adjacent to the number in the source). → **€-prefix normalization gap on table money
  values.**
- **etd-030 (in_scope, multi-turn):** flags `"58 jaar"`. The `58` is user-supplied (the question is
  "…als ik 58 ben"); the CAO gives the bracket `55 t/m 59 jaar`. The quantity+unit regex captures
  `"58 jaar"`, but grounding contains `"…ik 58 ben"` and `"59 jaar"`, never the contiguous `"58 jaar"`.
  → **false positive: a user-supplied number recombined with an implicit unit.**

**Fix direction:** these are scorer-precision issues in `hard-facts.ts`, not answer bugs. Options:
normalize away a leading `€`/currency when the numeric core is grounded; and treat a quantity as
grounded when the number is user-supplied even if the unit is only implied. Both change scorer
semantics and must be validated so they don't blind the guard to real fabrications — a measured
change, not applied here. Note the 0.98 threshold is effectively unreachable while any single case can
trip on a formatting edge; whether the bar or the scorer moves is your call.

## relevance (0.84–0.86, threshold ≥ 0.85)

**LLM-judged and borderline/flaky** — it fails in the committed baseline (0.842) and passes in the
fresh run (0.865), straddling the 0.85 bar. Systematic drag comes from:
- the derived cases **etd-d01/d02/d03** (judged 0.5 each): the judge undervalues an answer that
  *computes* the pro-rata number (120/72/60 uur) against a reference that states the rule;
- **etd-021** (0.0): a genuine miss — an uitzendkracht at 8 weeks was answered with the "<6 weeks"
  rule (wrong scope);
- a cluster of in_scope answers judged 0.7 (etd-004, 007, 018, 019) where the model adds an extra
  clause beyond what was asked.

**Fix direction:** partly a judge-stability question (raise `EVAL_JUDGE_SAMPLES` on the merge/nightly
queue so a single 0.5/0.7 draw can't flip the gate) and partly a genuine-quality question for the
derived cases and etd-021. Because the metric sits on the threshold, treat it as "watch + sample more"
rather than a hard defect until the citation issues above are fixed (they inflate the answers the
judge sees).

## underRefusalRate (0.0 fresh vs 0.3333 baseline, threshold ≤ 0.1)

**Could not be reproduced as a failure.** All three refusal cases (etd-024/025/026 — pensioenpremie,
loonsverhoging 2024, weeks zwangerschapsverlof) refused cleanly with the exact `NOT_FOUND_MESSAGE`
template in the fresh run. The committed baseline had 1 of 3 wrongly answering. This is a **flaky
generator boundary**: on some runs the near-miss distractor context tips the model into answering one
of these prompts.

Because `baseline.json` only stores aggregates, the specific wrong answer from the baseline run is not
recoverable — I could not inspect whether it cited non-existent passages or extrapolated from
distractors, as the brief asked. Note also that `answerRefuses` (`judge.ts:273`) keys on the template
string / `"niet terugvinden"`; a paraphrased refusal would be miscounted as under-refusal (in this run
refusals were verbatim, so this was not a factor).

**Fix direction:** (1) persist per-case answers in the Gate C artefact so under-refusal failures are
inspectable after the fact (this diagnosis had to regenerate them); (2) consider raising
`EVAL_JUDGE_SAMPLES` / running the borderline refusal prompts N times to expose the true refusal rate
instead of a single flaky draw; (3) harden `answerRefuses` against paraphrased refusals. No prompt
change in this branch.

---

## Summary for the fix branch

| metric | nature | reproducible | primary lever (proposed, not applied) |
|---|---|---|---|
| citationVerification / danglingMarkerRate | deterministic, correlated | yes | balanced-array parser (A) + assembler id/anchor disambiguation (B1); ellipsis (B2) needs prompt |
| hardHallucination | deterministic scorer edge | yes (exactly etd-012, etd-030) | `hard-facts.ts` normalization (€-prefix, user-supplied number+implicit unit) |
| relevance | LLM-judged, borderline | flaky around bar | more judge samples + derived-case quality |
| underRefusalRate | generator variance | no (0/3 this run) | persist answers + resample refusal prompts + harden refusal detection |

The single highest-leverage, in-branch-safe fix is the citation pair (A + B1): a balanced-JSON-array
parse and disambiguating `chunk_id=` from its `(sourceRef)` anchor in the assembler would recover the
large majority of the citationVerification/danglingMarker failures without touching the prompt,
thresholds, or baseline.
