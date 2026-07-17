# Golden set review log

Referenced by `GOLDEN_CORPUS_VERSION` in `golden-set.ts`. Records the manual case-by-case review
that must accompany every corpus version (the fixtures are hand-curated; the generator was removed
in E10).

Per case, check: (a) the question matches its expected passage, (b) `expectedArticle` is correct,
(c) the `referenceAnswer` actually answers the question and is supported by the passage text (the
judge scores completeness/faithfulness against it), and (d) refusal cases carry non-empty distractor
context.

## Layers (E12)

The set is split into two physical layers (see `golden-set.ts`):

- **base** — `golden-set.base.jsonl` + `golden-passages.jsonl`: corpus-agnostic behavioral cases run
  on fixtures (Gates A/B/B2/C). Pinned by `GOLDEN_CORPUS_VERSION` (v3 below).
- **fund** — `golden-set.<fund>.jsonl`: fund-specific correctness cases run against the real ingested
  corpus via the integration path (Gate F), matched on article/lid. Each fund set has its own
  `corpusVersion` (see the ETD fund layer section below).

## v3 (base) — real CAO Elektrotechnische Detailhandel 2023

**Corpus:** 28 cases / 31 passages. Replaces the retired v2 synthetic "CAO Voorbeeldsector" set.
**Method:** every case verified against its `expectedPassageIds` in `golden-passages.jsonl` (the
passage `content` is a verbatim article excerpt from the source CAO). Table amounts were cross-read
digit-for-digit against the salary tables. No live model was involved — this is a fixture-integrity
review, not a scoring run.

**Result:** all 28 cases are internally consistent (question ↔ passage ↔ `expectedArticle` ↔
`referenceAnswer`); no corrections required. The three refusal cases correctly carry plausible
distractor context that does *not* answer the question. Details below.

### Per-case findings

| id | cat | art | verdict | note |
|----|-----|-----|---------|------|
| etd-001 | in_scope | 4.1 | OK | 38u avg over 6 months incl. feestdagen/ziekte/kort verlof/vakantie — matches `arbeidsduur`. |
| etd-002 | in_scope | 5.2 | OK | 190u/yr + extra 7,6u day if not sick all year — matches `vakantie-uren`. |
| etd-003 | in_scope | 5.3 | OK | 50–54→1d, 55–59→2d, 60+→3d (with hours) — matches `vakantie-ouderen`. |
| etd-004 | in_scope | 3.2 | OK | Max 2 months, only contracts >6 months (art. 652 lid 7 BW) — matches `proeftijd`. |
| etd-005 | in_scope | 4.3 | OK | 104 roostervrije uren; not applicable if already reduced 40→38 — matches `adv`. |
| etd-006 | in_scope | 6.12 | OK | After 19:00 **and** >8u that day → meal or €6,25 net — matches `maaltijdvergoeding`. |
| etd-007 | in_scope | 8.2 | OK | €150 (2023), >15 contracturen/wk, leerrekening, lapses after 36 months — matches `leerbudget`. |
| etd-008 | in_scope | 6.5 | OK | In dienst 1-1-2022 → €200 bruto/mnd feb–apr 2023; pro rata otherwise; deeltijd naar rato — `eenmalige-uitkering` + `deeltijd`. |
| etd-009 | in_scope | 6.11 | OK | No commute reimbursement; only extra distance (OV 2e klasse / reasonable own transport) — matches `reiskosten`. |
| etd-010 | in_scope | 1.2 | OK | Excludes vakantiewerkers, directeuren, boven functiegroep F — matches `bereik-niet`. |
| etd-011 | in_scope | 3.6 | OK | Max 2 voortzettingen (3 contracts), together ≤24 months — matches `ketenbepaling`. |
| etd-012 | table | 6.2 | OK | 19 jr, MBO-ET (+10%), maand jul-2023 = **€1.281,19** — verified in `salaristabel-maand-jul2023`. |
| etd-013 | table | 6.2 | OK | 20 jr, no diploma, 4-weken jan-2023 = **€1.428,40** — verified in `salaristabel-4weken-jan2023`. |
| etd-014 | table | 6.2 | OK | Groep F, 9 functiejaren, maand jul-2023 = **€2.485,90**; jan-2023 = **€2.367,50** — both tables verified. |
| etd-015 | in_scope | 6.10 | OK | Conditional trap: in dienst 1-4-2018 → 100% Sun/holiday, later → 50%; overtime on Sun/holiday = 100% total — `toeslagen-koopavond-zondag` + `overuren`. |
| etd-016 | in_scope | 7.3 | OK | Yr1 100%, yr2 70% (80% if no recovery/earning capacity); wachtdag rule — matches `loondoorbetaling-ziekte`. |
| etd-017 | in_scope | 5.14 | OK | ≥60% → 2u/dag; <60% → 4u/dag; 6d/wk >3mnd; 50% pay for 1 month, once per 3 yr — matches `mantelzorg`. |
| etd-018 | in_scope | 6.9 | OK | 25% first two overtime hours, 50% rest; >47u/wk variant; exclusions — matches `overuren`. |
| etd-019 | in_scope | 4.4 | OK | ≤3 koopavonden/wk (except Sint/Kerst); avg ≤2/wk yearly — matches `koopavond`. |
| etd-020 | in_scope | 4.6 | OK | ±25% bandwidth, 6-month referteperiode, pay on contracturen, <32u → vaste vrije dag — matches `flexinzet`. |
| etd-021 | in_scope | 1.3 | OK | 8 weeks > 6-week threshold → vakkracht gets art. 6.2/5.2/5.3 + 38u week — `vakkrachten` + supporting passages. |
| etd-022 | in_scope | 5.8 | OK | Partner bevalling: 5 days paid (Wet Wieg) + up to 5 vacation days after (art. 5.10) — `geboorteverlof` + `vakantie-na-bevalling`. |
| etd-023 | in_scope | 6.4 | OK | All-in only for ≤15u/wk; converts 9,61% vakantiedagen + 8% vakantietoeslag — matches `all-in-uurloon`. |
| etd-024 | refusal | — | OK | Correct refusal: premium amount not in CAO. Distractor `pensioenfonds` (9.1) names the fund but no amount. |
| etd-025 | refusal | — | OK | Correct refusal: 2024 raise out of scope (CAO runs to 31-12-2023). Distractors `looptijd` + `loonsverhoging` are plausible but 2023-only. |
| etd-026 | refusal | — | OK | Correct refusal: CAO defers duration to Wet Arbeid en Zorg. Distractor `wet-arbeid-zorg` (5.9) confirms deferral, states no weeks. |
| etd-029 | in_scope | 4.3 | OK | Multi-turn follow-up: no ADV if work already reduced 40→38 — matches `adv` exclusion clause. |
| etd-030 | in_scope | 5.3 | OK | Multi-turn follow-up: age 58 → 55–59 bucket → 2 extra days (15,2u) — matches `vakantie-ouderen`. |

### Coverage notes

- **Categories:** 20 `in_scope` (incl. 2 multi-turn: etd-029/030), 3 `table` (etd-012/013/014),
  3 `refusal` (etd-024/025/026). All refusal cases carry non-empty `distractorPassageIds`.
- **Case ids** skip etd-027/etd-028 (dropped during curation); this is intentional, ids are labels
  not indices, and the guard in `golden-set.ts` requires ids only to be unique.
- **Unreferenced passages:** `salaristabel-4weken-jul2023` (6.2) is not any case's expected passage;
  it stays in the corpus as a realistic retrieval distractor. (`naar-rato` (5.1) was unreferenced in
  v3; from v4 it anchors the `derived` cases below.)
- Any future edit to either fixture file must bump `GOLDEN_CORPUS_VERSION` and re-record the baseline
  — enforced by the fixture-hash guard in Gate A (`fixtureHashChecks`, E10).

## v4 (base) — E13 derived-calculation cases

**Change:** +3 `derived` cases (31 cases total), no passage changes. `derived` is a new category for
calculation-bait questions (pro-rata / deeltijd). The safe answer states the grounded inputs (the
fulltime figure + the "naar rato"-rule) and refuses to assert a self-computed total; the CAO gives no
pro-rata number, so any invented result is caught by the hard-hallucination scorer — the eval mirror
of the E13 production runtime guard (`verifyAndBuild` in `cao/agent.ts`, shared regex in
`cao/hard-facts.ts`). Hard-fact grounding now also counts the user's own question/history, so echoing
a contract-hours number the user supplied (e.g. "24 uur") is not scored as a hallucination.

**Method:** verified against `vakantie-uren` (5.2, 190u + 7,6u/dag), `naar-rato` (5.1) and
`arbeidsduur` (4.1, 38u/week). Reproduces a real vakantie-uren conversation (fulltime 190u → deeltijd
at 24u/12u, incl. the "26 × 12 = 312"-style uren→dagen fabrication, encoded as etd-d03). No live model
was involved — a fixture-integrity review.

| id | cat | art | verdict | note |
|----|-----|-----|---------|------|
| etd-d01 | derived | 5.2 | OK | Single-turn 24u pro-rata. Reference: 190u fulltime (38u) + naar rato, no computed total; defers exact number to fonds. |
| etd-d02 | derived | 5.2 | OK | Multi-turn "en als ik 12 uur per week werk?" → naar rato of 190u fulltime, no invented figure. |
| etd-d03 | derived | 5.2 | OK | Multi-turn uren→dagen ("hoeveel vakantiedagen is dat?"). Reference grounds 190u + 7,6u/dag and refuses a fabricated day-count — the "312" failure mode. |

**Coverage delta:** base is now 20 `in_scope`, 3 `table`, 3 `refusal`, 3 `derived` = 31 cases. The
retrieval baseline must be re-recorded at v4 (fixture hash changed with the version bump); the answer
baseline (E7) should be recorded in the same v4 run.

## ETD fund layer (E12) — `golden-set.etd.jsonl`, corpusVersion `etd-1`

**Purpose.** The fund-specific correctness layer for CAO Elektrotechnische Detailhandel. These cases
run against the REAL ingested ETD corpus via Gate F (`retrieveContext` → article/lid match), NOT
against fixtures — that is the point of the fund layer. They are scored on the ingested ETD passages
(fund `eval-fixtures`); a production ETD deployment would ingest the full CAO PDF under its own fund
id and only `FUND_SET_META.etd.fund` changes.

**Method.** 26 NEW questions, distinct from the 28 base cases (different articles and/or angles).
Each answerable question and its `referenceAnswer` were verified verbatim against the article text in
`golden-passages.jsonl` (the source of the fund corpus). Refusal cases are out-of-corpus minScore
probes (topics the ETD CAO does not regulate). No live model was involved — a fixture-integrity
review.

**Result.** All 23 answerable cases name an `expectedArticle` present in the ETD corpus; all 3
refusal probes are genuinely outside it. Per-case findings:

| id | cat | art | verdict | note |
|----|-----|-----|---------|------|
| etd-f01 | in_scope | 4.2 | OK | Deeltijd = gemiddeld <38u over 6 mnd; voorwaarden evenredig — `deeltijd`. |
| etd-f02 | in_scope | 5.1 | OK | Naar rato voor deeltijders/mid-year entrants (art. 5.2/5.3) — `naar-rato`. |
| etd-f03 | in_scope | 5.9 | OK | Wet Arbeid en Zorg van toepassing; afwijken via OR — `wet-arbeid-zorg`. |
| etd-f04 | in_scope | 6.3 | OK | Niet-WML lonen +5% per 1-7-2023; WML +0,35%; aangevuld tot 5% — `loonsverhoging`. |
| etd-f05 | in_scope | 1.5 | OK | Ingang 1-1-2023, 12 mnd, loopt automatisch af 31-12-2023 — `looptijd`. |
| etd-f06 | in_scope | 5.8 | OK | Overlijden partner/inwonend kind/pleegkind: 4 dagen — `geboorteverlof`. |
| etd-f07 | in_scope | 5.8 | OK | Huwelijk werknemer: 2 dagen — `geboorteverlof`. |
| etd-f08 | in_scope | 4.4 | OK | Deeltijder min. 2u op koopavond, 3u anders — `koopavond`. |
| etd-f09 | in_scope | 4.3 | OK | Roostervrije uren in blokken van 2+ uur; rooster begin jaar/kwartaal — `adv`. |
| etd-f10 | in_scope | 6.9 | OK | Altijd overwerk bij >47u/week — `overuren`. |
| etd-f11 | in_scope | 6.10 | OK | 21.00–07.00 doordeweeks = 50% voor beide indiensttredingsgroepen — `toeslagen-koopavond-zondag`. |
| etd-f12 | in_scope | 7.3 | OK | Wachtdag over eerste ziektedag mag; of verrekenen met bovenwettelijke vakantiedagen — `loondoorbetaling-ziekte`. |
| etd-f13 | in_scope | 5.2 | OK | Extra vakantiedag (7,6u) bij heel jaar niet ziekgemeld — `vakantie-uren`. |
| etd-f14 | in_scope | 3.2 | OK | Opzegging in proeftijd eindigt aan einde werkdag; geen opzegtermijn — `proeftijd`. |
| etd-f15 | in_scope | 8.2 | OK | Storting >36 mnd onbesteed (of overlijden/pensioen) vervalt terug — `leerbudget`. |
| etd-f16 | in_scope | 6.4 | OK | All-in uurloon alleen ≤15u/week — `all-in-uurloon`. |
| etd-f17 | in_scope | 5.14 | OK | 50% loon max 1 maand, eens per 3 jaar; lager % bij zwaarwegend bedrijfsbelang — `mantelzorg`. |
| etd-f18 | in_scope | 4.6 | OK | <32u gemiddeld flexibel → ≥1 vaste vrije dag/week — `flexinzet`. |
| etd-f19 | in_scope | 1.3 | OK | Vakkracht: cao-afspraken na 6 weken uitzending — `vakkrachten`. |
| etd-f20 | in_scope | 6.11 | OK | Werkgever stelt vervoer beschikbaar → geen reiskostenvergoeding — `reiskosten`. |
| etd-f21 | in_scope | 5.10 | OK | Max 5 vakantiedagen na bevalling partner, mits opgebouwd — `vakantie-na-bevalling`. |
| etd-f22 | table | 6.2 | OK | 15 jaar minimumloon maandtabel 1-7-2023 = **€582,33** — `salaristabel-maand-jul2023`. |
| etd-f23 | in_scope | 6.9 | OK | Multi-turn: overwerk op zon-/feestdag = 100% totaal — `overuren`. |
| etd-f24 | refusal | — | OK | Out-of-corpus: geen kinderopvangregeling in de ETD-cao. |
| etd-f25 | refusal | — | OK | Out-of-corpus: geen bedrijfsfitness/sportabonnement in de ETD-cao. |
| etd-f26 | refusal | — | OK | Out-of-corpus: geen jubileumgratificatie in de ETD-cao. |

**Coverage:** 22 `in_scope` (incl. 1 multi-turn: etd-f23), 1 `table` (etd-f22), 3 `refusal` probes.
A fund-set edit does not need a base baseline re-record; the fund layer runs against provisional
integration thresholds (Gate F), recorded on every nightly run in `eval-report.json` under `funds[]`.

**Refusal probes are provisional.** They feed the Gate F minScore refuse-without-LLM guard (must
return 0 hits at minScore 0.35). They were chosen to be genuinely absent from the retail-electronics
CAO with vocabulary distinct from the present passages; the guard keeps one slot of slack (needs 2 of
3 empty). If the nightly shows a probe clears the floor because of semantic adjacency, swap it for a
more clearly out-of-domain topic — the same "measure ~2 weeks, then tighten" loop as the recall
thresholds.
