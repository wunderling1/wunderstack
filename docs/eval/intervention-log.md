# Interventielog

> **Waarvoor:** elke afwijking van het script tijdens ingest- en gate-werk, met datum, categorie,
> oorzaak en bewijs. Categorieën uit `docs/plans/PLAN-gate-scalability-test.md` §3:
>
> | Cat. | Betekenis | Zwaarte |
> |---|---|---|
> | C1 | Codewijziging nodig | Zwaar — pipeline niet corpus-onafhankelijk |
> | C2 | Configwijziging per corpus | Middel — automatiseerbaar? |
> | C3 | Handmatige datacorrectie (corpus/chunks) | Middel–zwaar — de kern van "niet plug-and-play" |
> | C4 | Drempel- of testwijziging | **Rode vlag — mag niet** |
> | C5 | Herstart/rerun | Licht, telt voor stabiliteit |
>
> Dit log telt mee voor beslisregel **R2** ("≥2 van 3 corpora halen de gates zonder
> C1–C4-interventies"). Interventies die vóór de koude doorloop nodig blijken tellen net zo hard mee
> als die tijdens: ze zijn alleen eerder gevonden.

---

## 2026-07-30 · C1 · Een corpus kon niet vervangen worden

**Fase:** ingest-herstelplan Fase 2 (voorbereiding demo re-ingest) · **Duur:** ±1 uur

**Wat.** Drie samenhangende gebreken in het productie-ingestpad, gevonden bij het klaarzetten van de
demo re-ingest:

1. Een ingest kon alleen **toevoegen** aan het corpus van een fonds. Idempotentie is per document
   gekeyd op `source_uri` (`scripts/ingest/run.ts:143-153`), en er was geen stap die documenten
   terugtrok die niet meer in de bron staan. Een CAO die onder een nieuwe bestandsnaam wordt
   heruitgegeven liet de vorige editie stil vindbaar naast de nieuwe.
2. Een mapscan pakte elk `.md`-bestand mee, dus een **README naast het corpus** werd doorzoekbare
   CAO-tekst die de agent kan citeren.
3. De gedocumenteerde ingest-opdracht (`scripts/ingest/demo-corpus/README.md:10`) gebruikte een
   repo-root-relatief pad terwijl `pnpm --filter` in de packagemap draait, en **faalde met ENOENT**.

**Oorzaak.** Punt 1 is een ontbrekende mogelijkheid, geen bug: het pad was gebouwd voor "voeg een
corpus toe", niet voor "vervang een corpus". Punt 3 verklaart waarom dit maanden onopgemerkt bleef —
wie de README volgde kreeg een foutmelding en het corpus werd nooit geladen.

**Waarom C1 en niet C3.** De datacorrectie zelf (de re-ingest) is C3 en staat hieronder. Dit is de
codewijziging die die correctie mogelijk maakte: zonder `--prune` bestond er geen manier om het
verkeerde corpus te verwijderen via het productiepad. Precies de C1-definitie: de pipeline was niet
corpus-onafhankelijk.

**Ingreep.** `--prune` toegevoegd (het inputset ís het volledige corpus; de rest wordt teruggetrokken,
uit staat het gedrag ongewijzigd), README-bestanden overgeslagen bij een mapscan mét zichtbare
melding, en de opdracht in de README gecorrigeerd. Chunks volgen het documentrij via de bestaande
`ON DELETE CASCADE` (`packages/db/src/schema.ts:55`) — geen schemawijziging.

**Bewijs.** Commit `79894c1`. Analyse: `docs/eval/ingest/FINDING-demo-corpus-mismatch-2026-07-30.md`.
Gates: `typecheck lint test:unit` 40/40 groen, `depcruise` 312 modules zonder violations.

**Wat dit zegt over schaalbaarheid.** Dit gebrek was niet corpus-specifiek. Het eerste echte fonds
dat een nieuwe CAO-editie aanlevert onder een andere bestandsnaam had er direct tegenaan gelopen,
zonder dat een gate het zag.

---

## 2026-07-30 · C3 · Fonds `demo` bevatte een ander corpus dan de golden set toetst

**Fase:** ingest-herstelplan Fase 2 · **Duur:** ±20 minuten (excl. gate-run)

**Wat.** In fonds `demo` stond één document: `demo/sample-cao.txt` (10 chunks, ingest 2026-07-03) —
een vroeg smoke-test-bestand. Het corpus waarvoor de demo-golden-set is geschreven,
`demo-corpus/cao-fictief.md`, was nooit ingeladen. Zeven van de tien verwachte artikelen bestonden
niet in de opgeslagen tekst; twee van de drie die wel bestonden gingen over iets anders.

**Oorzaak.** Zie C1 punt 3: de gedocumenteerde opdracht faalde. Dat `G3-fund [demo]` daarna
maandenlang 0% haalde was daarmee **overbepaald** — verkeerd corpus én geen structuurankers — en
niemand werd tegengehouden, want nachtelijk rood is visibility zonder blokkade (open besluit B4).

**Correctie op de diagnose.** `docs/eval/diagnosis-fund-article-metadata-2026-07-30.md` §2 wees dit
aan als verouderde chunker-output op het juiste corpus. Het label *vals-rood* blijft juist, het
mechanisme niet. §3 van de diagnose (de PDF-ingest levert geen ankers) staat onaangetast overeind en
is in Fase 1 onafhankelijk herbevestigd.

**Ingreep.** Re-ingest via het productiepad, geen ad-hoc script:

```sh
pnpm --filter @wunderstack/ingest ingest demo-corpus --fund demo --version 1 --prune --label na-reingest
```

```
  skipped   README.md (documentation, not corpus)
  created   demo/cao-fictief.md (32 chunks, 1 table, 31 with sourceRef)
  retracted demo/sample-cao.txt (10 chunks removed)
```

**Kosten.** 32 chunk-embeddings bij Scaleway (`qwen3-embedding-8b` @ 4096). Vooraf gemeld en
goedgekeurd.

**Meting voor/na [gemeten].**

| Maat | Voor | Na |
|---|---|---|
| Chunks | 10 | 32 |
| Met `article` | 0/10 (0,0%) | **26/32 (81,3%)** |
| Met `source_ref` | 0/10 (0,0%) | **31/32 (96,9%)** |
| Table-chunks | 0 | **1** |
| Begint mid-zin | 0/10 | 0/32 |
| Regel-leidende `Artikel N` zonder `article` | 6 | **0** |

**Bewijs.** Voor: `docs/eval/ingest/INGEST-demo-2026-07-30.md`. Na:
`docs/eval/ingest/INGEST-demo-2026-07-30-na-reingest.md`.

**Gate-uitkomst [gemeten].** `G3-fund [demo]` ging van 0% naar **100% op alle vier retrieval-maten**
(hit@1, recall@3, recall@5 alle 100%, MRR 1,000). Eén check sloeg de andere kant op: de refusal-guard
haalt nu 0 van 2 lege out-of-corpus-probes en faalt. Die stond in de baseline groen, maar **vacuüm
groen** — daar vond retrieval categorisch niets, ook op de inhoudelijke vragen. De volledige run
eindigt daardoor op `EVAL_EXIT=1`, dus **P0.2 blijft open**. Niet gerepareerd door een drempel te
verlagen: dat zou C4 zijn. Analyse: `docs/eval/ingest/GATE-RUN-demo-2026-07-30.md`.

---

## 2026-07-30 · C1 · De PDF-parse gooide alle regelstructuur weg

**Fase:** ingest-herstelplan Fase 3 · **Duur:** ±3 uur

**Wat.** `extractText({ mergePages: true })` leverde paginatekst met de opmaak platgeslagen. Élk
structuurpatroon verderop kijkt naar het begin van een regel, dus vond niets iets: 0 van 107 chunks
met een anker, 0 table-chunks, 86% van de chunks begon midden in een zin.

**Ingreep.** Regelreconstructie uit de fragmentgeometrie van `extractTextItems` (fragmenten met
dezelfde `y` zijn één regel; horizontale afstand scheidt buurwoorden van tabelkolommen, met
**gemeten** drempels: proza ≤ 1,03em, kolommen ≥ 1,1em met mediaan 2,27em). Kopteksten eruit op
herhaling, paginanummers op vorm aan de paginarand.

**Tweede, niet-voorziene wijziging: `chunk.ts` (bevroren bestand).** Kerndiscipline 3 nam aan dat de
chunker deugde op regel-leidende patronen. Gemeten bleek dat onjuist: met perfect gereconstrueerde
regels leverde de chunker **één** chunk op, alleen geankerd op "Hoofdstuk 1". `isHeading` stond na een
nummer maximaal één woord toe, dus `1.1. Van toepassing` was geen kop en deze CAO — die nergens
"Artikel N" schrijft maar N.M nummert — viel volledig buiten de structuurherkenning. Eén extra geval
toegevoegd, met de N.M-vorm als eis en een kolomrun als uitsluiting, zodat lidnummers en
salarisregels ongemoeid blijven. Verantwoord onder de uitzondering van kerndiscipline 3
(gedocumenteerde reden + hernieuwde G1-run).

**Resultaat [gemeten].** `article` 0/107 (0,0%) → **221/245 (90,2%)**; `source_ref` 0,0% → **99,6%**;
table-chunks 0 → **12**; mid-zin-starts 86,0% → **0,4%**. Vijf vooraf gekozen spot-checks slagen op
alle criteria, inclusief de loontabel als één table-chunk met 11 regels bijeen.

**Kosten.** 245 chunk-embeddings bij Scaleway. Vooraf gemeld en goedgekeurd.

**Regressie.** De markdown-route is bewezen onaangeraakt: sha256 over de geordende demo-chunks uit de
nieuwe code is identiek aan de opgeslagen chunks uit de oude
(`22a8f009746f1e1b906db4f8611dcb50c03c43ea8f244d46ee8352a2d7dd2b05`).

**Restpunten, niet gerepareerd.** Drie pagina's van 62 leveren geen tekst op (pdf.js-fout, was al zo,
nu hard gemeld tijdens elke ingest). De inhoudsopgave is doorzoekbare inhoud geworden (14 chunks).
Drie vals-positieve koppen uit afgebroken kruisverwijzingen (`artikel 8.2.`) leveren
fragment-chunks met een verkeerd anker — een **nieuw** neveneffect van deze fix.

**Bewijs.** `docs/eval/ingest/PARSE-FIX-2026-07-30.md`, met voor- en na-rapport. Commit `8de57a9` plus
de vervolgcommit met tests en paginawaarschuwing. Gates: 40/40 turbo-taken groen, depcruise 313
modules zonder violations, 36 unit-tests in het ingest-pakket.

**Wat dit zegt over schaalbaarheid.** Dit was geen corpus-eigenaardigheid maar een gat in de pipeline:
elke CAO die zijn artikelen N.M nummert in plaats van "Artikel N" viel volledig buiten de
structuurherkenning, en geen gate zag het. Dat is precies wat de schaalbaarheidstoets moet vinden,
gevonden op corpus nummer één.

---

## 2026-07-30 · Geen interventie · Golden set op een echt geïngest corpus (Fase 5)

**Fase:** ingest-herstelplan Fase 5 · **Categorie:** geen — nieuw meetmateriaal, geen wijziging aan
pipeline, drempel of bestaande data.

**Wat.** Startersjabloon voor een fonds-golden-set (`docs/eval/golden-sets/TEMPLATE-starter.md`) en de
eerste instantiatie daarvan op het net opnieuw geïngeste PDF-corpus: `etd-full`, 15 cases (12
`in_scope`, 1 `derived`, 1 `table`, 1 `refusal`) over fonds `elektronische-detailhandel`. Daarmee
staat er voor het eerst een gate op een corpus dat via de productie-ingest binnenkwam.

**Resultaat [gemeten].** Alle vier de retrieval-drempels in één keer gehaald, zonder één drempel of
chunk-parameter aan te raken: hit@1 92,9%, recall@3 en @5 92,9%, MRR 0,929 (13 van 14 vragen, twaalf
op plek 1). De refusal-guard faalde (0 van 1 lege probe).

**Kosten.** Volledige eval-run onder nachtelijke condities, 54 min 12 s. Vooraf gemeld en goedgekeurd.

**Wat dit zegt over schaalbaarheid.** Twee dingen. Positief: een nieuw fonds haalt de retrieval-lat
zonder bijsturen — het sterkste zelfservice-signaal tot nu toe. Negatief: de refusal-guard staat nu op
**twee onafhankelijke echte corpora** rood en alleen op de handgecureerde fixtureset groen. Omdat het
ETD-corpus met 245 chunks bijna acht keer zo groot is als `demo`, valt de eerdere verklaring "corpus
te klein om te weigeren" weg; waarschijnlijker is dat `minScore = 0.48` op de fixtureset is
gekalibreerd. Niet gerepareerd — een drempel verlagen zou C4 zijn.

**Bewijs.** `docs/eval/golden-sets/NULMETING-etd-full-2026-07-30.md` (+ runlog). Commits `28b1911`
(sjabloon + golden set) en `faa6db2` (nulmeting).

---

## 2026-07-31 · Geen interventie · Promotiepoort per fonds (Fase 4)

**Fase:** ingest-herstelplan Fase 4 · **Categorie:** geen — gepland werk, geen afwijking van een
bevroren bestand of een drempel.

**Wat.** Nachtelijk `G3-fund`-rood blokkeerde niets en het bewijs overleefde de volgende run niet
(`eval-report.json` is gitignored en wordt overschreven). Besluit **D5** herziet **B4**: `main` blijft
open bij een fonds-rood, promotie van dat fonds niet.

**Gebouwd.** Append-only ledger `docs/eval/gate-results/g3-fund.jsonl` (gecommit), gevuld door elke
eval-run, plus `pnpm promote-check <fonds> <tag>` met vijf GO-voorwaarden en exitcode 0/1.

**Resultaat [gemeten].** Op de data van 2026-07-30 komt **geen enkel fonds** door: `demo` en
`etd-full` op hun rode refusal-guard, `etd` op een groen resultaat dat zichzelf niet aan een commit
kan koppelen. Drie NO-GO's om drie verschillende redenen.

**Twee kleine wijzigingen buiten de poort zelf.** (1) `eval-report.json` legt `commitSha` nu ook
lokaal vast (terugval op `git rev-parse HEAD`) — dat sloot een gat dat al bij de demo-run was gemeld.
(2) Een read-only structuurrapport voor `eval-fixtures` gegenereerd (geen re-ingest, geen kosten),
omdat dat fonds nog geen ingest-visibility had.

**Afwijking van het plan.** `scripts/promote/` (workspace-package) in plaats van
`scripts/promote-check.ts`, zodat het meedraait in `turbo run typecheck/lint/test:unit` en in de
dependency-cruiser. Zie `docs/eval/ingest/PROMOTION-GATE-2026-07-31.md` §6.

**Bewijs.** `docs/eval/ingest/PROMOTION-GATE-2026-07-31.md`. Gates: 34/34 typecheck+lint, 9/9
unit-testpakketten, depcruise 321 modules zonder violations.

---

## Openstaand

- **Refusal-guard `demo` én `etd-full`** — rood en bewust rood gelaten (besluit 2026-07-30).
  Threshold-calibratie buiten scope. Na de nulmeting van Fase 5 staat de guard op twee
  onafhankelijke echte corpora rood (`demo` 0/2 leeg, `etd-full` 0/1 leeg) en alleen op de
  handgecureerde fixtureset groen (3/3). Het ETD-corpus is bijna acht keer zo groot als `demo`, dus
  "corpus te klein" verklaart het niet meer; de waarschijnlijke oorzaak is dat `minScore = 0.48` op
  de fixtureset is gekalibreerd. Zie `docs/eval/ingest/GATE-RUN-demo-2026-07-30.md` §4 en
  `docs/eval/golden-sets/NULMETING-etd-full-2026-07-30.md` §2.
- **Twee reparatievoorstellen uit Fase 3**, nog niet uitgevoerd: inhoudsopgave/titelpagina buiten het
  corpus houden, en een kop met kleine letter afwijzen tegen vals-positieve koppen.
- **Drie onleesbare PDF-pagina's** — vraagt een andere extractieroute (OCR of andere engine); eigen
  besluit.
- **Eén van de 14 `etd-full`-vragen vindt zijn anker niet** (buiten de top-5; alle andere staan op
  plek 1). Welke case dat is, is niet gemeten — het artefact bewaart geen uitkomst per case.
- **Voorstel startersjabloon: drie refusal-cases in plaats van één** (drempel ≥ 2 leeg), zodat de
  guard voor een nieuw fonds een maat is en geen munt. Niet doorgevoerd; verandert een gate-drempel
  en vraagt een besluit. Zie `docs/eval/golden-sets/NULMETING-etd-full-2026-07-30.md` §5.
- **Geen enkel fonds is nu promoveerbaar** — `pnpm promote-check` geeft NO-GO voor `demo`, `etd-full`
  en `etd`. Voor `etd` verdwijnt de blokkade bij de eerstvolgende run (die legt de commit vast); voor
  de andere twee pas als het refusal-guard-besluit valt.
- **De ledger loopt achter op een CI-run**, omdat CI niet kan committen: iemand moet
  `pnpm --filter @wunderstack/promote record <artefact>` draaien op het geüploade artefact. Handmatige
  stap, dus een plek waar het proces kan verwateren.
