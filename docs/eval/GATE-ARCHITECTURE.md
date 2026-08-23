# Gate Architecture — het vier-lagen-model (canoniek)

> **Status:** CANONIEK. Dit is de enige levende bron voor de gate-logica van de CAO-agent.
> **Vervangt als levende identifiers:** Gates A–D / B2 / B-integration / F, de eval-labels E0–E13,
> en de plannummers P1–P8. Die blijven alleen bestaan in de mappingtabel (Bijlage A).
> **Geverifieerd tegen:** `packages/agents/src/evals/cao.eval.ts` + de eval-run van 2026-07-21 op
> branch `fix/eval-gate-enforcement` (zie het changelog en §3). "Integraal groen" gold voor de
> **toen bestaande** fonds-sets — dat was alleen `etd` op de fixtureset. De later toegevoegde sets op
> echt geïngeste corpora (`demo`, `etd-full`) zijn nog niet groen geweest: de refusal-guard faalt daar
> (`SLOTVERSLAG-ingest-herstelplan-2026-07-31.md`). Er is dus **geen bevroren volledig groene run**.
> **Restructure-plan:** `PLAN-gate-restructure.md`.

Dit document heeft twee helften:

1. **Het lagenmodel (§1–§4)** — wat de gates zijn, wanneer ze draaien, en met welke drempels.
   Dit is wat we intern én aan een fonds uitleggen.
2. **De invarianten (§5)** — de eigenschappen die het eval-systeem *zelf* betrouwbaar maken. Die
   staan bewust apart: het zijn geen gates, maar de fundering waarop de gates rusten. De drie
   uitgewerkte invarianten zijn ontstaan uit een reëel incident (`c763ea0`) en worden hieronder
   in hun geheel bewaard.

---

## 1. Ontwerpprincipes

1. **Gates per risico, cases per capability.** Een gate beschermt tegen één faalwijze. Nieuwe
   capabilities (multi-turn, rewriting, filtering) worden case-categorieën binnen een bestaande
   gate, geen nieuwe gates. Zo groeit het aantal gates niet mee met het aantal features.
2. **Elke gate is herleidbaar naar een faalscenario.** Een check zonder aanwijsbaar
   incident(risico) is ritueel — kandidaat voor schrappen.
3. **Drempels hebben een bron.** Elke drempel is empirisch `[E]`, extern/governance `[X]`, of
   expliciet-conservatief `[C]` met herijkmoment. Een drempel zonder bron is een aanname vermomd
   als feit. Drempelwijzigingen vereisen een regel in het changelog (§7) met reden.
4. **Skip ≠ pass.** Een gate die niet draait mag nooit als geslaagd rapporteren. Artefacten kennen
   drie statussen: `passed` / `failed` / `skipped`.
5. **Strenger naarmate realistischer.** Drempels op de productie-pipeline (Laag 3) mogen niet
   losser blijven dan op synthetische fixtures (Laag 2) zodra er genoeg nightly-data is om ze te
   ijken. *(Huidige toestand wijkt hiervan af — G3-floors staan provisioneel laag; zie §6.)*
6. **Twee werelden:** Lagen 1–3 voorkomen dat slechte *code* live gaat (CI). Laag 4 voorkomt dat
   een slecht *antwoord* de gebruiker bereikt (runtime). Beide nodig (defense in depth).
7. **Infrastructuur is geen gate.** Eigenschappen die het eval-systeem zelf betrouwbaar maken
   (model-coupling, judge-retry, fixture-hash, baseline-integriteit, enforcement-flags) zijn
   *invarianten* (§5), geborgd via unit tests en CI-config — niet via het lagenmodel.

---

## 2. Het vier-lagen-model

| Laag | Naam | Vraag | Wanneer | Kosten | Vereisten |
|---|---|---|---|---|---|
| **G1** | CONTRACT | Staat het afgesproken gedrag nog in de code? | Elke PR/push/merge, altijd | Seconden | Geen keys |
| **G2** | GEDRAG | Doet elk onderdeel wat het moet op gecontroleerde fixtures? | Elke PR/push/merge (same-repo) | Minuten | Scaleway + Mistral keys |
| **G3** | PRODUCTIE | Werkt het op de echte pipeline en de echte corpus? | Nightly (schedule) | Minuten–uren | DB + keys |
| **G4** | RUNTIME | Bereikt een ongegrond antwoord nooit de gebruiker? | Elk individueel antwoord | ms per antwoord | — |

**Uitleg in één alinea (klantversie, NL):**
*"Wij controleren op vier momenten. Bij elke codewijziging toetsen we of de vastgelegde spelregels
— alleen antwoorden uit de CAO, altijd met bronvermelding — nog in het systeem staan. Daarna
toetsen we op een vaste set voorbeeldvragen of het systeem zich ook zo gedraagt. Elke nacht draait
dezelfde toets op de echte CAO-teksten van het fonds. En bij elk individueel antwoord controleert
het systeem zichzelf: zonder geverifieerde bronvermelding wordt een hard feit niet gegeven."*

### Gate-ids (code ↔ doc)

De eval-code declareert de gates als een registry (`packages/agents/src/evals/gates.ts`,
`GATE_SPECS`). Onderstaande ids zijn de enige levende identifiers; een consistentietest
(`gate-registry.test.ts`) bewaakt dat deze lijst en de registry niet uiteenlopen. G4 draait in
productie (`cao/agent.ts`), niet in de eval-harness, en is daarom géén registry-entry.

| Id | Laag | Vereist | Vervangt |
|---|---|---|---|
| `G1-contract` | G1 | — | Gate A + Gate D-contract |
| `G2-retrieval` | G2 | Scaleway | Gate B |
| `G2-multi-turn` | G2 | Scaleway + Mistral | Gate B2 (nu case-categorie van G2-retrieval) |
| `G2-answer` | G2 | Scaleway + Mistral | Gate C |
| `G3-pipeline` | G3 | DB + Scaleway | Gate B-integration |
| `G3-fund` | G3 | DB + Scaleway + Mistral | Gate F (één report per fonds-set) |
| `G3-isolation` | G3 | DB + Scaleway | Gate D-integration |
| `G4` *(runtime)* | G4 | — | E13 — productie-guard, geen eval-gate |

### Kanaal als dimensie (MCP — geen eigen gate-laag)

Het MCP-kanaal (`POST /api/mcp`, tool `ask_cao`) krijgt **geen eigen gate-laag**. Dat zou
G1–G4 verwateren. In plaats daarvan is `channel` een dimensie waarop dezelfde garanties gelden:

| Laag | MCP-toepassing |
|---|---|
| **G1 CONTRACT** | Zod-schema's van `ask_cao` in/uit (`apps/runtime/lib/mcp-ask-cao.ts`); tool-beschrijving als versioned constant |
| **G2 GEDRAG** | Golden set blijft de gedragstoets; MCP deelt dezelfde `agent.answer()`-seam (geen aparte fixture-route) |
| **G3 PRODUCTIE** | Relay-fidelity (citaties + weigerzin via Copilot) is een **release-drempel** bij MCP-go-live, gemeten in `docs/audit/mcp/copilot-baseline.md` — niet een nightly CI-gate totdat er signaal + baseline is |
| **G4 RUNTIME** | `verifyAndBuild` / hard-fact-guard gelden onverkort vóór de MCP-overdracht; fouten gaan als `isError: true` (geen verzonnen CAO-antwoord) |

Traces en analytics dragen `channel` (`playground` \| `embed` \| `mcp` \| `api`) zodat portaal-
en MCP-verkeer in Langfuse en `interaction_events` uit elkaar te houden zijn. Soft budget-gate
op latency blijft backlog (`cao.eval.ts`), niet in dit model.

---

### G1 — CONTRACT

| Veld | Inhoud |
|---|---|
| **Faalscenario** | Grounding-regels, clarify-router of fund-scoping worden per ongeluk verwijderd of afgezwakt bij een refactor. |
| **Checks** | (a) Prompt-contract: non-negotiable grounding-regels aanwezig (regex/includes). (b) Clarify-router: deterministisch gedrag op underspecified vragen, geen hijack van answerable cases. (c) Fund-scoping-schema: unscoped retrieval parse-faalt, scoped slaagt. |
| **Bewijst niet** | Dat de regels **werken**. G1 leest promptstrings en schema's en draait geen model: een grounding-regel die aanwezig maar dubbelzinnig is, of een clarify-router die deterministisch maar verkeerd kiest, passeert G1 zonder meer. |
| **Karakter** | **Change-detector, geen gedragsbewijs.** Bewijst dat de regels *bestaan*, niet dat het model ze volgt (dat is G2/G3). Hoort daarom niet in het klantverhaal als kwaliteitsbewijs. |
| **Blocking** | CI: exit 1 → job `verify` faalt. |
| **Herkomst** | Gate A (excl. fixture-hash → invariant Fixture-hygiëne, §5) + Gate D-contract. |
| **Nulmeting 2026-07-21** | PASS (13/13). |

### G2 — GEDRAG

| Veld | Inhoud |
|---|---|
| **Faalscenario's** | (a) Retrieval vindt het juiste artikel/lid niet — ook niet in multi-turn-gesprekken. (b) Antwoorden hallucineren, citeren fout, weigeren te veel of te weinig. |
| **Checks** | **G2-retrieval:** recall@k + MRR op golden passages; productie-`rerank()` zonder failures; MRR-delta ≥ 0. Bevat case-categorie `multi-turn` (elliptical-detectie → condensatie → retrieval), gerapporteerd als aparte regel binnen dezelfde gate. **G2-answer:** absolute floors op hardHallucination, softFaithfulness, relevance, citationCorrectness, completeness, refusalCalibration, citationVerification, orphan/dangling, over/underRefusal. |
| **Bewijst niet** | Iets over een **echt CAO-corpus**. G2 scoort 31 handgecureerde fixture-passages die `scripts/ingest/fixtures.ts` rechtstreeks uit `golden-passages.jsonl` laadt — zonder PDF-parse en zonder `chunk.ts`. Parse-kwaliteit, chunkgrenzen en structuurankers liggen dus volledig buiten bereik. Aangetoond in Fase 3 van het ingest-herstelplan: G2 stond groen terwijl de productie-ingest 0 van 107 chunks van een echte CAO-PDF ankerde. |
| **Drempels** | Zie §4. Bronlabel per drempel verplicht. |
| **Regressie** | G2-answer toetst óók ±tolerance vs baseline (nu op de PR-hot-path; zie besluit B2). `refusalCalibration` en under-refusal-*rate* zitten **niet** in de regressieband — te noisy bij N=3 refusal-fixtures; de absolute floor ≥ 0.90 en de under-refusal-**count**-gate ≤ 1 blijven de bescherming. |
| **Blocking** | CI bij same-repo (`EVAL_REQUIRE_ALL=1`). Fork-PR: `skipped`, nooit `passed`. |
| **Herkomst** | Gate B + Gate B2 (als case-categorie) + Gate C. |
| **Nulmeting 2026-07-21** | PASS. Retrieval hit@1 95.8% / recall 100% / MRR 0.979; multi-turn 4/4; answer alle floors gehaald (hardHall 100%, softFaith 100%, relevance 96.8%, citVerif 100%, underRefusal 0%). |

### G3 — PRODUCTIE

| Veld | Inhoud |
|---|---|
| **Faalscenario's** | (a) De echte pipeline (rewrite → pgvector → rerank → assemble) presteert slechter dan de synthetische proxy. (b) Fund-antwoorden kloppen niet op de echte corpus. (c) Cross-fund leakage. (d) Sluipende kwaliteitsdaling. (e) *Gereserveerd:* corpus-actualiteit. |
| **Checks** | **G3-pipeline:** productie-retrieval op fund-fixtures; minScore refuse-guard op out-of-corpus probes. **G3-fund:** fund golden set (per fonds, corpus-versioned) via productie-pipeline; refusal-guard op dezelfde **gedeelde** out-of-corpus-probes als G3-pipeline (sinds 2026-07-31; zie changelog en B7). **G3-isolation:** live 0-leakage-probe per fund. **G3-freshness *(gereserveerd, PLAN-v3 Fase 16)*:** corpus-versie vs. vigerende CAO-versie. |
| **Bewijst niet** | Een groene `G3-fund [etd]` bewijst de retrieval- en antwoordketen op de échte pipeline, **niet de productie-ingest**: `etd` scoort tegen fonds `eval-fixtures`, dat via de fixture-adapter wordt geladen en nooit door `parse.ts`/`chunk.ts` gaat. Alleen een fonds-set op een werkelijk geïngest corpus (`demo`, `etd-full`) dekt de ingest mee. De kwaliteit van de ingest zelf is **visibility, geen gate** — zie het ingest-contract in §2. |
| **Isolatie-mechanisme** | Fund-isolatie wordt afgedwongen op de **applicatielaag**: de retrieval-seam (`packages/rag` → `retrieve.ts`) scoopt elke query verplicht op `fund` en een unscoped query parse-faalt (G1-contract). **Postgres RLS is (nog) niet geïmplementeerd** — `grep create policy / enable row level security` over de repo = 0 treffers. G3-isolation bewíjst 0 cross-fund leakage op app-niveau; het is geen database-niveau-garantie. RLS-vs-app-seam is open besluit B5; DB-niveau-isolatie staat gepland (PLAN-v3 Fase 16). Klant-/procurement-teksten mogen daarom géén "isolatie op databaseniveau" claimen tot RLS bestaat. |
| **Blocking** | Nightly: fail = rode schedule-run + melding. **`main` wordt niet geblokkeerd; promotie van het betreffende fonds wél** — `pnpm promote-check <fonds> <tag>` geeft NO-GO op een rood, ontbrekend of niet-identificeerbaar `G3-fund`-resultaat (B4 herzien 2026-07-31, zie §7). |
| **Herkomst** | Gate B-integration + Gate F + Gate D-integration. |
| **Nulmeting 2026-07-21** | PASS (lokaal met DB). G3-pipeline hit@1 95.8%, minScore-guard 3/3 leeg @ 0.48; G3-fund [etd] hit@1 95.7%, refusal-guard 3/3 leeg; G3-isolation 0 cross-fund leakage over 3 fondsen. |

### G4 — RUNTIME

| Veld | Inhoud |
|---|---|
| **Faalscenario** | Een antwoord met harde feiten (bedragen, percentages, termijnen) zonder geverifieerde citatie bereikt de gebruiker. *Herkomst: reëel productie-incident (pro-rata-hallucinatie).* |
| **Checks** | `verifyAndBuild` → `hasUngroundedHardFact(answer, grounding, userSupplied)` → `NOT_FOUND_MESSAGE`. Gedeelde regex (`hard-facts.ts`) tussen runtime en eval, zodat guard en meting nooit uiteenlopen. |
| **Bewijst niet** | Dat het antwoord **juist of volledig** is. G4 vervangt een antwoord met een ongegrond *hard* feit (bedrag, percentage, termijn) door de weigerzin. Een gegronde maar inhoudelijk verkeerde interpretatie, en een onvolledig antwoord zonder harde feiten, passeren ongehinderd. |
| **Streaming (buffer-to-verify)** | Géén token-streaming. `answerStream` genereert het hele antwoord, draait `verifyAndBuild` (strip + hard-fact-guard) en emit dán pas via de enige seam `settledAnswerEvents` — één `text`-delta met de gesettelde tekst (of `NOT_FOUND_MESSAGE`). De client ziet nooit een partiële stream, dus er is niets te retracten: het eerder genoemde "streaming-flash"-lek bestaat niet meer. De hard-fact-guard is all-or-nothing (een laat ongegrond getal weigert retroactief álles ervoor), wat token-streaming principieel onveilig maakt; buffer-to-verify is daarom de bewuste keuze (plan Fase 5, optie A). Geborgd door `agent.test.ts` (`verifyAndBuild` + `settledAnswerEvents`): een getripte guard levert alleen `NOT_FOUND_MESSAGE`, nooit het ongegronde getal. TTFT-kost wordt gemaskeerd door de `status`-fasen (searching → retrieved → generating). |
| **Blocking** | Ja — het serve-path vervangt het antwoord. Enige gate die per individueel antwoord blokkeert. |
| **Herkomst** | E13. |

---

### Ingest-contract (visibility-laag onder G3)

De gates scoren wat er **in** de database staat. Hoe het daar terechtkwam, was tot 2026-07-30
onbewaakt: een echte CAO-PDF kon volledig zonder structuurankers landen zonder dat één gate iets
zag (zie de `Bewijst niet`-regels bij G2 en G3). Het ingest-contract dicht dat gat als **meetlaag**,
niet als gate.

**Instrument.** `scripts/ingest/report.ts` schrijft na élke ingest een structuurrapport naar
`docs/eval/ingest/INGEST-<fonds>-<datum>[-label].md`, en kan read-only op een bestaand fonds draaien
(`pnpm --filter @wunderstack/ingest report --fund <fonds>`). Gemeten worden: `article`- en
`source_ref`-dekking, regel-leidende `Artikel N` en `N.M` die géén anker kregen, "wel ankerbaar maar
niet geankerd", mid-zin-starts, table-chunks en inline `artikel`-kruisverwijzingen. Wat elke maat wel
en niet aantoont staat in `docs/eval/ingest/VALIDATION-instrument-2026-07-30.md`.

**Status: visibility, geen drempels.** Het rapport laat geen run falen. Dat is een bewuste keuze:
drempels op ongecalibreerde maten produceren vals-rood en leren je niets. Afgesproken pad naar
drempels: eerst meten over meerdere fondsen, dán calibreren, en een vastgestelde drempel **beweegt
daarna alleen omhoog** — nooit omlaag om een corpus door te laten (dat zou categorie C4 zijn uit
`docs/eval/intervention-log.md`).

**De enige harde koppeling loopt via promotie, niet via CI.** `pnpm promote-check <fonds> <tag>`
(§7) eist dat er een structuurrapport voor het fonds bestaat (voorwaarde 4) en dat de laatste ingest
vóór de gate-run ligt (voorwaarde 5). Een fonds zonder ingest-visibility is dus niet promoveerbaar,
terwijl `main` open blijft. Zo blokkeert een ingest-probleem precies daar waar het schade zou doen.

**Wat deze laag niet kan zien:** een ingest die buiten `scripts/ingest/run.ts` om is gedaan. Binnen
dat pad is het rapport onvoorwaardelijk (alleen een dry-run schrijft niets), dus daar bestaat geen
ingest zonder rapport. Dát het pad gebruikt is, blijft een aanname.

---

## 3. Drempeltabel (met bronlabel)

Bronlabels: `[E]` empirisch · `[X]` extern/governance · `[C]` conservatief-gestart (herijkmoment
genoemd) · `[?]` **bron onbekend — te herleiden of te herzien**.

> **Fase 4 (2026-07-21):** alle `[?]` zijn opgelost. Herleidbare drempels kregen hun bron (`[E]`/`[X]`);
> niet-herleidbare drempels zijn expliciet omgezet naar `[C]` met herijk-trigger ("na ≥ 14 nightly-runs").
> **Absence of findings is a finding** — 8 van de 13 drempels bleken oncontroleerbaar en zijn als
> conservatief-provisioneel gemarkeerd i.p.v. als bewezen. Zie changelog §6.

> **Let op — count vs. rate.** Een aantal G2-answer-gates gate op een **absoluut aantal cases**
> (bv. "≤ 1 van 31 cases met een unverified citatie"), niet op een percentage. De onderliggende
> *rate* wordt wel gerapporteerd voor trend, maar de gate is de count. Dit staat expliciet in de
> tabel; de bron is `ANSWER_THRESHOLDS` in `cao.eval.ts`.

### G2-retrieval (synthetische fixtures)
| Metric | Drempel | Bron |
|---|---|---|
| hitAt1 | ≥ 0.85 | `[C]` bron niet gevonden (git log/blame + PLAN-historie: geen onderbouwing) → herijk na ≥ 14 nightly-runs (B3-trigger). Nulmeting 95.8% — floor zeer los. |
| recallAt3 | ≥ 0.90 | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. Nulmeting 100%. |
| recallAt5 | ≥ 0.90 | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. Nulmeting 100%. |
| MRR | ≥ 0.88 | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. Nulmeting 0.979. |
| rerank failedCount | = 0 | `[X]` geen silent failures |
| rerankMrrDelta | ≥ 0 | `[X]` rerank mag nooit verslechteren |

### G2-answer (absolute floors)
| Metric | Drempel | Type | Bron |
|---|---|---|---|
| hardHallucination | ≥ 0.98 | rate | `[X]` kernbelofte bewijsbare betrouwbaarheid |
| softFaithfulness | ≥ 0.80 | rate | `[C]` conservatief uit PLAN P5-range 0.80–0.90 (`PLAN-eval-gates.md` §P5); herijk na ≥ 14 nightly-runs. Nulmeting 100%. **Sinds 2026-08-22: gemiddelde over answerable cases (refusals uitgesloten)** — zelfde uitsluiting als citationCorrectness (actie 6). |
| relevance | ≥ 0.84 *(besluit open: 0.84 vs 0.85 — B1)* | rate | `[E]` gemeten judge-ruis 0.845–0.865 @ 3 samples; 0.84 net onder de spread (PLAN-v3 Fase 14.0 stap 3, `golden-set.REVIEW.md`). B1 = terug naar 0.85? **Sinds 2026-08-22: answerable cases only.** |
| citationCorrectness | ≥ 0.75 | rate | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. **Sinds Fase 4 actie 6: gemiddelde over answerable cases (refusals uitgesloten)** — waarde verschuift t.o.v. de oude baseline, herijk vereist. |
| completeness | ≥ 0.70 | rate | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. **Sinds 2026-08-22: answerable cases only.** |
| refusalCalibration | ≥ 0.90 | rate | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. Nulmeting 100%. **Sinds 2026-08-22: alleen absolute floor, geen regressiecheck** (B2: N=3 noisy; count-gate ≤ 1 is de bescherming). |
| citationVerification | ≤ 1 case unverified | **count** | `[X]` kernbelofte (rate 0.98 = trend-only) |
| orphanRate | ≤ 0 | rate | `[X]` citatie-integriteit is binair |
| danglingMarker | ≤ 1 case | **count** | `[X]` citatie-integriteit (rate = trend-only) |
| overRefusalRate | ≤ 0.05 | rate | `[C]` bron niet gevonden → herijk na ≥ 14 nightly-runs. Nulmeting 0%. |
| underRefusal | ≤ 1 refusal-case beantwoord | **count** | `[E]` count-tolerantie; bij N=10 refusals (corpus v5, 2026-08-22) is één slip ~10% (was 33% @ N=3); rate blijft trend-only. |

### G3 (productie-pipeline — "provisional")
| Metric | Drempel | Bron |
|---|---|---|
| hitAt1 | ≥ 0.70 | `[C]` provisional; herijken zodra ≥ N nightly-runs (B3). *Nulmeting: gemeten 95.8% — floor staat zeer los.* |
| recallAt3 / recallAt5 | ≥ 0.80 | `[C]` idem |
| MRR | ≥ 0.75 | `[C]` idem |
| minScore-guard | ≥ 2/3 probes leeg @ **minScore 0.48** | `[E]` gemeten score-gap: out-of-corpus probes ≤ 0.465, in-scope chunks ≥ 0.520 (verhoogd van 0.35, PLAN-v3 Fase 14.0 stap 1; `types.ts` `caoQuestionSchema.minScore`, `golden-set.REVIEW.md` Gate F stap 1). |
| G3-isolation leakage | = 0 chunks cross-fund | `[X]` multi-tenant-belofte, binair |
| G3-regression tolerance | ± 0.05 (`REL_TOLERANCE`) | `[C]` bron niet gevonden (`baseline.ts`: "5 points", geen afleiding) → toetsen tegen gemeten judge-variantie (B2); herijk na ≥ 14 nightly-runs. |

> **Regel (voldaan in Fase 4):** elke `[?]` is óf herleid naar een bron, óf expliciet omgezet naar
> `[C]` met herijk-trigger. **Absence of findings is a finding.**

---

## 4. Invarianten (infrastructuur — geen gates)

Deze eigenschappen borgen dat de gates zelf te vertrouwen zijn. Geborgd via unit tests en
CI-config; falen = rode `verify`, maar ze verschijnen niet in het lagenmodel of het klantverhaal.

### 4.0 Overzicht

| Invariant | Wat het borgt | Herkomst |
|---|---|---|
| Eval scoort het productiemodel | eval-generator = `DEFAULT_LLM_MODEL` via `EVAL_GENERATION_MODEL`, één seam | E1 · zie §4.1 |
| Skip ≠ pass | een gate die niet kan draaien wordt ROOD waar hij verplicht is (`EVAL_REQUIRE_ALL`/`_DB`), env bereikt de eval echt (turbo `passThroughEnv`) | E0/E8 · zie §4.2 |
| Eén verified-answer-seam | `generateVerifiedAnswer`/`generateAnswerWithRepair` gedeeld door `answer()`, `answerStream()` én de eval | zie §4.3 |
| Judge-robuustheid | exact één parse-retry, fail-loud, geen default scores; mediaan over `EVAL_JUDGE_SAMPLES`. **P4 (judge ≠ generator) vervallen 2026-08-22:** judge = generator = productie-Large; soft metrics hebben self-preference; blocking floors blijven deterministisch | E2/P3b |
| Golden-set-schema | refusal-cases ≥ 1 distractor; loader gooit zonder `FUND_SET_META` | E3/E12 |
| Shared assemble | eval-context = productie-`assemble()` (snapshot-test); geaccepteerd residu: `sourceRef`-formaat (zie §4.5) | E4 |
| K-alignment | candidateK 15 → topK 5 = wat het model ziet = wat de gate meet | E6 |
| Baseline-integriteit | een baseline die zelf de absolute G2-floors niet haalt mag niet geschreven worden (write-guard, live) | zie §4.4 |
| Run-artefact | `eval-report.json` geschreven en geüpload, ook bij failure. Langfuse dataset-run push (E9 stap 2) = **bewuste backlog** tot go-live (besluit B6) | E9 |
| Fixture-hygiëne | hash-guard: fixture-edit zonder corpus-version-bump → fail | E10 |
| CI-afdwinging | branch protection: `verify` required, merge queue actief | plan Fase 0 (repo-side) |

De drie invarianten hieronder zijn integraal bewaard omdat ze uit een reëel incident komen
(commit `c763ea0` "share verified-answer path across answer() and stream" reverte de eval stilletjes
naar een goedkopere hardcoded generator; de merge naar `main` (`a35c13d`) ging tóch groen). Dit
document bestaat opdat die klasse fouten voortaan luid faalt.

### 4.1 Invariant — de eval scoort het model dat productie levert

**Regel.** De eval-generator MOET gelijk zijn aan de productie-generator (`DEFAULT_LLM_MODEL`),
en ALLEEN divergeren via een expliciete `EVAL_GENERATION_MODEL`-override. Nooit een hardcoded
model-literal.

```ts
// packages/agents/src/evals/cao.eval.ts
const EVAL_LLM_MODEL = env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL;
```

De eval moet generatie ook door dezelfde **seam** draaien die productie gebruikt
(`generateAnswerWithRepair`, `maxAttempts: env.EVAL_GENERATION_SAMPLES ?? 2` = één generatie + één
repair), niet een eigen single-shot `generateText`. Een ander model of ander generatiepad scoren
betekent dat G2-answer iets valideert dat gebruikers nooit krijgen.

**Afdwinging.**
- Offline unit test: `packages/agents/src/evals/eval-model-coupling.test.ts` (draait op `test:unit`,
  zonder API-keys, dus op elke PR — ook als G2 skipt). Faalt als `EVAL_LLM_MODEL` iets anders is dan
  `env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL`, of aan een literal is gepind.
- Het run-artefact registreert `models.generator` (= `EVAL_LLM_MODEL`), zodat drift zichtbaar is in
  `eval-report.json`.

**Corollarium — `DEFAULT_LLM_MODEL` is een dragende keuze, geen meelifter.** Elke consument van
`DEFAULT_LLM_MODEL` (productie-generator, eval-generator, en ancillaire calls zoals
query-condensatie) erft een bump. Een wijziging is een productie-brede kosten- + gedragswijziging en
verdient een decision-log/ADR-regel — geen neveneffect van een gate-close-out. (De Small→Large-bump
in `a9299a1` is het waarschuwende voorbeeld: die verplaatste condensatie óók naar Large, ~3× de
input-prijs voor een 64-token rewrite.)

### 4.2 Invariant — skipped ≠ passed (een gate die niet kan draaien moet ROOD worden waar hij verplicht is)

**Regel.** Op de beschermde paden (`push` naar `main`, `merge_group`, `schedule`, en same-repo PRs)
MOET een gate die niet kan draaien omdat een credential ontbreekt **falen**, niet skippen.
`EVAL_REQUIRE_ALL=1` maakt een skip een fail (`REQUIRE_ALL` / `reportUnavailable` in `cao.eval.ts`);
`EVAL_REQUIRE_DB=1` doet hetzelfde voor de nightly DB-integratiegates.

**De subtiele faalwijze (die ons raakte).** De eval-code implementeerde skip-als-fail al correct.
Het gat zat upstream: **Turbo (v2, strict environment mode by default) filtert elke env-var weg die
niet voor de task is gedeclareerd.** `ci.yml` zette `EVAL_REQUIRE_ALL=1` op de *job*, maar de
`test`-task declareerde alleen `SCALEWAY_API_KEY` + `MISTRAL_API_KEY`, dus `EVAL_REQUIRE_ALL` (en
`DATABASE_URL`, `EVAL_REQUIRE_DB`, `EVAL_JUDGE_SAMPLES`, `GITHUB_SHA`, …) bereikte het eval-proces
nooit. Gevolg: `REQUIRE_ALL` was `false`, G2 skipte-en-slaagde, en de merge ging groen. Bewijs: run
`29767229051` (`push` @ `a35c13d`) = `success` met `EVAL_REQUIRE_ALL='1'` nominaal gezet.

**Afdwinging.**
- `turbo.json`: de `test`-task declareert **alle** eval-control- + credential-vars in `passThroughEnv`,
  en zet `"cache": false` (een live eval die netwerk/DB raakt mag nooit een gecachte "pass"
  replayen). Elke nieuwe `EVAL_*`/credential die de eval leest MOET daar worden toegevoegd, anders
  wordt hij stilletjes gestript in CI.
- `ci.yml`: `EVAL_REQUIRE_ALL` is `1` op `push`/`merge_group`/`schedule`/same-repo PRs; `0` op
  fork-PRs (die legitiem geen secrets hebben).
- Branch protection op `main` vereist de `verify`-check. **Maar een required check is niet sterker
  dan wat erin draait** — met deze invariant kapot was `verify` groen terwijl de gates inert waren.
  Branch protection + deze invariant zijn een paar; geen van beide alleen is een slot.

### 4.3 Invariant — één verified-answer-seam, drie consumenten

De structurele endgame die `c763ea0`'s eigen titel impliceert: het verified-answer-pad
(`generateVerifiedAnswer` / `generateAnswerWithRepair`) heeft **drie** consumenten — `answer()`,
`answerStream()`, en de **eval**. Zolang alle drie de enkele geëxporteerde seam delen, vereist
divergentie een bewuste codewijziging in plaats van een merge-ongeluk. Betrap je jezelf erop dat je
generatie opnieuw implementeert binnen de eval: stop, importeer de seam.

### 4.4 Invariant — baseline-integriteit (een rode run mag nooit de lat worden)

**Regel.** De baseline is de regressie-referentie waartegen G2-answer ±tolerance vergelijkt. Een
`EVAL_WRITE_BASELINE=1`-run mag ALLEEN een baseline vastleggen als die run **zelf** elke absolute
G2-answer-floor haalt. Een run die onder een floor zit vastleggen, verlaagt stilletjes de lat — de
regressiecheck vergelijkt daarna tegen een rode referentie en dekt de degradatie toe.

**Herkomst.** Het corrupt-baseline-incident: een run met `underRefusalRate` 0.333 en
`softFaithfulness` 0.784 werd als baseline weggeschreven en gold daarna als de te evenaren bar.

**Afdwinging.**
- `packages/agents/src/evals/answer-floors.ts` — één bron van waarheid voor de absolute floors
  (`ANSWER_THRESHOLDS`) én de guard `answerFloorFailures(aggregate)`, die de gemiste floors
  teruggeeft (leeg = alle floors gehaald). Pure functie, geen env/I-O.
- `cao.eval.ts` (write-pad): bij `EVAL_WRITE_BASELINE` draait de guard vóór `updateBaselineSection`;
  bij één of meer gemiste floors wordt de answer-sectie **niet** geschreven en logt de eval welke
  floors faalden. Dezelfde floors voeden `answerLevelChecks` (Gate C), dus code en guard kunnen niet
  uit elkaar lopen.
- `packages/agents/src/evals/answer-floors.test.ts` — unit test (`test:unit`, geen API-keys): een
  gezonde run passeert, een run op de floor-grens passeert (`>=`/`<=`), en elke floor-overtreding
  wordt afzonderlijk gemarkeerd.

De CI-`write-baseline`-job draait de eval mét `EVAL_WRITE_BASELINE`; de guard zit in het eval-proces
zelf, dus de job erft de bescherming zonder extra `ci.yml`-stap.

### 4.5 Geaccepteerd residu — `sourceRef`-formaat (E4)

De eval-fixture-adapter en de productie-ingest bouwen `sourceRef` net anders op:

- Fixture (`golden-set.ts` `sourceRefFor`): `` `Artikel ${passage.article}` `` → bv. `"Artikel 5.2"`, **zonder los lid-component**.
- Productie-ingest (`scripts/ingest/chunk.ts` `buildSourceRef(chapter, article, lid)`): `"Artikel 5, lid 2"`, chapter/lid-bewust.

**Impact op citatie-matching: geen.** `sourceRef` is nergens een matching-sleutel. `verifyCitations`
matcht op (a) `chunkId` — met een whitespace-robuuste fallback in `resolveChunkContent` die het bare
id vóór de eerste spatie neemt, dus óók `"<id> (Artikel 5, lid 2)"` correct oplost — en (b) het quote
verbatim tegen de chunk-content. Het `sourceRef`-formaat verschijnt alleen als leesbare anchor
`(sourceRef)` in de assemble-context en als label op de UI-citatiekaart. De eval-fixtures-fund is
intern consistent (retrieval én ingest gebruiken dezelfde `sourceRefFor`); de divergentie bestaat
alleen tegen een echte full-CAO-ingest via `chunk.ts` — en dát formaat wordt **nachtelijk in G3**
(productie-pipeline op de echte corpus) wél gedraaid.

**Verdict: geaccepteerd, niet gedicht.** Unificeren zou de fixtures verrijken met een lid-veld dat
`buildSourceRef` spiegelt — een speculatieve wijziging zonder matching-winst (regel van drie: geen
tweede usecase dwingt het af). Herzien wanneer een fonds-corpus lid-dragende anchors nodig heeft in
de G2-fixtures zelf.

### Change-control op `src/evals/` (preventie, want er is geen tweede reviewer)

Als solo-founder is er geen tweede menselijke reviewer; de merge zelf is de enige poort. Twee
gewoontes:

1. **`.cursor/rules/700-evals.mdc`** — wijzig bestanden onder `packages/agents/src/evals/` (of de
   productie-seams die de eval scoort) niet buiten een expliciete opdracht daartoe. De eval is het
   meetinstrument; het wijzigen als neveneffect van ongerelateerd werk is hoe `c763ea0` gebeurde.
2. **Diffstat-merge-gewoonte** — vóór het mergen van een branch: bekijk `git diff --stat <base>...HEAD`.
   Een grote onverklaarde delta op een eval-/meetbestand (`c763ea0` was **−806 netto** op
   `cao.eval.ts` in een commit met scope `agent.ts`) is een stopteken: reconcilieer vóór je landt.

### Checklist bij het raken van de eval of zijn config

- [ ] `EVAL_LLM_MODEL` nog steeds `env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL` (unit test groen).
- [ ] Generatie loopt via `generateAnswerWithRepair` (de productie-seam), geen one-shot call.
- [ ] Elke nieuwe `EVAL_*`/credential-var staat in `turbo.json` `passThroughEnv` ÉN `.env.example`.
- [ ] `turbo.json` `test`-task heeft nog `"cache": false`.
- [ ] Een `DEFAULT_LLM_MODEL`-wijziging heeft een decision-log/ADR-regel.
- [ ] Diffstat bekeken; geen onverklaarde delta op `src/evals/`.

---

## 5. Open besluiten

Verwijzen naar `PLAN-gate-restructure.md`; hier genoteerd zodat dit document eerlijk is over wat nog
niet vaststaat.

| # | Besluit | Status / uitkomst |
|---|---|---|
| B1 | relevance-drempel 0.84 of 0.85 | **BESLOTEN (2026-07-21): 0.84 blijft** — empirisch onderbouwd (gemeten judge-ruis 0.845–0.865 @3 samples; 0.84 net onder de spread zodat één flaky draw de gate niet flipt). Label `[E]`. |
| B2 | regressiechecks nightly-only (na judge-variantie-meting) | **BESLOTEN (2026-07-21): under-refusal-*rate*-regressie geschrapt.** Meting: judge-metriek-spread @1 vs @3 (faithfulness Δ0.032, relevance Δ0.032, completeness Δ0.025) blijft **< tolerantie 0.05** → judge-ruis rechtvaardigt geen nightly-only; de overige regressiechecks blijven op de PR-hot-path. De @1-run faalde puur op under-refusal-rate (0.333 vs 0.000) = generatie-variantie bij N=3 fixtures; die rate-regressie is nu verwijderd (`answerRegressionChecks`), de absolute **count**-gate ≤1 blijft de bescherming. **Vervolg (2026-08-22):** (1) de count-gate liet 1 slip toe, maar die case zette faith/rel/complete op 0 in het all-cases-gemiddelde en faalde relevance-regressie met 0.002 tegen een baseline bij underRefusal=0 — faith/rel/complete middelen sindsdien alleen over answerable cases. (2) `refusalCalibration` uit `higherIsBetter` gehaald: twee slips (29/31 = 0.935) faalden de 5-puntsband tegen baseline 1.000 terwijl de count-gate bij één slip al de echte lat is; de floor ≥ 0.90 blijft. |
| B3 | drempel-inversie G2 vs G3 opheffen | **BESLOTEN (2026-07-21): provisional laten** — G3-drempels `[C]`, herijken na ≥ 14 nightly-runs op gemeten data, daarna ≥ G2-niveau of expliciet gemotiveerd verschil. |
| B4 | moet G3-fail iets blokkeren (deploy-gate) of blijft het visibility | **HERZIEN (2026-07-31): beide, gescheiden per doel.** Nachtelijk `G3-fund`-rood blokkeert `main` **niet** — daar blijft het visibility — maar blokkeert **promotie van het betreffende fonds** wél (besluit D5 van het ingest-herstelplan). Rationale: een fonds-rood zegt iets over de corpus van dát fonds, niet over de correctheid van de code op `main`; `main` blokkeren zou al het werk stilzetten voor een probleem in één corpus, terwijl promoveren met een rood fonds precies de fout is die de gate moet voorkomen. Uitvoerbaar gemaakt als `pnpm promote-check <fonds> <tag>` (§7). Herzien zodra de gate-set stabiliseert of promotie geautomatiseerd wordt. |
| B5 | Gate D ooit RLS-afgedwongen of app-seam voldoende | app-seam interim; klantformuleringen aanpassen tot RLS bestaat (zie §G3 isolatie-mechanisme + Bijlage B) |
| B6 | Langfuse dataset-run push (E9 stap 2): backlog of harde eis | **BESLOTEN (2026-07-21): bewuste backlog tot go-live.** Reden: het `eval-report.json`-artefact wordt al bij elke run geschreven én in CI geüpload (ook bij failure), dus reproduceerbaarheid + regressie zijn gedekt; een Langfuse dataset-run voegt vooral gedeelde review-UI toe, geen extra correctheidsgarantie. Herzien bij go-live / eerste getekende fonds. |
| B7 | scoort de fondslaag ook **antwoordgedrag**, of blijft hij retrieval-only | **OPEN (gesteld 2026-07-31).** De `refusal`-cases van een fonds-set beschrijven bedoeld weigergedrag, maar de fondslaag doet geen antwoordscoring — sinds de guard-correctie worden ze gerapporteerd als *niet gescoord* in plaats van verkeerd gescoord (`BESLUIT-refusal-guard-2026-07-31.md`, optie B). Sluiten kost LLM-calls per fonds per nacht; niet sluiten laat "weigert de agent op een bijna-treffer?" per fonds onbewaakt, terwijl de basislaag dat wél meet. Beslissen vóór fonds #2 live gaat. |

---

## 6. Changelog (drempels & structuur)

| Datum | Wijziging | Reden | Door |
|---|---|---|---|
| 2026-07-19 | Initiële draft vier-lagen-model | Herstructurering | Claude/Jordy |
| 2026-07-21 | Draft samengevoegd met de bestaande invarianten-doc tot dit canonieke document; drempeltabel bijgewerkt naar de feitelijke code-waarden (count-vs-rate, minScore 0.48); nulmetingen per laag toegevoegd (branch `fix/eval-gate-enforcement`, integraal groen) | Fase 1 van `PLAN-gate-restructure.md`; oude draft-bron (`gates-overview.md`) bestond niet; invarianten-inhoud mocht niet verloren gaan | Cursor/Jordy |
| 2026-07-21 | Invariant Baseline-integriteit gepromoveerd van "nieuw" naar live (§4.4); floors + write-guard geëxtraheerd naar pure `answer-floors.ts` en gedekt door `answer-floors.test.ts` | Fase 3 van `PLAN-gate-restructure.md`; guard testbaar maken zonder de eval te draaien | Cursor/Jordy |
| 2026-07-21 | Bronlabels ingevuld (Fase 4 actie 4+5): minScore 0.48 → `[E]` (gemeten score-gap), softFaithfulness → `[C]` (PLAN P5-range), relevance 0.84 → `[E]` (judge-ruis), underRefusal-count → `[E]` (N=31-tolerantie); 8 oncontroleerbare drempels (retrieval 4×, citationCorrectness, completeness, refusalCalibration, overRefusal, REL_TOLERANCE) `[?]` → `[C]` + herijk-trigger | git log/blame + PLAN-historie leverde geen afleiding voor die 8; geen enkele `[?]` mag richting bestuur blijven staan | Cursor/Jordy |
| 2026-07-21 | Besluiten (Fase 4): **B1 relevance 0.84 blijft** (empirisch); **B3 G3-drempels provisional** (herijk na ≥14 nightly); **B2 uitgesteld** tot judge-variantie-meting | verdedigbare, gelogde drempeltabel richting bestuur | Jordy |
| 2026-07-21 | **Actie 6:** `citationCorrectness` middelt nu over answerable cases (refusals uitgesloten) i.p.v. alle cases | een correcte refusal scoort vacuous 1.0 en flatteerde het gemiddelde; refusal-correctheid zit al in refusalCalibration + under-refusal. **Effect:** de gerapporteerde waarde daalt t.o.v. een baseline over alle cases → **baseline-herijking vereist** vóór de citationCorrectness-regressiecheck weer klopt (gecoördineerde `write-baseline`-run) | Cursor/Jordy |
| 2026-07-21 | **Baseline herijkt (corpus v4, @3 samples)** na actie 6: faithfulness 0.994→1.000, completeness 0.913→0.919, overige gelijk (citationCorrectness 1.0, relevance 0.971, under-refusal 0). Write-guard groen; eval integraal PASSED | actie-6-definitie vastleggen zonder de lat te verlagen (nieuwe baseline ≥ oude) | Cursor/Jordy |
| 2026-07-21 | **B2 besloten:** under-refusal-*rate*-regressiecheck verwijderd uit `answerRegressionChecks` | rate is noisy bij N=3 refusal-fixtures (@1-draw flipte de gate op 0.333); absolute count-gate ≤1 beschermt al | Cursor/Jordy |
| 2026-07-21 | **Fase 5 (G4-streaminglek):** "bekend lek"-notitie verwijderd; §G4 herschreven naar buffer-to-verify (optie A). Emit-pad geëxtraheerd naar de pure seam `settledAnswerEvents` (agent.ts) en samen met `verifyAndBuild` geborgd door `agent.test.ts` | het lek was al gedicht door buffer-to-verify (commit `c763ea0`, 2026-07-20); de notitie was per abuis uit de pre-buffer-draft overgenomen. Bescherming was impliciet/ongetest en de client is token-stream-ready → regressietest legt het vast | Cursor/Jordy |
| 2026-07-21 | **Fase 6 (docs-hygiëne):** §G3 isolatie-mechanisme expliciet gemaakt (app-laag, RLS niet geïmplementeerd); §4.5 toegevoegd (E4 `sourceRef`-residu **geaccepteerd**, geen matching-impact); **B6** vastgelegd (Langfuse dataset-run push = backlog); **Bijlage B** claim↔gate-kruistabel toegevoegd (gedekt vs. niet-claimen) | claims-hygiëne: geen doc-claim mag verder gaan dan een geïmplementeerde gate; RLS-formulering, Langfuse-besluit en E4-residu vastleggen | Cursor/Jordy |
| 2026-07-29 | **Kanaaldimensie (MCP):** sectie "Kanaal als dimensie" toegevoegd — geen eigen gate-laag; G1–G4 gelden over `channel`; relay-fidelity als release-drempel bij MCP-go-live | `PLAN-mcp-server.md` Fase 7 | Cursor/Jordy |
| 2026-07-31 | **B4 herzien + promotiepoort (§7):** nachtelijk `G3-fund`-rood blokkeert `main` niet maar wel promotie van dat fonds; uitvoerbaar als `pnpm promote-check <fonds> <tag>` op een append-only ledger (`docs/eval/gate-results/g3-fund.jsonl`). `eval-report.json` legt nu ook lokaal de commit vast, zodat een groen zich kan identificeren | Fase 4 ingest-herstelplan (besluit D5); een nachtelijk rood was tot nu toe een gat: het blokkeerde niets en het resultaat overleefde de volgende run niet | Cursor/Jordy |
| 2026-07-31 | **Fonds-refusal-guard gerepareerd (testwijziging, C4 met meting):** de guard gebruikte de `refusal`-cases van de fonds-set als out-of-corpus-probes en eiste nul treffers. Die cases zijn bijna-treffers die per ontwerp iets ophalen: op de ETD-CAO scoort de probe 0,647 terwijl twee echte vragen op 0,569 en 0,642 staan, dus **geen enkele drempel** scheidt ze. De fondslaag gebruikt nu dezelfde drie gedeelde onzinvragen als de basislaag (0/3 treffers op alle corpora, marge 0,10). Bijna-treffers blijven in de golden set en worden expliciet als *niet gescoord* gerapporteerd (`unscoredNearMissCases`) i.p.v. stil te verdwijnen | Gemeten in `docs/eval/BESLUIT-refusal-guard-2026-07-31.md`; `cao.eval.ts:158-165` stelde deze ongeschiktheid al vast voor de basislaag, de fondslaag deed precies wat dat commentaar verbood. Groen op de fixtureset was een marge van 0,015 — ruis, geen ontwerp | Cursor/Jordy |
| 2026-07-31 | **`Bewijst niet`-regel per laag (G1–G4) + sectie ingest-contract (§2):** expliciet gemaakt dat G2 niets over een echt corpus zegt en dat een groene `G3-fund [etd]` de productie-ingest niet dekt; het structuurrapport vastgelegd als visibility-laag met het pad naar drempels (na calibratie, alleen omhoog) | Fase 6 ingest-herstelplan; de blinde vlek uit `diagnosis-fund-article-metadata-2026-07-30.md` §3.2 stond nergens in het canonieke document, waardoor een groene gate meer leek te bewijzen dan hij deed | Cursor/Jordy |
| 2026-08-22 | **Faithfulness / relevance / completeness middelen over answerable cases** (zelfde uitsluiting als citationCorrectness, actie 6). Per-case blijven refusal-scores `refusalCalibration` kopiëren; het aggregaat niet. Baseline.json niet met de hand herschreven: bij underRefusal=0 is de definitieverschuiving ~0.003–0.009, binnen `REL_TOLERANCE` 0.05; de volgende groene `EVAL_WRITE_BASELINE`-run legt de nieuwe definitie vast | PR-hot-path (#18/#19): toegestane under-refusal count ≤1 zette faith/rel/complete op 0 in het 31-case-gemiddelde en faalde relevance-regressie (0.919 vs baseline 0.971, drempel 0.921). Refusal-kwaliteit zit al in refusalCalibration + under-refusal-count. Unit-test: `does not let an allowed under-refusal zero faithfulness/relevance/completeness` | Cursor/Jordy |
| 2026-08-22 | **B2 follow-up:** `refusalCalibration` uit `answerRegressionChecks` (`higherIsBetter`) gehaald. Absolute floor ≥ 0.90 en under-refusal-count ≤ 1 blijven. Repair-turn: naar-rato-hatch alleen bij ungrounded fact + deeltijd/pro-rata-signaal (`isProRataViolation`); niet-regelt-clausule altijd, met exacte `NOT_FOUND_MESSAGE` | Zelfde N=3-ruis als de geschrapte under-refusal-rate-regressie: 2/3 answered (etd-025/026) → 0.935 vs baseline 1.000 faalt de 5-puntsband, terwijl count=2 al rood is op de count-gate. De onvoorwaardelijke hatch in `buildRepairMessages` leerde het model op etd-026 "verwijs naar het fonds" i.p.v. te weigeren. Unit-tests: `isProRataViolation` + repair-prompt hatch on/off | Cursor/Jordy |

---

## 7. Promotiepoort per fonds (`promote-check`)

Dit is de uitvoerbare vorm van het herziene besluit B4: `main` blijft open bij een fonds-rood, maar
dat fonds promoveren kan niet. Er is geen geautomatiseerd promotieproces in deze repo (de
Scalingo-deploy staat buiten de repo, zie `docs/STATUS.md`), dus de poort is één commando dat als
scriptstap én als checklistregel werkt.

```
pnpm promote-check <fonds> <tag>      # exitcode 0 = GO, 1 = NO-GO, 2 = verkeerd gebruik
```

Het fonds mag je opgeven als golden-set-sleutel (`etd-full`) of als databasefonds
(`elektronische-detailhandel`).

**GO vereist alle vijf.** Alles wat onbekend is, geldt als NO-GO — een poort die zwijgen als
goedkeuring leest, is geen poort.

| # | Voorwaarde | Waarom |
|---|---|---|
| 1 | Er is een `G3-fund`-resultaat voor dit fonds in de ledger | Zonder meting is er niets om op te varen |
| 2 | Dat resultaat is `passed` (niet `failed`, niet `skipped`) | Een gate die niet kon draaien is geen groen |
| 3 | Het resultaat noemt een commit, en die hoort bij `<tag>` | Een groen dat niet kan zeggen waarover het groen is, bewijst niets over deze release |
| 4 | Er is een ingest-structuurrapport voor het fonds | Anders is de kwaliteit van de laatste ingest onzichtbaar (koppeling met het meetinstrument) |
| 5 | De laatste **ingest** ligt vóór de gate-run | Is er ná de run opnieuw geïngest, dan beschrijft het groen data die er niet meer staat |

Voorwaarde 5 kijkt naar de laatste *ingest* uit het rapport, niet naar de datum van het rapport zelf:
een read-only hermeting van een onveranderd corpus is legitiem en mag niet blokkeren.

**Waar het resultaat landt.** `eval-report.json` is gitignored en wordt door de volgende run
overschreven, dus elke run schrijft per fonds ook één regel naar
`docs/eval/gate-results/g3-fund.jsonl` (append-only, gecommit). Toevoegen is idempotent op
(set, run, commit). Een CI-run kan niet committen; daar wordt de regel na afloop uit het geüploade
artefact afgeleid met `pnpm --filter @wunderstack/promote record <eval-report.json>` — dezelfde
afleidingsfunctie, dus een nagespeelde regel is identiek aan een live regel.

**Grens van deze poort.** Hij leest alleen gecommit bewijs — geen database, geen netwerk — zodat hij
nooit wordt overgeslagen wegens ontbrekende credentials. Daardoor kan hij één ding niet zien: een
ingest die is gedaan zonder dat er een structuurrapport is geschreven. Via `scripts/ingest/run.ts`
kan dat niet gebeuren (het rapport is daar onvoorwaardelijk), maar het is een aanname over het
gebruikte pad, geen bewijs.

### Checklist bij het promoveren van een fonds

- [ ] `pnpm promote-check <fonds> <tag>` geeft **GO** (exitcode 0). Bij NO-GO: eerst de genoemde
      blokkade oplossen, niet de drempel.
- [ ] De genoemde `corpus`-versie is de versie die je wilt uitrollen.
- [ ] Openstaande besluiten voor dit fonds zijn afgehandeld (zie `docs/eval/intervention-log.md`
      → *Openstaand*).

---

## Bijlage A — Mapping oud → nieuw

### A.1 Gates & eval-labels (E-reeks)

| Oud label | Nieuw | Opmerking |
|---|---|---|
| Gate A (prompt/clarify) | G1 | fixture-hash-deel → invariant Fixture-hygiëne |
| Gate B | G2-retrieval | |
| Gate B2 | G2-retrieval, case-categorie `multi-turn` | geen aparte gate meer (refactor: plan Fase 2) |
| Gate C | G2-answer | |
| Gate C (regressie) | G2-answer regressie | besluit B2 (nightly-only in beraad) |
| Gate B-integration | G3-pipeline | |
| Gate D-contract | G1 | |
| Gate D-integration | G3-isolation | |
| Gate F | G3-fund | conceptueel de topgate |
| Gate E | — | heeft nooit bestaan (feit, audit) |
| E0/E8 | invariant Skip ≠ pass | |
| E1 | invariant Eval scoort het productiemodel | |
| E2 | invariant Judge-robuustheid | |
| E3 | invariant Golden-set-schema + G2-answer refusal-metrics | residu: citationCorrectness=1 op refusals → plan Fase 4 |
| E4 | invariant Shared assemble | residu sourceRef-formaat **geaccepteerd** (§4.5), geen matching-impact |
| E5 | G2-retrieval (rerank-checks) | |
| E6 | invariant K-alignment | |
| E7 | G2-answer regressie + invariant Baseline-integriteit | |
| E9 | invariant Run-artefact | Langfuse dataset-run push = backlog (besluit B6) |
| E10 | invariant Fixture-hygiëne | |
| E11 | G3-pipeline | ≡ B-integration |
| E12 | invariant Golden-set-schema + G3-fund | |
| E13 | G4 | |

### A.2 Plan-labels (P-reeks, `PLAN-eval-gates.md`)

| P | Onderwerp | Nieuw |
|---|---|---|
| P1 | skip ≠ pass (`EVAL_REQUIRE_ALL`, required checks, merge queue) | invariant Skip ≠ pass + invariant CI-afdwinging |
| P2 | Gate A eerlijk benoemen (contract-test) | G1 |
| P3a | modelpinning (reproduceerbare baseline) | invariant Eval scoort het productiemodel |
| P3b | flakiness dempen (judge-samples mediaan) | invariant Judge-robuustheid |
| P4 | judge ≠ generator | **Vervallen 2026-08-22.** Generator moet productie zijn (`DEFAULT_LLM_MODEL` = Large). Enige soevereine alternatieve judge is Small; zwakker model dat Large beoordeelt is slechter dan self-preference. Soft metrics: full self-preference. Blocking floors (hard-hallucination, count-gates) blijven judge-onafhankelijk. Afgedwongen: `JUDGE_MODEL === DEFAULT_LLM_MODEL` in `eval-model-coupling.test.ts`. |
| P5 | faithfulness splitsen (hard-hallucination) | G2-answer (hardHallucination + softFaithfulness) |
| P6 | over-/under-refusal apart rapporteren | G2-answer (overRefusal + underRefusal) |
| P7 | recall op artikel/lid + corpus-snapshot | G2-retrieval + invariant Fixture-hygiëne |
| P8 | rerank van rapport naar gate (MRR-delta) | G2-retrieval |

`PLAN-eval-gates.md` is gearchiveerd (superseded door dit document); zie de banner bovenaan dat
bestand.

---

## Bijlage B — Claim ↔ gate kruistabel (klant / procurement)

Doel: elke klant-/procurement-claim mag **alleen** gebruikt worden als er een geïmplementeerde gate
of mechanisme achter staat. Deze tabel is de bron voor procurement-materiaal; de standalone
procurement-pack (PLAN-v3 Fase 17) put hieruit en voegt niets toe wat hier niet gedekt is. De
klantversie-alinea (§2) bevat uitsluitend claims uit de rij-groep **"gedekt"** hieronder.

### B.1 Gedekt — vrij te gebruiken

| Klant-claim | Gedekt door | Bewijs |
|---|---|---|
| "Het systeem antwoordt alleen op basis van de CAO-teksten (geen algemene kennis)." | G2-answer (softFaithfulness- + hardHallucination-floors) · G4 runtime hard-fact-guard | §G2 · §G4 |
| "Een hard feit (bedrag, percentage, termijn) zonder geverifieerde bron wordt niet gegeven." | **G4** `verifyAndBuild` → `hasUngroundedHardFact`-guard, per individueel antwoord | §G4 (blocking, buffer-to-verify) |
| "Elke bronvermelding is verifieerbaar: het citaat staat letterlijk in de aangehaalde CAO-tekst." | G2-answer (citationVerification, orphan/dangling) · runtime `verifyCitations` (verbatim, strip-on-fail) | §G2 · `verify-citations.ts` |
| "We toetsen bij elke codewijziging of de spelregels nog in het systeem staan." | G1-contract (change-detector) | §G1 |
| "We toetsen het gedrag op een vaste, met domeinexperts samengestelde set voorbeeldvragen." | G2 (gedrag op golden-set-fixtures) · invariant Golden-set-schema | §G2 · §4.0 |
| "Elke nacht draait dezelfde toets op de echte CAO-teksten van het fonds." | G3-fund op een **werkelijk geïngest** corpus: `demo` (markdown) en `etd-full` (echte CAO-PDF). **Niet** met `G3-fund [etd]` onderbouwen — die scoort de fixtureset, geen CAO-tekst (zie `Bewijst niet` bij G3) | §G3 · `docs/eval/golden-sets/NULMETING-etd-full-2026-07-30.md` |
| "Van elke ingest is meetbaar vastgelegd hoeveel CAO-structuur behouden bleef." | Ingest-contract: structuurrapport per ingest, plus promotievoorwaarde 4 die een fonds zonder rapport niet promoveerbaar maakt. **Meetlaag, geen drempel** — niet als "gate" presenteren | §2 ingest-contract · §7 |
| "Een fonds met een rode nachtelijke toets kan niet worden uitgerold." | `pnpm promote-check <fonds> <tag>` — harde NO-GO op een rood, ontbrekend of niet-identificeerbaar `G3-fund`-resultaat (B4 herzien) | §7 · `docs/eval/ingest/PROMOTION-GATE-2026-07-31.md` |
| "De kwaliteitslat is een CI-poort: zakt een meting weg, dan blokkeert de merge." | G2 blocking (`EVAL_REQUIRE_ALL`) · invariant Skip ≠ pass · invariant Baseline-integriteit. Geldt voor **G1/G2**; een G3-fondsrood blokkeert de merge niet maar de uitrol van dat fonds (§7) | §4.2 · §4.4 · §7 |
| "Fondsdata wordt per fonds gescheiden gehouden." | G3-isolation (0 cross-fund leakage, **applicatielaag**) | §G3 isolatie-mechanisme |
| "Het standaard request-pad is EU-soeverein." | Architectuurkeuze (Mistral · Scaleway · Scalingo · Langfuse EU) — géén gate, wél hard in `000-core.mdc`/`100-stack.mdc` | regels 000/100 |

### B.2 Nog NIET gedekt — niet claimen (of expliciet als "gepland" formuleren)

| Verboden/te-nuanceren claim | Werkelijke stand | Correcte formulering |
|---|---|---|
| "Isolatie afgedwongen op **databaseniveau** (Postgres RLS)." | Geen RLS-policies in de repo (0 grep-treffers). Isolatie loopt via de app-laag-query + G3-isolation. | "Isolatie afgedwongen op applicatielaag; RLS gepland (PLAN-v3 Fase 16, besluit B5)." |
| "De corpus is gegarandeerd actueel t.o.v. de vigerende CAO." | G3-freshness is **gereserveerd**, niet gebouwd. | "Corpus-actualiteit is een geplande gate (PLAN-v3 Fase 16); nu procesmatig geborgd." |
| "Multi-tenant / meerdere fondsen live." | Bewust niet in v1 (single-tenant demo). | "Single-tenant demo; multi-tenancy volgt bij het eerste getekende fonds." |
| "Alle metingen zijn gedeeld en herspeelbaar in Langfuse als dataset-runs." | Langfuse dataset-run push niet geïmplementeerd (besluit B6, backlog). Wel: `eval-report.json` per run + CI-upload. | "Elke run levert een machine-leesbaar rapport (in CI bewaard); gedeelde Langfuse-datasets zijn backlog." |
