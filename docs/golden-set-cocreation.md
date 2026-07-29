# Golden set co-creatie — het proces

> Doel van dit document: beschrijven hoe een **fonds-specifieke golden set** tot stand komt via een
> co-creatiesessie met domeinexperts van het fonds. Dit is tegelijk een kwaliteitsritueel (de basis
> voor de claim "bewijsbaar betrouwbaar op déze CAO") én een sales-milestone met een eval-bijproduct.
> Het proces is bewust herbruikbaar: fonds #1 (ETD) doorloopt het één keer, fonds #2 kopieert het.

Leidende gedachte: **de golden set is de datamoat.** Een fonds-standaard die door de experts van het
fonds zelf is gevalideerd, is niet te kopiëren door een concurrent en is precies wat een fonds
tastbaar maakt in de menukaart.

## De twee lagen (waar dit inhaakt)

De golden set is fysiek gesplitst in twee lagen (zie `packages/agents/src/evals/golden-set.ts`):

- **base-laag** — `golden-set.base.jsonl` (+ `golden-passages.jsonl`). Corpus-agnostisch, gedrags-
  gericht: draait op fixtures zonder database (G1 + G2). Bewijst *gedrag* (grounding, weigeren,
  citeren, multi-turn). Verandert niet per fonds.
- **fonds-laag** — `golden-set.<fonds>.jsonl` (bv. `golden-set.etd.jsonl`). Fonds-specifieke
  **correctheid**: draait tegen de échte, ingeladen corpus van dat fonds via het integratie-pad
  (`G3-fund`, `retrieveContext` → match op artikel/lid). Elk fonds-setje heeft een eigen `corpusVersion`
  en wordt **apart** gerapporteerd in `eval-report.json` (`funds[]`).

De co-creatiesessie levert de **fonds-laag** op. De base-laag groeit langzamer en is niet fonds-eigendom.

## Rolverdeling (dit is het belangrijkste)

Een sessie werkt alleen als de rollen scherp staan:

- **Wij** brengen 20–30 **kandidaatvragen** mee, plus de corpus (de CAO-tekst per artikel). De experts
  bedenken de vragen dus **niet vanaf nul** — dat kost sessietijd en levert een grillige set op.
- **De experts** leveren twee dingen die alleen zij kunnen leveren: het **referentie-antwoord**
  (wat is er in de praktijk correct?) en de **validatie** (klopt het verwachte artikel, is de nuance
  compleet, ontbreekt er een uitzondering?).
- **Eigenaarschap:** de gevalideerde set is de **standaard van het fonds**. Wij beheren de vorm en het
  meetinstrument; de inhoudelijke waarheid is van het fonds. Dit expliciet benoemen wekt vertrouwen en
  is juridisch net.

## Stap 1 — Kandidaatvragen verzamelen (vóór de sessie)

Verzamel 20–30 kandidaatvragen uit twee bronnen, zodat de sessie over antwoorden gaat, niet over
brainstormen:

1. **Feedback-oogst.** Draai `scripts/eval/harvest-feedback.ts`
   (`pnpm --filter @wunderstack/eval-scripts harvest-feedback`). Dit haalt duim-omlaag-feedback uit
   Langfuse als reviewbare kandidaat-cases (`status: "needs_review"`). Dit zijn echte vragen van echte
   gebruikers — de sterkste kandidaten.
2. **Eigen corpuskennis.** Vul aan vanuit de CAO zelf: dek de kern-artikelen, de loon-/functietabellen,
   de conditionele bepalingen (datum-, leeftijd- of dienstverband-afhankelijk) en de randen van de
   scope. Zorg voor een paar **weiger-vragen**: onderwerpen die de CAO níét regelt (die horen als
   out-of-corpus minScore-probe in de set).

Streef naar spreiding over hoofdstukken en categorieën (`in_scope`, `table`, `refusal`), niet naar
volume. Twintig scherpe, gevarieerde vragen zijn meer waard dan zestig variaties op hetzelfde artikel.

## Stap 2 — De sessie (met de domeinexperts)

Per kandidaatvraag, samen met de expert:

1. **Referentie-antwoord vaststellen.** Kort, feitelijk, en gedekt door de CAO-tekst. Leg de nuance
   vast (uitzonderingen, voorwaarden, "hangt af van…").
2. **Verwacht artikel/lid bepalen.** Welk artikel (en eventueel lid) is de bron? Dit wordt
   `expectedArticle` / `expectedLid` — waar `G3-fund` op matcht.
3. **Categorie kiezen.** `in_scope`, `table` (loonschaal/tabel), of `refusal` (staat niet in de CAO →
   het model hoort netjes door te verwijzen).
4. **Twijfel = weglaten.** Een case waarover de experts twijfelen, gaat niet in de set. De golden set
   is een norm; een dubieuze norm is erger dan een ontbrekende.

Praktisch: houd de sessie kort en concreet, werk vraag-voor-vraag een gedeeld document bij, en laat de
experts aan het eind expliciet akkoord geven ("dit is onze standaard"). Dat akkoord is de milestone.

## Stap 3 — Committen & meten

1. **Naar JSONL.** Zet de gevalideerde cases in `packages/agents/src/evals/fixtures/golden-set.<fonds>.jsonl`.
   Schema (per regel): `id`, `question`, optioneel `history`, `expectedArticle`/`expectedLid`
   (verplicht voor antwoordbare cases), `referenceAnswer`, `category`. Weiger-cases dragen géén
   `expectedArticle` — het zijn out-of-corpus probes.
2. **Fonds registreren.** Voeg het fonds toe aan `FUND_SET_META` in `golden-set.ts`: de
   `corpusVersion` (eigen snapshot-tag van dít fonds) en het `fund`-id waar de corpus is ingeladen
   (`retrieveContext`-target). Een set-bestand zonder registratie faalt bewust bij het laden.
3. **Corpus inladen.** De echte CAO van het fonds moet in de database staan onder dat `fund`-id
   (`scripts/ingest/run.ts … --fund <fonds>`). De fonds-laag draait tegen die corpus, niet tegen
   fixtures — dat is het hele punt.
4. **Review-log bijwerken.** Documenteer de validatie per case in
   `fixtures/golden-set.REVIEW.md` (verdict + bron-artikel). Dit is het bewijs dat de set is
   nagelopen, niet gegenereerd.
5. **Meten.** `G3-fund` draait nachtelijks (heeft een DB nodig; slaat over op PR's). De recall/MRR per
   fonds en de weiger-guard landen apart in `eval-report.json` onder `funds[]`. De drempels zijn eerst
   **provisioneel** (zie `RETRIEVAL_INTEGRATION_THRESHOLDS`): meet ~2 weken nachtelijke runs en trek
   ze dan aan.

## Herbruikbaar voor fonds #2

Voor een volgend fonds verandert alleen de **inhoud**, niet het proces of de code-vorm:

1. Verzamel kandidaatvragen (harvest-feedback + corpus van fonds #2).
2. Co-creatiesessie → gevalideerde cases.
3. `golden-set.<fonds2>.jsonl` + een `FUND_SET_META`-regel + de corpus ingeladen onder het nieuwe
   `fund`-id.
4. `G3-fund` pikt het nieuwe set-bestand automatisch op (glob `golden-set.*.jsonl`) en rapporteert het
   als een aparte laag.

Geen nieuwe code per fonds: één keer bouwen (de fonds-laag), per fonds configureren via data — precies
het control-plane/data-plane-principe uit `.cursor/rules/200-architecture.mdc`.

## In de menukaart

De uitkomst van dit ritueel is een concreet verkoopbaar item: *"een door úw experts gevalideerde
CAO-standaard, met een nachtelijke meting die aantoont dat de agent het juiste artikel vindt en niets
verzint."* De sessie zelf is de eerste tastbare samenwerking met het fonds; de golden set is het
blijvende bewijs. Zo wordt kwaliteit een aankoopbaar product in plaats van een belofte.
