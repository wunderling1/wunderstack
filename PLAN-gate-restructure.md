# PLAN — Gate Restructure (vier-lagen-model)

> **Doel:** van organisch gegroeide gate-soep (A–D, B2, B-int, F, E0–E13, P1–P8) naar een
> overzichtelijke, uitlegbare en in code afdwingbare gate-logica in vier lagen
> (G1 CONTRACT / G2 GEDRAG / G3 PRODUCTIE / G4 RUNTIME).
> **Branch van waarheid:** `fix/eval-gate-enforcement`, tip `a345b41`.
> **Nulmeting:** volledige eval-run 2026-07-21 op deze branch — **integraal groen** (zie §Nulmeting).
> **Werkwijze:** één fase per keer. Elke fase eindigt met een approval gate: Cursor rapporteert
> bevindingen + default-voorstel, Jordy bevestigt vóór de volgende fase start. Verificatie vóór fix.
> Claims gelabeld feit / schatting / aanname.
> **Taal:** docs & rapporten NL; code, identifiers, filenames, commits EN.

---

## Waarom dit plan is herschreven (t.o.v. de eerste versie)

De eerste versie van dit plan was geschreven tegen branch `fix/citation-pipeline` (tip `4db3ca9`)
en tegen een bronbestand `docs/audit/gates-overview.md`. Op de huidige werk-branch
`fix/eval-gate-enforcement` kloppen meerdere premissen daarvan niet meer. Feiten, geverifieerd op
2026-07-21:

| Oude premisse | Werkelijkheid op `fix/eval-gate-enforcement` | Gevolg |
|---|---|---|
| Bron = `docs/audit/gates-overview.md` | **Bestaat niet** in de repo (feit: `ls` faalt) | Bron losgelaten; dit plan verwijst naar code + verse eval-report. |
| Commit `docs/eval/GATE-ARCHITECTURE.md` als nieuw canoniek doc | Dat bestand **bestaat al** met andere inhoud (invarianten-doc, Invariant 1/2/3) en wordt aangehaald door `.cursor/rules/700-evals.mdc` | Fase G1 wordt een **merge**, geen overwrite. |
| Baseline is corrupt (`underRefusalRate 0.333`, `softFaithfulness 0.784`, `citationVerification 0.903`) | `baseline.json` is **gezond** (re-baseline in `a9299a1`, corpus v4): `hardHallucination 1`, `faithfulness 0.994`, `citationVerification 1`, `underRefusalRate 0` | Fase G2 afgeslankt: alléén de write-guard blijft, geen invalidatie. |
| Laatste eval-report `passed: false`; G3-fund refusal 0/3; multi-turn FAIL | Verse run = **`passed: true`**; G3-fund refusal-guard **3/3 leeg**; multi-turn (etd-029/030/d02/d03) **PASS** | Fase G5-diagnoses vervallen; alleen het G4-streaminglek resteert. |
| minScore-guard = 0.35 | minScore-guard draait nu op **0.48** | Meenemen in bronlabels (Fase 4). |
| Enforcement-hole nog open (G0) | Grotendeels geland in `a345b41` ("close the CI gate-enforcement hole") | G0 wordt verificatie + repo-side branch protection. |

**Netto:** wat overblijft als echte inhoud is (1) het canonieke doc mergen, (2) de
**gate-registry-refactor** die het model overzichtelijk maakt, (3) een preventieve baseline-guard,
(4) drempelbronlabels, en (5) het G4-streaminglek. De "rode gates repareren"-lading is vervallen.

---

## Nulmeting (feit — 2026-07-21, branch `fix/eval-gate-enforcement`)

Volledige `pnpm test` run, lokaal met `DATABASE_URL` gezet (dus inclusief de nightly
DB-integratiegates). Config: `judgeSamples: 1`, `requireAll: false` (lokale defaults; CI gebruikt
`3` / `1`). Generator + judge = `mistral-large-2512`.

| Laag / gate (oud label) | Resultaat |
|---|---|
| G1 — Gate A (prompt/clarify/fixture-hash) | PASS (13/13) |
| G2-retrieval — Gate B | PASS — hit@1 95.8%, recall@3/5 100%, MRR 0.979, rerank 0 failed, delta ≥ 0 |
| G2 multi-turn — Gate B2 | PASS — 4/4 elliptical cases gedetecteerd + geretrievd |
| G2-answer — Gate C | PASS — hardHall 100%, softFaith 100%, relevance 96.8%, citCorrect 100%, completeness 90.6%, refusalCalib 100%, citVerif 100% (0/31), orphan 0%, dangling 0%, overRefusal 0%, underRefusal 0% |
| G2-answer regressie vs baseline | PASS — alle metrics binnen ±0.05 |
| G3-pipeline — Gate B-integration | PASS — hit@1 95.8%, minScore-guard 3/3 leeg @ 0.48 |
| G3-fund — Gate F [etd] | PASS — hit@1 95.7%, refusal-guard 3/3 leeg @ 0.48 |
| G3-isolation — Gate D | PASS — 0 cross-fund leakage over 3 fondsen (demo, etd, eval-fixtures) |

Artefact: `packages/agents/eval-report.json` → `passed: true`, `schemaVersion: 5`.
Noot: 3/31 citation-repair retries vuurden in Gate C — de repair-loop werkt zoals bedoeld.

**Kanttekening (aanname):** deze run gebruikte `judgeSamples: 1`, iets noisier dan CI's `3`. Alle
floors zijn ruim gehaald, dus dit onderscheid verandert de conclusie "integraal groen" niet.

---

## Ontwerpprincipes (ongewijzigd — dit is de kern)

1. **Gates per risico, cases per capability.** Een gate beschermt tegen één faalwijze. Nieuwe
   capabilities (multi-turn, rewriting, filtering) worden case-categorieën binnen een bestaande
   gate, geen nieuwe gates. Zo groeit het aantal gates niet mee met het aantal features.
2. **Elke gate is herleidbaar naar een faalscenario.** Een check zonder aanwijsbaar
   incident(risico) is ritueel — kandidaat voor schrappen.
3. **Drempels hebben een bron.** Elke drempel is empirisch `[E]`, extern/governance `[X]`, of
   expliciet-conservatief `[C]` met herijkdatum. Een drempel zonder bron is een aanname vermomd
   als feit; wijzigingen vereisen een changelog-regel in het canonieke doc.
4. **Skip ≠ pass.** Een gate die niet draait mag nooit als geslaagd rapporteren. Drie statussen:
   `passed` / `failed` / `skipped`.
5. **Twee werelden:** Lagen 1–3 voorkomen dat slechte *code* live gaat (CI). Laag 4 voorkomt dat
   een slecht *antwoord* de gebruiker bereikt (runtime). Beide nodig (defense in depth).
6. **Infrastructuur is geen gate.** Eigenschappen die het eval-systeem zelf betrouwbaar maken
   (judge-retry, fixture-hash, baseline-integriteit, model-coupling, enforcement-flags) zijn
   *invarianten*, geborgd via unit tests + CI-config. Ze staan in het invarianten-hoofdstuk, niet
   in het lagenmodel.

---

## Fasenoverzicht

| Fase | Naam | Type | Blokkeert vervolg? | Status |
|---|---|---|---|---|
| 0 | Re-sync & nulmeting | verificatie | ja | **klaar** (zie §Nulmeting) |
| 1 | Canoniek doc — merge, niet overwrite | docs | ja — naamruimte moet vaststaan | open |
| 2 | Gate-registry refactor (rename + skip-status + B2→case) | refactor (geen gedragswijziging) | nee | **klaar** |
| 3 | Baseline write-guard (preventief) | fix + guard | nee | **klaar** |
| 4 | Drempelbesluiten & bronlabels | besluiten + config | nee | **deels** (bronlabels + minScore klaar; B1–B3 + actie 6 wachten op besluit + 1 betaalde run) |
| 5 | G4-streaminglek dichten | ontwerp → fix | nee | open |
| 6 | Docs-synchronisatie & claims-hygiëne | docs | nee | open |

---

## Fase 0 — Re-sync & nulmeting — **KLAAR**

**Uitgevoerd:** 2026-07-21. Volledige eval op `fix/eval-gate-enforcement`, integraal groen (§Nulmeting).
Vastgesteld: `gates-overview.md` bestaat niet; `docs/eval/GATE-ARCHITECTURE.md` bestaat al als
invarianten-doc; baseline is gezond; alle voorheen "rode" gates zijn hier groen.

**DoD** — [x] eval gedraaid en gearchiveerd · [x] stale premissen geïnventariseerd · [x] plan
herschreven (dit document).

**Restpunt (handmatig, Jordy):** repo-side branch protection op `main` verifiëren/vastleggen:
required status check `verify`, merge queue aan. Bewijs opslaan als
`docs/eval/evidence/branch-protection-2026-07.md` (`gh api repos/{owner}/{repo}/branches/main/protection`).
Dit is het enige G0-restpunt; de code-kant landde in `a345b41`.

---

## Fase 1 — Canoniek doc (merge, niet overwrite)

**Kernpunt:** `docs/eval/GATE-ARCHITECTURE.md` bestaat al. Het bevat de drie invarianten
(model-coupling / skip≠pass / één verified-answer-seam) + de `c763ea0`-oorlogsverhaal +
`turbo.json passThroughEnv`-detail. Die inhoud is waardevol en mag **niet verdwijnen**.

**Acties**
1. Het vier-lagen-model (G1–G4), de drempeltabel en Bijlage A (mapping oud→nieuw) **toevoegen**
   aan het bestaande `docs/eval/GATE-ARCHITECTURE.md`. De bestaande drie invarianten worden het
   invarianten-hoofdstuk (§5 in de draft); geen inhoud weggooien, alleen herstructureren onder
   nieuwe kopjes.
2. Bronbestand in de draft-header (`gates-overview.md`) vervangen door: "geverifieerd tegen
   `packages/agents/src/evals/cao.eval.ts` + eval-report 2026-07-21".
3. Bijlage A aanvullen met de P1–P8 ↔ G-mapping (nu ontbrekend).
4. `.cursor/rules/700-evals.mdc`: verwijzing intact houden en G-terminologie toevoegen (regel:
   nieuwe code/commits gebruiken uitsluitend G-identifiers).
5. `PLAN-eval-gates.md` (P1–P8): banner bovenaan "superseded by docs/eval/GATE-ARCHITECTURE.md";
   de "UITGEVOERD / groen"-claim laten staan is nu correct (nulmeting bevestigt groen). Archiveren,
   niet verwijderen.
6. `docs/audit/eval-hardening-audit.md`: banner "E0–E13 status achterhaald, zie GATE-ARCHITECTURE.md".
7. `docs/STATUS.md`: gate-sectie herschrijven in G-termen met link naar het canonieke doc.

**DoD**
- [ ] `docs/eval/GATE-ARCHITECTURE.md` bevat én de vier lagen én de bestaande drie invarianten
      (diff toont toevoeging, geen verwijdering van invariant-inhoud)
- [ ] Bijlage A dekt A–D, B2, B-int, F, E0–E13 én P1–P8 (geen label zonder mapping)
- [ ] Verouderde documenten gemarkeerd, niets verwijderd
- [ ] `700-evals.mdc` blijft naar het doc wijzen; G-identifier-afspraak vastgelegd

**Approval gate:** Jordy keurt het samengevoegde canonieke document goed, incl. default-voorstellen
bij de open drempelbesluiten.

---

## Fase 2 — Gate-registry refactor (de structuurwinst)

**Type:** refactor zonder gedragswijziging — dezelfde checks, dezelfde drempels, andere structuur.
Dit is de fase die "overzichtelijk" oplevert. Combineert wat in de eerste versie drie losse acties
waren (rename, skip-status, B2→case-categorie).

**Probleem nu:** `main()` in `cao.eval.ts` is een handgeschreven `if (env.X && env.Y)`-keten per
gate, met de gate-naam als losse string-literal (verspreid over `main()` én `eval-report.json`).
De skip-tak schrijft bovendien `passed: true` (het skip≠pass-lek).

**Acties**
1. **[Cursor]** Introduceer een typed gate-registry in `cao.eval.ts` (of een nieuw
   `src/evals/gates.ts`): elke gate als data — `{ id, layer, title, requires, run, cases? }`. Eén
   runner draait de lijst, lost `requires` op (vervangt de env-if's) en zet de status.
   Voorgestelde vorm:
   ```ts
   type Layer = "G1" | "G2" | "G3" | "G4";
   type Requirement = "none" | "scaleway" | "scaleway+mistral" | "db+scaleway" | "db+scaleway+mistral";
   type GateStatus = "passed" | "failed" | "skipped";

   interface GateDef {
     id: string;              // "G2-retrieval", "G2-answer", "G3-fund", ...
     layer: Layer;
     title: string;           // klant-/logregel naast de id
     requires: Requirement;
     run: () => Check[] | Promise<Check[]>;
     cases?: readonly string[]; // bv. ["multi-turn"] — case-categorie i.p.v. eigen gate
   }
   ```
2. **[Cursor]** `report-writer.ts`: expliciete derde status `skipped` naast `passed`/`failed`;
   het skip-pad mag nooit meer `passed: true` schrijven. `schemaVersion` bump (5 → 6) + consumers
   (CI-upload, eventuele parsing) meenemen.
3. **[Cursor]** Gate B2 (multi-turn) verhuizen van eigen gate naar case-categorie `multi-turn`
   binnen G2-retrieval, met een eigen rapportageregel (zodat een condensatie-regressie zichtbaar
   blijft als aparte regel, niet verdrinkt in het gemiddelde).
4. **[Cursor]** Gate-namen → G-identifiers conform Bijlage A (G1-contract, G2-retrieval, G2-answer,
   G3-pipeline, G3-fund, G3-isolation).
5. **[Cursor]** Consistentietest: elke `GateDef.id` staat in `docs/eval/GATE-ARCHITECTURE.md` en
   omgekeerd — doc en code kunnen niet meer uiteenlopen.

**DoD**
- [ ] Zelfde set checks draait; diff toont alleen structuur/naamgeving (verificatie: check-count
      vóór = ná, via een eval-run vergeleken met de nulmeting)
- [ ] `eval-report.json` kent `skipped`; fork-simulatie (geen keys) toont `skipped` i.p.v. `passed`
- [ ] `schemaVersion` gebumpt + consumers meegenomen
- [ ] Geen drempel gewijzigd in deze fase (expliciete check)
- [ ] Registry↔doc-consistentietest groen

**Approval gate:** Jordy reviewt de diff-samenvatting (structuur-only bevestigd) + een verse
groene eval-run.

**Uitgevoerd 2026-07-21.** Registry in `packages/agents/src/evals/gates.ts` (`GATE_SPECS`), runner
in `cao.eval.ts` (`runGate`/`pushGate`/`pushUnavailable`, exhaustieve `GATE_RUNS: Record<GateId,…>`).
`report-writer.ts` GateReport → `{ id, layer, title, status }` met drie-waardige status;
`schemaVersion` 5 → 6. Gate B2 → case-categorie `G2-multi-turn`; Gate D-contract samengevoegd in
`G1-contract`; Gate D-integration → `G3-isolation`; Gate F → `G3-fund` (één report per fonds-set).
Consistentietest `gate-registry.test.ts` (offline, `test:unit`). Verificatie: typecheck + 124 unit
tests groen; fork-sim (geen keys) toont `skipped` i.p.v. `passed`; volledige eval integraal groen met
**69 checks = nulmeting-69** (check-count parity), geen drempel gewijzigd. `feit`.

---

## Fase 3 — Baseline write-guard (preventief) — ✅ klaar

**Aangepast t.o.v. eerste versie:** de baseline is gezond, dus **geen invalidatie**. Alleen de
preventieve guard blijft — zodat een toekomstige slechte baseline niet stilletjes de referentie
kan corrumperen.

**Acties**
1. **[Cursor]** Guard in het write-baseline-pad (`baseline.ts` + write-baseline job in `ci.yml`):
   een baseline waarvan de answer-metrics de absolute G2-floors niet halen, wordt geweigerd met
   een expliciete foutmelding. Unit test erbij. *(Noot: er bestaat al een `answerFloorFailures`-
   check bij het schrijven in Gate C — verifieer of die volstaat en promoveer 'm anders tot
   expliciete guard met eigen test.)*
2. **[Cursor]** Documenteren in het invarianten-hoofdstuk van `GATE-ARCHITECTURE.md` dat de guard
   live is.

**DoD**
- [x] Guard geïmplementeerd/geverifieerd + unit test groen
- [x] Invariant "Baseline-integriteit" gedocumenteerd
- [x] Geen wijziging aan de huidige (gezonde) `baseline.json`

**Approval gate:** Jordy bevestigt dat de guard de bestaande write-workflow niet breekt.

### Uitgevoerd

De bestaande `answerFloorFailures`-check bij Gate C bleek al functioneel te weigeren, maar zat
inline in `cao.eval.ts` (niet los testbaar zonder de eval te draaien). Geëxtraheerd naar een pure
module **`packages/agents/src/evals/answer-floors.ts`** met één bron van waarheid: `ANSWER_THRESHOLDS`
(de floors) + `answerFloorFailures(aggregate)` (de guard). `cao.eval.ts` importeert beide nu — Gate C
en de write-guard kunnen dus niet meer uit elkaar lopen. Write-pad ongewijzigd: bij
`EVAL_WRITE_BASELINE` draait de guard vóór `updateBaselineSection` en slaat de answer-sectie over als
een floor faalt. De `write-baseline`-job in `ci.yml` draait de eval in-proces, dus erft de guard
zonder extra CI-stap. Nieuwe unit test **`answer-floors.test.ts`** dekt: gezonde run → geen failures,
run exact op de floor-grens passeert (`>=`/`<=`), elke floor-overtreding afzonderlijk gemarkeerd,
meerdere tegelijk gerapporteerd. Invariant gepromoveerd van "nieuw" naar live in
`GATE-ARCHITECTURE.md` §4.4 (+ changelog). Verificatie: typecheck groen; **134 unit tests groen**
(was 124, +14 floor-tests, incl. de bestaande registry-consistentietest); `baseline.json`
onaangeraakt. **Scopekeuze:** de guard dekt de **answer**-floors (het corrupt-baseline-incident);
het retrieval-write-pad blijft ongewijzigd — retrieval-baseline is klein en zat nooit onder de lat.
`feit`.

---

## Fase 4 — Drempelbesluiten & bronlabels

**Acties**
1. **[Jordy, besluit B1]** relevance: 0.84 of 0.85. Feit: staat nu op `0.84` in `ANSWER_THRESHOLDS`
   (verlaagd van 0.85, alleen met code-comment als onderbouwing). Default-voorstel: terug naar 0.85
   tenzij de verlaging alsnog onderbouwd wordt. Besluit + reden in de changelog van het doc.
2. **[Jordy, besluit B2]** Regressiechecks nightly-only? Baseer op judge-variantie. Meet eerst de
   spread @1 vs @3 samples (dit stond in het oude G0 en is nog niet gedaan — nulmeting draaide @1).
   Als spread @1 > tolerance 0.05: PR toetst alleen absolute floors; regressie draait nightly @3.
3. **[Jordy, besluit B3]** Drempel-inversie G2 vs G3 (G3-drempels 0.70/0.80/0.75 zijn *lager* dan
   G2's 0.85/0.90/0.88, terwijl G3 realistischer is). Herijkplan: na N nightly-runs (voorstel: 14)
   G3-drempels ijken op gemeten data en het `[C]`-label vervangen. Tot dan blijft "provisional" in
   het doc. *(De nulmeting laat zien dat de echte pipeline ~95% hit@1 haalt — de 0.70-floor is dus
   zeer los; kandidaat voor optrekken.)*
4. **[Cursor]** Alle `[?]`-drempels in de drempeltabel: per drempel git-blame/PLAN-historie
   nalopen op onderbouwing. Gevonden → bronlabel invullen. Niet gevonden → "bron niet gevonden" +
   omzetten naar `[C]` met herijkdatum. **Absence of findings is a finding.**
5. **[Cursor]** minScore-guard: doc bijwerken van 0.35 → **0.48** (feit uit nulmeting) en de bron
   van 0.48 herleiden/labelen.
6. **[Cursor]** E3-residu: `scoreCitationCorrectness` retourneert 1 op refusals (feit,
   `judge.ts`). Refusals uitsluiten van deze metric i.p.v. free-pass, zodat het gemiddelde niet
   geflatteerd wordt. Effect op historische vergelijkbaarheid noteren in de changelog.

**DoD**
- [x] B1–B3 besloten, met reden, in de changelog — B1: 0.84 blijft (`[E]`); B3: provisional (herijk na ≥14 nightly); B2: uitgesteld tot judge-variantie-meting
- [x] Geen enkele drempel draagt nog `[?]` — alles `[E]`, `[X]` of `[C]`+herijk-trigger
- [x] minScore 0.48 gedocumenteerd en gelabeld (`[E]`, gemeten score-gap)
- [~] Regressie-architectuur conform B2-besluit — **geblokkeerd op de spread-meting** (@1 vs @3); tot dan ongewijzigd
- [x] citationCorrectness excludeert refusals; effect genoteerd — code + unit test; **baseline-herijking vereist** (zie hieronder)

**Approval gate:** Jordy tekent de drempeltabel af als "verdedigbaar richting een kritisch paritair
bestuur".

### Uitgevoerd (Cursor, doc-only — geen codewijziging, 134 unit tests groen)

**Actie 4 (bronlabels).** Alle `[?]` in de drempeltabel van `GATE-ARCHITECTURE.md` §3 opgelost via
git log/blame + PLAN-historie (research: subagent-archeologie). Uitkomst:
- `[E]` **minScore 0.48** — gemeten score-gap (out-of-corpus ≤ 0.465, in-scope ≥ 0.520; PLAN-v3
  Fase 14.0 stap 1, `types.ts` + `golden-set.REVIEW.md`).
- `[E]` **relevance 0.84** — gemeten judge-ruis 0.845–0.865 @ 3 samples (dit is óók B1's beslisstof).
- `[E]` **underRefusal-count ≤ 1** — count-tolerantie ~3.2% @ N=31 (§21 safety-vs-quality).
- `[C]` **softFaithfulness 0.80** — conservatief uit PLAN P5-range 0.80–0.90.
- `[C]` **8 oncontroleerbare drempels** — retrieval hitAt1/recall@3/recall@5/MRR, citationCorrectness,
  completeness, refusalCalibration, overRefusal, `REL_TOLERANCE` → van `[?]` naar `[C]` met
  herijk-trigger "na ≥ 14 nightly-runs". **Absence of findings is a finding**: expliciet als
  conservatief-provisioneel gemarkeerd i.p.v. als bewezen. Changelog-regel toegevoegd.

**Actie 5 (minScore).** Doc-note stond al op 0.48; label `[?]` → `[E]` met de gemeten onderbouwing.

### Besluiten (2026-07-21, Jordy)

- **B1 — relevance blijft 0.84.** Empirisch onderbouwd (gemeten judge-ruis 0.845–0.865 @3 samples;
  0.84 net onder de spread). Label `[E]`. Geen codewijziging nodig (stond al op 0.84).
- **B2 — uitgesteld tot meting.** Eerst de judge-variantie meten (@1 vs @3 spread); die is nog niet
  gedraaid. Spread > tolerantie 0.05 → regressie naar nightly-only; anders op de PR-hot-path houden.
- **B3 — G3-drempels provisional.** `[C]`, herijken na ≥ 14 nightly-runs op gemeten data.

### Uitgevoerd — actie 6 (code, 136 unit tests groen)

`aggregateScores` (`judge.ts`) middelt `citationCorrectness` nu over **answerable cases** (refusals
uitgesloten): `sum/count` → `sum(answerable)/answerable.length`. Reden: een *correcte* refusal
scoort een vacuous `1.0` (niets te citeren) en tilde het gemiddelde op; refusal-correctheid zit al
in `refusalCalibration` + under-refusal. De check-naam en console-log vermelden nu "answerable cases
only". Unit test toegevoegd (`judge.test.ts`): mean over answerable (0.6+0.8→0.7, niet 0.85), en 0
bij geen answerable cases. **Premisse-correctie:** de eerdere aanname "refusals krijgen geforceerd
`1`" was al achterhaald — wrong-answer refusals liepen al door de echte scorer; dit betreft alleen
de *correcte*-refusal 1.0's in het gemiddelde.

### Uitgevoerd — gecoördineerde re-baseline-run (2026-07-21)

De eval is @1 én @3 gedraaid (echte keys, incl. DB-gates G3).

**@1 (geen write):** Eval FAILED — enige rode check was de **under-refusal-rate-regressie** (0.333 vs
baseline 0.000): één refusal-case beantwoord. Absolute under-refusal-**count** (≤1) bleef groen.
citationCorrectness (answerable-only) kwam 1.000 uit deze draw.

**@3 (`EVAL_WRITE_BASELINE=1`):** Eval **PASSED**, integraal groen; clean draw (0 under-refusal). De
write-guard schreef beide secties. Baseline-diff (alleen verbeteringen, geen bar-verlaging):
faithfulness 0.994→**1.000**, completeness 0.913→**0.919**; relevance 0.971, citationCorrectness 1.0,
under-refusal 0 ongewijzigd.

**B2-meting (spread @1 vs @3).** Judge-metrieken: faithfulness Δ0.032, relevance Δ0.032,
completeness Δ0.025 — allemaal **< tolerantie 0.05**. Dominante flakiness = generatie-variantie op de
3 refusal-fixtures (under-refusal-rate flipt 0.333↔0.0), niet gedempt door judge-samples.
→ **B2-aanbeveling:** schrap de under-refusal-**rate**-regressie (absolute count-gate ≤1 beschermt al;
rate is betekenisloos bij N=3) óf verplaats regressie naar nightly @3. Jordy's eindbesluit nog nodig.

### ⚠️ Nog te doen (jij)
- **B2-eindbesluit** op basis van bovenstaande meting.
- De herijkte `baseline.json` is geschreven; commit-scope zie hieronder.

---

## Fase 5 — G4-streaminglek dichten

**Aangepast:** de eerste versie combineerde dit met "rode gates diagnosticeren". Die diagnoses
vervallen (alles groen). Wat resteert is puur het bekende streaminglek.

**Acties**
1. **[Cursor, ontwerp]** Klein ontwerpvoorstel (½ A4): harde feiten mogen niet streamen vóór
   citatie-verificatie. Opties: buffer-tot-verify voor de kern van het antwoord, of verificatie
   vóór stream-start van het antwoorddeel. Afweging op latency/UX erbij.
2. **[na akkoord] [Cursor, fix]** Implementeren conform het gekozen ontwerp.
3. **[Cursor]** In `GATE-ARCHITECTURE.md` de "bekend lek"-notitie bij G4 verwijderen zodra gedicht.

**DoD**
- [ ] Ontwerpvoorstel goedgekeurd vóór implementatie
- [ ] Streaminglek gedicht; geen ongegrond getal meer zichtbaar vóór verificatie
- [ ] G4-sectie in het doc bijgewerkt

**Approval gate:** Jordy keurt de ontwerprichting goed vóór de fix.

---

## Fase 6 — Docs-synchronisatie & claims-hygiëne

**Acties**
1. **[Cursor]** RLS-formulering: alle plekken waar portal-/architectuurdocs "Postgres RLS enforcing
   isolation at the database level" claimen, herformuleren naar de werkelijke stand ("isolatie
   afgedwongen op applicatielaag; RLS gepland"). Feit: geen RLS-policies in de repo; de nulmeting
   bewijst wél 0 cross-fund leakage op app-niveau (Gate D).
2. **[Cursor]** Besluit Langfuse dataset-run push (E9 stap 2): bewuste backlog of harde eis.
   Default-voorstel: backlog tot na go-live; invarianten-tabel bijwerken.
3. **[Cursor]** E4-residu: sourceRef-formaat fixture ("Artikel X") vs ingest ("Artikel X, lid Y")
   — impact op citatie-matching bepalen, dan dichten of expliciet accepteren met impact-notitie.
4. **[Cursor]** Klantversie-alinea uit het doc overnemen in procurement-materiaal — uitsluitend
   claims waar een geïmplementeerde gate achter staat (kruistabel claim ↔ gate als bijlage).

**DoD**
- [ ] Grep op "RLS" in docs levert geen claim meer op die de code niet waarmaakt
- [ ] Langfuse-besluit + reden vastgelegd
- [ ] E4-residu gedicht óf geaccepteerd met impact-notitie
- [ ] Klantverhaal bevat uitsluitend gate-gedekte claims

**Approval gate:** Jordy tekent af; hiermee is de restructure afgerond en is
`docs/eval/GATE-ARCHITECTURE.md` de enige levende bron.

---

## Expliciet buiten scope

- **G3-freshness (corpus-actualiteit):** plek gereserveerd in het ontwerp (G3), implementatie in
  PLAN-v3 Fase 16 (corpus lifecycle). Wél in het ontwerp, zodat de laag niet achteraf ingebroken
  hoeft te worden.
- **Latency/cost-gate:** backlog tot go-live; daarna sanity-bound in G3 overwegen.
- **Deploy-gate op G3-fail (besluit B4):** herbeoordelen bij afronding PLAN-v3 Fase 13.
- **Embedding bake-off:** los traject; raakt G2/G3-drempels pas ná vector-space-besluit.

---

## Changelog van dit plan

| Datum | Wijziging | Reden |
|---|---|---|
| 2026-07-21 | Herschreven naar `fix/eval-gate-enforcement` | Nulmeting integraal groen; stale G2/G5-premissen verwijderd; gate-registry als kern van Fase 2; canoniek doc wordt een merge i.p.v. overwrite. |
