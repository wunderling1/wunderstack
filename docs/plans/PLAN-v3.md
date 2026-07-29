# PLAN-v3 — Productie-hardening, go-live & schaalbaarheid (Fase 14–17)

> Status: CONCEPT — te reviewen door Jordy vóór uitvoering.
> Nummering start bij **Fase 14** omdat "Fase 13" in deze repo al vergeven is aan UI-fluency (`PLAN-ui-fluency.md`).
> Let op: dit plan is geschreven **zonder actuele codekennis**; bestandspaden gemarkeerd met `(aanname)` zijn indicatief en moeten bij uitvoering geverifieerd worden tegen de werkelijke repo-structuur. Paden zonder markering komen uit de status-audit van 2026-07-19 en zijn `feit`.

---

## Instapvoorwaarde (Fase 14.0) — Groene eval op `main`

Geen enkele fase in dit plan start voordat dit staat. De eval is de kwaliteitslat die we aan fondsen verkopen; bouwen op een rode eval ondermijnt de kernpropositie.

**Te doen (volgorde bewust: klein → groot):**

1. **Gate F — fund-refusal-guard (uren-werk).**
   - Verhoog de fund-specifieke `minScore` (nu 0.35) stapsgewijs en meet bij welke drempel ≥2/3 out-of-corpus-probes 0 hits geven, zónder dat de in-scope-recall van Gate B zakt.
   - Alternatief als de drempel niet werkt: herzie de probes zelf (zijn ze écht out-of-corpus?).
   - Locatie: fund-config / `FUND_SET_META` en de Gate F-checks in `packages/agents/src/evals/cao.eval.ts`.
2. **Gate B2 — elliptische detectie (uren-werk).**
   - Analyseer waarom `etd-029`/`etd-030` niet als elliptisch worden herkend door `detectClarification`/`isElliptical` `(aanname: packages/agents/src/cao/clarify.ts)`.
   - Beslis expliciet: detectielogica verbeteren **of** cases herlabelen. Beide is legitiem; stilzwijgend herlabelen om groen te krijgen niet — log de keuze in `golden-set.REVIEW.md`.
3. **Gate C — answer-level (dagen-werk, de kern van `fix/citation-pipeline`).**

   *Eerst de structurele scheiding die bepaalt wat een falende check überhaupt kan oplossen:*

   - **Absolute-gate-checks** — gemeten tegen de vaste `ANSWER_THRESHOLDS`-constanten (`packages/agents/src/evals/cao.eval.ts:173-188`), niet tegen de baseline. Nu rood: relevance (<0.85), completeness (<0.70), citation-verification (<0.98), dangling-marker-rate (>0), under-refusal-rate (>0.10), en blijkens de baseline-dump ook soft-faithfulness (0.784<0.80) en hard-hallucination (0.968<0.98). Deze worden ALLEEN groen door (a) de agent te verbeteren, of (b) een bewuste, gelogde wijziging van de drempel in `ANSWER_THRESHOLDS`. **Herijken van de baseline doet hier niets.**
   - **Regressie-checks** — `answerRegressionChecks()` (`cao.eval.ts:949`), vergelijkt tegen `baseline.answer` binnen `REL_TOLERANCE`, alleen bij gelijke corpusVersion. Nu rood: completeness-regressie (0.658 vs baseline 0.723). Deze los je op door óf de antwoordkwaliteit te herstellen, óf — als expliciete beleidskeuze — de baseline te herijken (stap 4).

   *Beleidskeuze vóór code:* leg de metric-prioriteit vast (voorstel: refusal-correctheid > citation-verification > completeness > relevance — "eerlijk incompleet" is verdedigbaar, "onterecht antwoord" niet). Under-refusal omlaag drukken zal completeness/relevance verder drukken; die volgorde bepaalt welke trade-off acceptabel is.

   *Absolute-gate-fixes (agent verbeteren — dit is het echte werk):*
   - Under-refusal: scherp het antwoordcontract in `cao/prompt.ts` aan en/of verlaag de generatie-drempel waarbij de agent naar NOT_FOUND valt.
   - Dangling markers + citation-verification: dit is de citation-pipeline zelf; verifieer dat elke `[n]`-marker naar een bestaand, geverifieerd bronfragment wijst en strip of blokkeer markers die dat niet doen (verlengstuk van de E13-guard).
   - Relevance / faithfulness / hard-hallucination: deels een legitiem gevolg van correcter weigeren; herbeoordeel ná de refusal-fix.
   - Alleen als een drempel bewust wordt bijgesteld: wijzig `ANSWER_THRESHOLDS` (`cao.eval.ts:173-188`) én log de motivatie in `golden-set.REVIEW.md`. Dit is een beleidskeuze, geen bugfix — nooit stilzwijgend.
4. **Regressie-fixes + baseline herijken (raakt NOOIT de absolute drempels).**
   - Beoordeel de completeness-regressie (0.658 vs 0.723) pas ná de refusal-fix — een deel van de daling kan legitiem gevolg zijn van correcter weigeren.
   - Dan pas herijken: `workflow_dispatch` → `write-baseline` (`EVAL_JUDGE_SAMPLES=3`), reviewde waarden committen; `fixtureHash` moet kloppen.
   - **Expliciete waarschuwing:** herijken verschuift alleen het referentiepunt van de regressie-checks. Een absolute-gate-failure (stap 3) blijft rood tot de agent beter is óf de `ANSWER_THRESHOLDS`-constante bewust en gelogd wijzigt. Gebruik de baseline nooit om de lat stil te verlagen: dat is precies de "nooit stilzwijgend de lat verlagen"-regel van dit plan.
5. **Verse run + merge.** `pnpm turbo run test` groen op de branch → merge naar `main` → nightly groen afwachten.

**DoD Fase 14.0**
- [ ] `eval-report.json` op `main`: `"passed": true`, alle gates groen
- [ ] Nightly run (Gate B-integration + Gate F tegen staging-DB) groen
- [ ] Elke drempel-/case-wijziging gelogd in `golden-set.REVIEW.md` met motivatie
- [ ] Baseline herijkt en gecommit; `fixtureHash` klopt
  - [ ] Elke `ANSWER_THRESHOLDS`-wijziging apart gelogd als beleidskeuze (niet als onderdeel van de herijking)

---

## Fase 14 — Productie-hardening & go-live OOMT

**Doel:** van demo-app naar een omgeving waar OOMT-medewerkers veilig en stabiel mee werken.

**Stappen:**
1. **Branch protection & merge-queue aan** op `main`: `verify` als required check, "require branches up to date", admin-bypass uit. Verificatie: `gh api repos/{owner}/{repo}/branches/main/protection` — output opslaan als bewijs in `docs/audit/branch-protection-check.md` `(aanname)`.
2. **Authenticatie.** Vervang de no-op auth-naad (`apps/demo/proxy.ts`) door echte auth (Auth.js conform eerdere architectuurkeuze). Scope v1: alleen OOMT-gebruikers, uitnodiging-gebaseerd, geen self-signup. Sessie-afdwinging op de chat-API-route.
3. **Deploy stabiliseren.** Scalingo-boot reproduceerbaar maken (de openstaande `fix/scalingo-deploy-boot`-kwestie oplossen); `Procfile`/start-command vastleggen in de repo; health-check-endpoint toevoegen `(aanname: apps/demo/app/api/health/route.ts)`.
4. **OOMT-corpus definitief.** Vastleggen (in `docs/`) of het bestaande `etd`-fonds de geanonimiseerde OOMT is; zo ja, hernoemen of expliciet mappen; definitieve CAO-tekst ingesten met idempotente ingest (contentHash) en fund-config.
5. **Runtime-vangnetten.** Rate-limiting op de chat-route, foutpagina's, en logging-afspraak (wat gaat naar Langfuse, wat niet — AVG-check op prompts met mogelijk persoonsgegevens).

**DoD Fase 14**
- [ ] Branch protection aantoonbaar aan (bewijs in repo)
- [ ] Inloggen verplicht; niet-ingelogde requests op de chat-API geweigerd
- [ ] Deploy vanaf `main` reproduceerbaar; health-check groen
- [ ] OOMT-corpus geïngest, Gate F groen op dit corpus
- [ ] Go-live-checklist afgevinkt en gearchiveerd in `docs/go-live-oomt.md` `(aanname)`

---

## Fase 15 — Pilotmetrics & proof of value

**Doel:** in cijfers die een paritair bestuur begrijpt laten zien dat het werkt.

**Stappen:**
1. **KPI-afspraak met OOMT (vóór de pilot start).** Voorstel-set: % beantwoorde vragen met geverifieerde citaties, % correcte weigeringen, gebruikersfeedback (duim-ratio), dekking van het CAO-corpus. Framing conform principe: dekking = *volledigheid van de CAO-inhoud*, geen rapportcijfer voor de tool.
2. **Langfuse dataset-run push afmaken** (het openstaande E9-stap-2-gat): eval-resultaten per run naar Langfuse zodat er een historische trendlijn bestaat buiten het losse JSON-artefact. `(aanname: uitbreiding van packages/agents/src/evals/report-writer.ts)`
3. **Feedback-loop sluiten.** De bestaande harvest (`scripts/eval/harvest-feedback.ts`) periodiek draaien; thumbs-down-cases als `candidate` in het review-proces brengen; promotie naar golden set alleen na menselijke review (E10-beleid).
4. **Periodiek pilotrapport.** Eén A4-format ontwerpen (markdown → PDF) dat maandelijks uit Langfuse + eval-data gevuld wordt. Doelgroep: niet-technische fondsdirecteur.

**DoD Fase 15**
- [ ] KPI-set schriftelijk afgestemd met OOMT
- [ ] Eval-trend zichtbaar in Langfuse (≥2 opeenvolgende runs)
- [ ] Eerste pilotrapport opgeleverd en besproken
- [ ] ≥1 feedback-case doorlopen van harvest → review → golden set

---

## Fase 16 — Multi-tenancy & onboarding-runbook

**Voorwaarde (v4-principe):** start pas bij een **concreet tweede fonds** (getekende intentie of pilot-afspraak). Niet anticiperend bouwen.

**Stappen:**
1. **RLS-implementatie.** Postgres Row Level Security op de fund-dragende tabellen (`documents`, `chunks`, eval-tabellen): policies per fonds, afgedwongen op databaseniveau — het harde slot onder de bestaande app-laag-filtering (`retrieve.ts`). Migratie via Drizzle `(aanname: migrations/000X_enable_rls.sql)`.
2. **Gate D uitbreiden.** Corpus-isolatie-gate laten testen dat RLS daadwerkelijk afdwingt (query als fonds A mag nooit chunks van fonds B zien, ook niet bij een app-laag-bug).
3. **Fund-onboarding parametriseren.** Alles wat nu OOMT-specifiek is (theming via `lib/fund-theme.ts`, fund-config, golden-set-bestand via het glob-loader-patroon `golden-set.*.jsonl`) achter één onboarding-configuratie.
4. **Runbook al doende schrijven.** Tijdens het onboarden van fonds #2 elke stap en elk uur loggen in `docs/onboarding-runbook.md` `(aanname)` — het logboek ís het runbook én de kostenkalibratie voor de menukaart-pricing.
5. **Co-creatie-sessie golden set** met de domeinexperts van fonds #2 (procesdoc `docs/golden-set-cocreation.md` bestaat al); sessie-artefact archiveren.

**DoD Fase 16**
- [ ] RLS aan; Gate D-integration bewijst database-niveau-isolatie
- [ ] Fonds #2 volledig geonboard via de geparametriseerde flow
- [ ] Runbook compleet met gelogde uren per stap
- [ ] Fund-specifieke golden set van fonds #2 `validated` na co-creatie

---

## Fase 17 — Procurement pack & corpus-lifecycle

**Doel:** het pakket waarmee een fonds intern "ja" kan zeggen, plus een beschreven proces voor CAO-wijzigingen. Grotendeels schrijfwerk; kan parallel aan Fase 15 worden voorbereid.

**Stappen:**
1. **Procurement pack samenstellen** in `docs/procurement/` `(aanname)`: architectuur & soevereiniteit per laag, het gates-verhaal (kwaliteitslat als CI-poort), E13-guard en "verzint niets"-garantie, AVG-onderbouwing en verwerkingsafspraken, "controlled and demonstrable learning" (geen automatische fine-tuning), SLA-concept. Bestuurstaal, geen jargon.
2. **Corpus-update-draaiboek** (`docs/corpus-lifecycle.md` `(aanname)`): nieuwe CAO-tekst → ingest (idempotent, contentHash) → corpusversie-bump → golden-set-review (welke cases raken verouderd?) → volledige eval-run → alleen live bij groen → archivering oude versie. Dit beantwoordt de kernvraag van elk fonds: "wat gebeurt er bij de nieuwe CAO?"
3. **Referentie-afspraak OOMT.** Expliciete toestemming vragen voor naamsvermelding; tot die tijd geanonimiseerd ("een O&O-fonds in de mobiliteitssector").

**DoD Fase 17**
- [ ] Procurement pack compleet en door één externe niet-techneut op leesbaarheid getoetst
- [ ] Corpus-lifecycle-draaiboek geschreven én één keer droog geoefend op een fictieve CAO-wijziging
- [ ] OOMT-referentiestatus schriftelijk vastgelegd (wel/niet met naam)

---

## Afhankelijkheden (samengevat)

```
Fase 14.0 (groene eval) ──► Fase 14 (go-live) ──► Fase 15 (pilotmetrics)
                                                        │
Fase 17 (procurement, parallel voorbereidbaar) ◄────────┘
Fase 16 (multi-tenancy) ──► START ALLEEN bij concreet fonds #2 (v4-principe)
```

## Uitvoeringsregels
- Eén fase tegelijk; per stap eerst pad-verificatie tegen de werkelijke code (dit plan bevat `(aanname)`-paden).
- Elke bewuste afwijking van drempels, labels of scope wordt gelogd met motivatie.
- Claims in voortgangsrapportage: `feit` / `schatting` / `aanname`.
