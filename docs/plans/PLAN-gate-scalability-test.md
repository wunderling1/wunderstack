# PLAN — Schaalbaarheidstoets gates (koude-doorloop-protocol)

**Bouwt op:** `docs/eval/GATE-ARCHITECTURE.md` (G1–G4, canoniek) · `docs/plans/PLAN-gate-restructure.md` ·
`BESLISNOTITIE-platform-vs-eigen-agent.md` (nog niet in de repo — levert bewijs voor beslisregel
**BN-B2/BN-B4** en validatieacties 2 en 4)
**Status:** ter goedkeuring · **Datum:** 2026-07-30
**Labels:** [feit] · [anker] · [ontwerp] · (aanname) · [schatting]

---

## 0. Kern

"Self-service schaalbaar" is geen gevoel maar vier toetsbare eigenschappen. Dit protocol maakt ze
meetbaar zónder op fonds #2 te wachten: CAO's zijn publiek, dus je kunt vandaag 3 publieke avv-CAO's
als **synthetische tenants** door je bestaande pipeline halen. De uitkomst is geen mening maar een
logboek: interventies, scores, detectiegraad, kosten.

| Eigenschap | Vraag | Instrument |
|---|---|---|
| **1. Validiteit** | Vangen de gates wat ze claimen te vangen — óók op een vreemd corpus? | Foutinjectie ("test de test") |
| **2. Reproduceerbaarheid** | Draait de pipeline op een nieuw corpus zonder handen? | Koude doorloop met interventielog |
| **3. Schaalbaarheid** | Blijft het betaalbaar en snel bij n fondsen × frequente runs? | Kosten/duur per run × frequentie |
| **4. Zelfbedienbaarheid** | Kan een niet-Jordy het draaien en het rapport begrijpen? | Handen-op-de-rug-run + naïeve-lezer-test |

Validiteit staat bovenaan met reden: een gate-suite die reproduceerbaar, goedkoop en self-service is
maar under-refusal doorlaat, is **erger dan niets** — op schaal verscheept een vals-groen naar álle
fondsen tegelijk.

---

## 0.1 Verankering in de repo (verificatie van de ingediende versie) [feit]

De ingediende versie verwees naar een aantal bestanden en aannames die niet overeenkomen met de
huidige repo. Hieronder wat gecorrigeerd is, met bewijs. Niets is stil aangepast.

| # | Ingediend | Werkelijkheid in de repo | Actie |
|---|---|---|---|
| V1 | `GATE-ARCHITECTUUR.md` | Het canonieke document heet `docs/eval/GATE-ARCHITECTURE.md` (Engelse bestandsnaam, conform `000-core.mdc`) | Referentie gecorrigeerd |
| V2 | Bewijs in `docs/evals/…` | De map is **enkelvoud**: `docs/eval/` (bevat nu alleen `GATE-ARCHITECTURE.md`) | Alle bewijspaden → `docs/eval/…`, met Engelse bestandsnamen |
| V3 | `BESLISNOTITIE-platform-vs-eigen-agent.md`, beslisregel "B2/B4" | Het document bestaat **niet** in de repo (0 grep-treffers). Erger: `GATE-ARCHITECTURE.md` §5 gebruikt **B1–B6 al** voor de open gate-besluiten — waarvan B2 en B4 bestaande, andere besluiten zijn (B2 = regressiechecks nightly-only, **besloten** 2026-07-21; B4 = wordt een G3-fail een deploy-gate) | Beslisnotitie-labels genamespaced als **BN-B2 / BN-B4**. Het document zelf blijft een openstaande dependency |
| V4 | P0.1 "branch protection activeren" als openstaand punt | **Grotendeels al actief, maar via een ander mechanisme dan gedocumenteerd** [anker, gemeten 2026-07-30]: de afdwinging zit in **repository-ruleset** `main` (id `18689890`, `enforcement: active`, `bypass_actors: []`) met required check `verify` + strict-policy + geen force-push/deletes. De klassieke protection op dezelfde branch is zo goed als leeg. **Gaten:** geen pull-request-regel, geen merge-queue | P0.1 herschreven; proof gecommit als `docs/audit/branch-protection-proof.json`, auditnotitie gecorrigeerd |
| V5 | P0.4 "bake-off-koppeling besloten" (bake-off staat nog te gebeuren) | De embedding-bake-off is **al gedraaid en besloten** [anker]: `scripts/bake-off/results.md` (2026-07-03) → `qwen3-embedding-8b` @ 4096 dim, gepind in `packages/shared/src/config/embedding.ts`. Drempelkalibratie hangt dus **niet** meer op een modelkeuze | P0.4 herschreven en **besloten** (2026-07-30): niet blokkeren |
| V6 | "OOMT-baseline bevriezen" | "OOMT" bestaat niet in code [anker]: de fonds-laag kent `etd` en `demo` (`FUND_SET_META`, `packages/agents/src/evals/golden-set.ts`). `PLAN-v3.md` Fase 14 stap 4 heeft nog als open punt of `etd` de geanonimiseerde OOMT ís | P0.2 benoemt de concrete artefacten (`fixtures/baseline.json` + de nulmetingen van 2026-07-21) i.p.v. een fondsnaam die geen code-anker heeft |
| V7 | I4 "verbatim-gate (binair)" | Niet alle citatie-gates zijn binair [anker] `GATE-ARCHITECTURE.md` §3: `citationVerification` is een **count**-gate (≤ 1 case unverified, rate = trend-only); `orphanRate ≤ 0` is wél binair | Criterium van I4 gepreciseerd |
| V8 | "exact volgens het runbook" | Er is **geen runbook** [feit]: `find -iname "*runbook*"` = 0 treffers. `PLAN-v3.md` Fase 16 stap 4 plant `docs/onboarding-runbook.md` pas tijdens fonds #2 | Bevestigt de eigen escape-clausule van Fase 2: de eerste doorloop schrijft het runbook. Expliciet gemaakt als deliverable |
| V9 | Bestandsnaam `PLAN-gate-schaalbaarheidstoets.md` | `000-core.mdc` eist Engelse bestands- en mapnamen (hard); alle bestaande docs volgen dat (`PLAN-gate-restructure.md`, `golden-set-cocreation.md`, `DECISION-*.md`) | Weggezet als `docs/plans/PLAN-gate-scalability-test.md` |

De inhoudelijke ankers die de ingediende versie wél correct legt: `findUngroundedFacts`
(`packages/agents/src/cao/hard-facts.ts:159`) bestaat en is de juiste gate voor I3, en de
decoratieve-citatie-case `etd-026` bestaat als refusal-probe in de base-set.

**Bevinding #0 (uit P0.1 zelf, 2026-07-30).** De verificatie-opdracht in
`docs/audit/branch-protection-check.md` las het verkeerde object: `gh api …/branches/main/protection`
rapporteert geen required checks en `enforce_admins: false`, terwijl `verify` in werkelijkheid wél
verplicht is via een ruleset. Wie zo audit, concludeert het tegendeel van de waarheid. Dit is
dezelfde klasse fout als "skip ≠ pass" (`GATE-ARCHITECTURE.md` §4.2) — niet een gate die stil
overslaat, maar een *bewijsvraag* die stil het verkeerde meet. Genoteerd omdat het protocol hiermee
zijn eerste vals-signaal vond nog vóór corpus 1: dezelfde waakzaamheid geldt voor elk bewijsstuk in
Fase 2–7.

---

## 1. Voorwaarden vooraf (P0 — gate voor de toets zelf)

| # | Voorwaarde | Waarom | Bewijs |
|---|---|---|---|
| P0.1 | **Branch protection compleet + afdwinging bewezen** — ✅ proof gecommit, ✅ `verify` required zonder bypass, ✅ pull-request-regel toegevoegd (2026-07-30, `required_approving_review_count: 0` wegens de solo-deadlock; zie de auditnotitie); **resterend:** de afdwinging één keer zien blokkeren bij een echte PR | Zonder afdwinging toets je adviezen, geen gates. Let op de gekoppelde faalwijze uit `GATE-ARCHITECTURE.md` §4.2: een required check is niet sterker dan wat erin draait — branch protection en de "skip ≠ pass"-invariant zijn een paar | `docs/audit/branch-protection-proof.json` (ruleset **én** klassieke protection, want ze spreken elkaar tegen) + `docs/audit/branch-protection-check.md` |
| P0.2 | **Baseline bevroren** — vaste commit, `packages/agents/src/evals/fixtures/baseline.json`, de nulmetingen per gate uit `GATE-ARCHITECTURE.md` §G1–§G3 (2026-07-21), plus corpus-snapshot (`GOLDEN_CORPUS_VERSION` + `corpusVersion` per fonds-set) | Portabiliteit is alleen meetbaar tegen een vaste referentie. De baseline-integriteitsguard (§4.4) borgt dat het geen rode run is | `docs/eval/BASELINE-<fund>-<date>.md`: gate-scores, drempels, kosten, duur, commit-SHA, corpusversies |

**P0.2 — waarom dit niet met een `git`-verwijzing af is [feit, 2026-07-30].** `baseline.json` is
**niet zelf-identificerend**: het bevat `corpusVersion` + `fixtureHash` + de scores, maar géén
commit-SHA, generator-model, `EVAL_JUDGE_SAMPLES`, datum, kosten of duur. Twee verschillende
baselines kunnen dus allebei `corpusVersion: "4"` dragen — en dat is niet hypothetisch:
`fixtures/baseline-v4-DIAGNOSIS.md` beschrijft een "baseline v4" met `hardHallucination` 0.9355 en
`citationVerification` 0.5161, terwijl het huidige bestand met dezelfde corpusVersion op 1.0 en 1.0
staat (herijkt op 2026-07-21). Het diagnosedocument is daarmee stil verouderd.

Gevolg voor P0.2: de metadata die de baseline reproduceerbaar maakt moet **extern** in het
`BASELINE-…md`-artefact staan, en er is een gemeten run nodig voor kosten en duur (die staan nergens
vast). Zolang de working tree wijzigingen bevat op de naden die de eval scoort (nu:
`cao/agent.ts`, `types.ts`, `observability/trace.ts`, `shared/env.ts`), is "vaste commit" bovendien
niet waar te maken. **P0.2 is dus geblokkeerd op: schone tree + één gemeten run.**
| P0.3 | **Beslisregels R1–R6 vastgelegd vóór run 1** (pre-registratie) | Anders praat je jezelf achteraf groen — het spiegelbeeld van "drempels verlagen voor groen" | Dit document gecommit vóór de eerste koude doorloop |
| P0.4 | **Relatie met de embedding-keuze besloten** — de bake-off is **al beslist** (`qwen3-embedding-8b` @ 4096, gepind); wat openstaat is de *dataset-caveat* van `scripts/bake-off/results.md`: de winnaar is gemeten op een seed-corpus van 18 passages, niet op een echte fonds-CAO | Drempels bevriezen vóór een eventuele re-bake-off op echte corpora is weggegooid werk; een re-bake-off vóór dit protocol vertraagt alles en herhaalt een keuze die al gepind is | Besluit hieronder |

**P0.4 — BESLOTEN (2026-07-30): niet blokkeren.** Dit protocol draait op de gepinde embedding. De 3
corpora leveren als bijproduct de multi-corpus-dataset waarmee de bake-off-caveat later te sluiten is
(`results.md` §Dataset caveat), zonder dat de schaalbaarheidstoets erop wacht.

*Verworpen alternatief:* eerst een re-bake-off per kandidaat op de 3 corpora, dán model kiezen, dán
drempels bevriezen. Kost een re-embed-migratie zodra de winnaar wijzigt (`EMBEDDING_CONFIG.version`-bump,
zie `400-data-rag`) en zet vrijwel alles stil tot dat klaar is — voor een keuze die al gepind is.

Wat in **beide** gevallen geldt: een latere model- of dimensiewijziging invalideert de drempels en de
baseline. Dat wordt een expliciete re-embed-migratie mét herijking, geen stille bump.

---

## 2. Fase 1 — Corpusselectie

Drie publieke avv-CAO's (bron: het publieke CAO-register / officielebekendmakingen),
gestratificeerd langs de as die de Trede 2-prijsrange al gebruikt (schoon €17.500 → complex €35.000):

1. **Schoon**: modern, één document, doorzoekbare tekst.
2. **Complex**: zware loontabellen, kolomopmaak, toeslagenmatrices.
3. **Groot/meerdelig**: meerdere documenten of een omvangrijke CAO met bijlagen.

**Extra selectiecriterium [ontwerp]:** kies uit prospectsectoren (Metalektro, Metaal & Techniek — de
Ozone/A+O-route). Elke koude doorloop levert dan meteen Trede 0-demomateriaal voor precies dat
gesprek. **Contaminatieregel:** eerst eerlijk loggen, daarná pas polijsten voor demo — nooit andersom.

**Praktisch anker:** een synthetische tenant is in de bestaande code een **fonds-laag**, geen nieuwe
runtime. Per corpus: ingest onder een eigen `fund`-id (`scripts/ingest/run.ts … --fund <corpus>`), een
`golden-set.<corpus>.jsonl`, en een `FUND_SET_META`-regel met eigen `corpusVersion` — een set-bestand
zonder registratie faalt bewust bij het laden. Dat is precies het control-plane/data-plane-pad dat een
echt fonds ook zou lopen, en het is de reden dat deze toets geen nieuwe infrastructuur vraagt.

**DoD:** selectielog met criteria, bronlinks en corpuskarakteristiek per CAO.
Bewijs: `docs/eval/corpus-selection.md`.

---

## 3. Fase 2 — Koude doorloop ("handen op de rug")

Per corpus de bestaande pipeline draaien, exact volgens het runbook. **Er is geen runbook** [feit] —
dat gat is bevinding #1, en de eerste doorloop schrijft hem: elke stap en elk uur loggen, zodat het
logboek zelf het runbook wordt (dezelfde werkwijze die `PLAN-v3.md` Fase 16 stap 4 voor fonds #2
voorziet, nu vooruitgetrokken naar een synthetische tenant).

**Interventielog** — elke afwijking van het script telt, met tijdstip, fase, duur en oorzaak:

| Cat. | Betekenis | Zwaarte |
|---|---|---|
| C1 | Codewijziging nodig | Zwaar — pipeline niet corpus-onafhankelijk |
| C2 | Configwijziging per corpus | Middel — automatiseerbaar? |
| C3 | Handmatige datacorrectie (corpus/chunks) | Middel–zwaar — de kern van "niet plug-and-play" |
| C4 | **Drempel- of testwijziging** | **Rode vlag — mag niet.** Vloerprincipe: een rode score op nieuw corpus repareer je in de pipeline, nooit in de drempel. C4 = automatische protocolvlag |
| C5 | Herstart/rerun | Licht, maar telt voor stabiliteit |

C4 heeft al een mechanische bewaker die je niet mag omzeilen: een fixture-edit zonder
corpus-version-bump faalt op de fixture-hash-guard, en `.cursor/rules/700-evals.mdc` verbiedt
wijzigingen onder `packages/agents/src/evals/` buiten een expliciete opdracht. Registratie van een
nieuwe fonds-set (`FUND_SET_META` + een nieuw `golden-set.<corpus>.jsonl`) is géén C4 — dat is de
bedoelde data-plane-uitbreiding. Een aanpassing aan de **base**-laag of aan een drempel wél.

**DoD:** interventielog + timing per fase per corpus. Bewijs: `docs/eval/cold-run-<corpus>.md`.

---

## 4. Fase 3 — Standaard-goldenset zonder co-creatie

Dit is bewust het **tegendeel** van `docs/golden-set-cocreation.md`: daar leveren de experts van het
fonds het referentie-antwoord en de validatie. Hier meten we wat er overblijft zónder die sessie —
want dat is wat self-service betekent. Vaste categorietemplate, per CAO geïnstantieerd.
Compositie-eis [ontwerp] — dit voorkomt dat een groen vacuüm ontstaat door een te makkelijke set:

- **≥40 vragen** per CAO, waarvan:
  - **±60% beantwoordbaar**, gespreid over ≥6 categorieën (verlof, loon, toeslagen, ziekte,
    opzegging, werktijden, …);
  - **±25% weiger-probes**, inclusief *plausibel-maar-afwezig*-vragen: onderwerpen die CAO's
    doorgaans wél regelen maar déze niet. Genereer ze uit de categorie-unie van de andere corpora
    minus dit corpus — de scherpste under-refusal-detector die er is;
  - **±15% edge**: tabellen, kruisverwijzingen, en gevallen waar de agent moet doorverwijzen in
    plaats van rekenen (het rekenverbod uit de systeemprompt).

Schema-eis [anker]: beantwoordbare cases dragen `expectedArticle`/`expectedLid`, weiger-cases dragen
die bewust **niet** (out-of-corpus probes), en de golden-set-schema-invariant eist ≥ 1 distractor per
refusal-case. Weiger-probes zonder distractor meten niets.

Jordy reviewt; **edit-rate** wordt gemeten (aandeel vragen dat aangepast of geschrapt moet worden).

**DoD:** set + reviewlog per corpus. Bewijs: `docs/eval/golden-set-<corpus>.md`.

---

## 5. Fase 4 — Gate-runs & drempel-portabiliteit

G2 en G3 per corpus draaien met **exact de bestaande drempels**; G1 is corpus-onafhankelijk
(change-detector) en dient hier alleen als sanity-check. Let op welke laag wat meet [anker]: de
synthetische corpora zijn fonds-lagen, dus het zwaartepunt ligt op **G3-fund** en **G3-pipeline** (DB
+ echte pipeline), niet op de base-laag van G2. Draai G3 met `EVAL_REQUIRE_DB=1`, anders skipt de
gate die je juist meet — en skip ≠ pass. Daarna:

1. Scorestabel per gate per corpus naast de baseline.
2. Elke rode gate: steekproef handmatig classificeren als **echt-rood** (pipeline degradeert op dit
   corpus — waardevol signaal) of **vals-rood** (meetartefact).
3. Drempels blijven onaangeraakt (zie C4).

De portabiliteitsvraag is dus niet "wordt alles groen?" maar: *zijn de roden terecht, en zijn de
scoreverschillen verklaarbaar uit corpuscomplexiteit?* Een complex corpus dat terecht rood kleurt is
een wérkend gate-systeem.

**Verwachting om vooraf op te schrijven [ontwerp]:** de G3-drempels staan nu `[C]` provisioneel en
zeer los (hit@1 ≥ 0.70 tegen een nulmeting van 95.8%). Een nieuw corpus dat daar ruim onder duikt maar
tóch groen blijft is géén portabiliteitsbewijs — het is bewijs dat de floor te los staat. Noteer per
gate dus niet alleen groen/rood maar ook de **marge tot de floor**; dat is de bruikbare uitkomst voor
de herijking na ≥ 14 nightly-runs (besluit B3).

**DoD:** scorestabel + classificatielog. Bewijs: `docs/eval/portability-<date>.md`.

---

## 6. Fase 5 — Foutinjectie ("test de test")

Op één corpus 6–8 bekende defecten zaaien en verifiëren dat de bedoelde gate ze vangt. Matrix:
defect → verwachte gate → gevangen j/n. Zaai op een wegwerp-branch en gooi hem weg; een injectie mag
nooit richting `main`.

| # | Injectie | Verwachte vangst | Criterium |
|---|---|---|---|
| I1 | Brondocument uit corpus verwijderen; goldenset-vraag daarover blijft staan | Correcte weigering; antwoordt de agent tóch → under-refusal-detectie in G2/G3-fund refusal-guard | **100%** |
| I2 | Weiger-instructie in prompt afzwakken | G1-contract rood (regel verdwenen) én G2 weiger-set rood | **100%** |
| I3 | Decoratieve citatie (`etd-026`): quote matcht verbatim op distractor maar grondt het feit niet | `findUngroundedFacts` (`cao/hard-facts.ts`) | **100%** |
| I4 | Citatie-quote die niet letterlijk in de chunk staat | `citationVerification` (**count**-gate: ≤ 1 case unverified) + `orphanRate ≤ 0` (binair) | Bij 1 injectie: gate rood via orphan/dangling; **let op** dat één losse unverified case binnen de count-tolerantie valt — injecteer daarom ≥ 2, of toets op orphan |
| I5 | Chunkgrenzen midden door artikelen / tabellen platgeslagen | Float-kwaliteitsgates (retrieval hit@1/MRR, completeness) dalen aantoonbaar | Detecteerbaar |
| I6 | Config-divergentie: prod-generator wijkt af van eval-generator | Invariant "eval scoort het productiemodel" (`eval-model-coupling.test.ts`, draait offline op elke PR) | 100% |
| I7 | Verzonnen artikelnummer in antwoord | Citatie-verificatie (`chunkId` onbekend → dangling/strip) | 100% |
| I8 | Verouderde CAO-versie in corpus | **Ongedekt** [feit]: G3-freshness is *gereserveerd*, niet gebouwd (`GATE-ARCHITECTURE.md` §G3, PLAN-v3 Fase 16) | Eerlijk noteren als gat; niet wegpoetsen |

**Nuance bij I6 [feit]:** "eval path = production path" is nu geborgd op het **generator-model** en de
**verified-answer-seam** (invarianten §4.1/§4.3), niet op temperature. Wil je temperature mechanisch
toetsen, dan is dat een nieuwe check — en die valt buiten dit protocol (zie §10). Injecteer wat er is:
een hardcoded model-literal in de eval.

**DoD:** injectiematrix volledig ingevuld, inclusief de niet-gevangen gevallen.
Bewijs: `docs/eval/injection-matrix-<date>.md`.

---

## 7. Fase 6 — Stabiliteit & kosten

- **Stabiliteit:** 3 identieke runs (zelfde commit, zelfde corpus). Criterium [ontwerp]: 0
  verdict-flips; scorevariantie binnen een vooraf gekozen band. Referentiepunt [anker]: de gemeten
  judge-spread @1 vs @3 samples was Δ0.025–0.032 (besluit B2) — kies de band niet strakker dan de
  bekende judge-ruis, en draai met dezelfde `EVAL_JUDGE_SAMPLES` als CI. Flaky gates blokkeren
  self-service categorisch — er is dan geen mens die "draai maar opnieuw" zegt.
- **Kosten & duur:** € en minuten per volledige gate-run loggen (het run-artefact `eval-report.json`
  is de bron; `models.generator` staat erin). Toets tegen de Start-marge: richtsnoer [ontwerp] totale
  evalkosten per fonds per jaar ≤ ~5% van de jaarprijs (bij €6.000 dus ≤ ~€300/jr over alle runs,
  incl. CAO-wijzigingscycli). Reken de nachtelijke G3-frequentie mee, niet alleen de handmatige runs.

**DoD:** run-metadata van 3 runs + kostenblad. Bewijs: `docs/eval/stability-costs.md`.

---

## 8. Fase 7 — Zelfbedienbaarheidsproef (licht)

Het gate-rapport van één koude doorloop voorleggen aan een naïeve lezer (niet-Jordy, niet-technisch).
Drie vragen: *mag dit live? wat is er stuk? wat is de volgende stap?* Goed = 3/3 correct zonder
mondelinge toelichting. Geen nieuwe UI bouwen — het bestaande rapport (`eval-report.json` + de
samenvatting die de eval logt) ís het testobject; falen betekent rapportageverbetering, geen tooling.

**DoD:** kort testverslag. Bewijs: `docs/eval/readability-test.md`.

---

## 9. Beslisregels (pre-registered — vastgelegd vóór run 1)

| # | Als | Dan |
|---|---|---|
| R1 | Under-refusal-injecties (I1/I2) < 100% gedetecteerd | **STOP alles.** Gates geven schijnzekerheid; repareren gaat vóór elke schaal- én verkoopstap — dit raakt ook de lopende go-live-belofte en de claims in `GATE-ARCHITECTURE.md` Bijlage B |
| R2 | ≥2 van 3 corpora halen de gates zonder C1–C4-interventies én goldenset-edit-rate ≤20% | Start-tier **technisch** haalbaar; besluit verder afhankelijk van prijsvalidatie (beslisnotitie actie 1) |
| R3 | Roden op nieuw corpus zijn echt-rood (pipeline degradeert) | Pipeline verbeteren; drempels blijven staan (vloerprincipe) |
| R4 | Verdict-flips over identieke runs | Determinisme eerst; geen enkele andere conclusie is geldig zolang dit speelt |
| R5 | Kosten per run boven budget | Eval-omvang/sampling optimaliseren vóór opschalen — niet de dekking verlagen |
| R6 | Goldenset-edit-rate >40% | Generator-template herzien vóór conclusies over portabiliteit — anders meet je templatekwaliteit, niet pipelinekwaliteit |
| R7 | Alles groen mét ruime marge tot elke floor op álle 3 corpora | Géén "bewezen portabel" concluderen: eerst toetsen of de `[C]`-floors te los staan (besluit B3). Vacuous green is ook bij een groene uitslag de eerste hypothese |

---

## 10. Wat we bewust NIET bouwen (v4-hek)

- Geen ingestie-automatiseringssuite vooraf — eerst loggen wat ≥2× terugkomt in de interventielogs,
  dán pas automatiseren.
- Geen self-service upload-UI, geen multi-tenant runtime, geen generator-tooling voorbij template +
  eenvoudig script.
- Geen nieuwe rapportage-UI voor Fase 7.
- **Geen nieuwe gates.** Ook niet voor de gaten die dit protocol blootlegt (I8 corpus-actualiteit, een
  temperature-contractcheck). Bevindingen gaan het changelog en de open-besluitentabel van
  `GATE-ARCHITECTURE.md` in; bouwen is een apart besluit met eigen motivatie.

Het protocol gebruikt de bestáánde pipeline, handmatig gedraaid. Dat is de toets: wat een mens met
handen op de rug niet voor elkaar krijgt, krijgt een fonds in self-service zeker niet.

---

## 11. Risico's & beperkingen

| Risico | Mitigatie |
|---|---|
| n=3 is klein: uitkomsten zijn directioneel, geen bewijs | Zo labelen; fonds #2/#3 blijven de echte meting (validatieactie 2/4 uit de beslisnotitie) |
| Selectiebias: publieke CAO's zijn schoner dan klant-aanlevering (oude scans, losse bijlagen) | Bewust één rommelige bron opnemen; restrisico expliciet noteren |
| Demo-contaminatie (polijsten vóór loggen) | Contaminatieregel Fase 1 |
| Vacuous green door zwakke standaardset | Compositie-eis Fase 3, m.n. de plausibel-maar-afwezig-probes |
| Vacuous green door te losse `[C]`-floors | R7 + de marge-tot-floor-kolom in Fase 4 |
| 3 synthetische corpora in de gate-DB vertragen of vervuilen de nachtelijke G3-run | Corpora onder eigen `fund`-id's; vóór afronding besluiten of ze blijven (permanente portabiliteitscanary, duurder) of worden opgeruimd. Default [ontwerp]: opruimen, één corpus behouden als canary |
| Tijdsbeslag naast lopend werk | Timebox: P0 ±0,5 dag; ±1–1,5 dag per corpus; injectie ±0,5–1 dag; totaal ±4–6 dagen [schatting]. Bij R1-falen: stoppen na corpus 1 en repareren |

---

## 12. Volgorde & goedkeuring

1. **Akkoord op §0.1** — de punten waarop de ingediende versie afwijkt van de repo. P0.4 (niet
   blokkeren) en de bestandsnaam zijn op 2026-07-30 besloten; open blijft de bevestiging van de
   BN-B2/BN-B4-naamgeving zodra de beslisnotitie in de repo landt.
2. P0 afronden (branch protection is een instelling, geen bouwwerk — vandaag te doen).
3. Fase 1–2 op corpus "schoon" → tussenstand.
4. **Approval gate:** pas door naar corpus 2–3 en foutinjectie na akkoord op de tussenstand.
5. Eindrapport: één pagina met de meetlat ingevuld + R1–R7-uitkomsten → voedt beslisregel BN-B2/BN-B4
   van de beslisnotitie en de openstaande bake-off-caveat.

Bij goedkeuring: een regel in het changelog van `docs/eval/GATE-ARCHITECTURE.md` (§6) en een
kruisverwijzing vanuit `PLAN-gate-restructure.md`, zodat dit protocol vindbaar is vanuit het canonieke
gate-document. Dat gebeurt bij akkoord, niet nu — een plan met status "ter goedkeuring" hoort nog niet
in een canoniek document te staan.
