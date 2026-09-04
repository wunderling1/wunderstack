# Rubric — externe review

Peildatum: 4 september 2026. Meetlat voor codekwaliteit: assen, `ernst`,
`status`, `geldt`, en vanaf fase 2 `risico`. **Rangschikking van werk:**
`docs/plans/PLAN-q4-gereedheid.md` (4 september 2026). Dit bestand stuurt
de volgorde niet.

Oorspronkelijk doel: één meetlat voor een beoordelaar die de repo niet kent,
twee dagen heeft, en `claude/` meekrijgt. Dat denkraam blijft geldig om
bevindingen te labelen; het is geen go-live-plan.

Scope van fase 0 (repo-niveau): assen **A**, **B** (alleen het afdwingdeel) en
**F**, plus het register in §3. Inhoudelijke codekwaliteit binnen packages,
RAG-kwaliteit en domeincorrectheid vallen buiten deze rubric.

---

## §1 Assen

### A — Reproduceerbaarheid

Kan een vreemde de repo klonen en, uitsluitend op wat de repo zelf zegt, tot
een draaiende ontwikkelomgeving en tot groene gates komen?

| Cijfer | Wat je ziet |
|---|---|
| 5 | Verse clone volgt README; install, typecheck, lint, test, build en de eigen guards zijn groen zonder omwegen. Ontbrekende secrets staan in `.env.example` en falen luid. |
| 4 | Clone draait, maar één gedocumenteerde extra stap is nodig (tooling-versie, één env). |
| 3 | Clone draait na ongedocumenteerde stappen die een insider wel kent. |
| 2 | Een van de gates is rood, of de README zegt niets waarmee je kunt beginnen. |
| 1 | Verse clone strandt binnen 30 minuten, of werkt alleen via een omweg die een reviewer met twee dagen niet doet. |

Een omweg (handmatige binary, stille env, “even dit bestand kopiëren”) telt
niet als werken.

### B — Architectuurgrenzen, alleen het afdwingdeel

Is de belofte (pijl-regel, Mastra achter een naad, apps niet in het
fondsschema, UI zonder agents) een afspraak of een hek?

| Cijfer | Wat je ziet |
|---|---|
| 5 | Elke beloofde grens heeft een tool die rood wordt bij overtreding, en die tool draait in CI. |
| 4 | Grenzen staan in CI; één belofte is alleen ESLint of alleen depcruise, niet beide. |
| 3 | Grenzen staan in docs en in een lokaal script; CI draait het script niet, of het script dekt de belofte niet. |
| 2 | `rg` vindt de verboden import buiten de toegestane plek. De belofte is dan een afspraak. |
| 1 | Geen handhaving, of de handhaving is zelf een dode letter (script bestaat, CI slaat het over). |

Fase 0 oordeelt niet of de architectuur *goed* is. Alleen of hij *houdt*.

### F — Documentatie en redeneerspoor

Kan iemand die de repo nooit zag, binnen een dag binnen zijn, en klopt wat hij
leest met wat de code doet?

| Cijfer | Wat je ziet |
|---|---|
| 5 | Eén instapdocument; architectuur- en besluitstukken zijn `gebouwd` / `ontworpen` / `vervallen` zonder drift; `claude/` is een leesbaar spoor met index. |
| 4 | Instap is te vinden (niet één document); drift is incidenteel en gelabeld. |
| 3 | Veel documentatie, geen leesvolgorde; een buitenstaander weet niet wat leidend is. |
| 2 | Actieve drift: documenten beweren iets wat de code aantoonbaar niet doet. |
| 1 | Geen instap, of het redeneerspoor leeft alleen lokaal en untracked. |

Drift is zwaar, niet licht. Een `AGENTS.md` die de verkeerde file noemt, is
geen stijlfout.

---

## §2 Ernst, risico, status, geldigheid

Fase 0 en 1: drie labels (`ernst`, `status`, `geldt`). **Vanaf fase 2** krijgt
elke bevinding een vierde veld, `risico`. De twee meten iets anders; niet
samenknijpen.

**Ernst** — impact op het oordeel van de beoordelaar.

- `blokkerend` — een reviewer met twee dagen stopt hier, of het oordeel over
  de rest is daarna niet meer te herstellen.
- `zwaar` — kleurt het oordeel; vóór de review repareren als de kosten laag
  zijn.
- `licht` — noteerbaar, niet sturend.

De weegregel (max drie `blokkerend`, max een derde `zwaar`) gold in fase 0
en 1 op `ernst`, zodat een indruksas niet alles zwaar maakte. Vanaf
`PLAN-q4-gereedheid.md` sorteert `risico`; op die as is een plafond
schadelijk. De regel rangschikt geen werk meer.

**Risico** — kans × schade voor een draaiend fonds. **Sorteert** (zie het
Q4-plan). Geen plafond.

- `hoog` — kan een fonds verkeerd antwoorden, data lekken, of een
  verkoopclaim (soeverein, weigering, retentie) ongedekt laten.
- `midden` — fout pad bestaat, maar faalt veilig of treft alleen de
  volgende instance, niet de huidige.
- `laag` — documentatie, namen, tests die een hernoeming breken.

**Status**

- `gebouwd` — gezien in code of in een gedraaid commando.
- `ontworpen` — alleen in een document, geen pad in de code.
- `niet-geverifieerd` — de auditor kon het niet controleren; zeg wat er nodig
  was.

**Geldt**

- `nu (5 fondsen)` — het oordeel van déze review.
- `pas bij groei` — relevant later. Mag niet `blokkerend` zijn.

---

## §3 Register van bewuste afwijkingen

Een afwijking van wat een senior als default zou verwachten is geen bevinding
als de reden ergens in de repo staat, op een pad dat hij in het eerste uur
kan vinden. Ontbreekt de reden, dan is de afwijking een bevinding: hij leest
als slordigheid.

| Afwijking | Standaard zou zijn | Wat de reden minstens moet zeggen |
|---|---|---|
| Vlootmodel + schema-per-fonds bij n=5 | Multi-tenant met rijniveau-isolatie | Waarom tak B (D15, runtime-per-fonds) de default is en database-per-fonds het promotiepad. |
| Nederlandstalige besluitdocumenten | Engels, uniform | Dat Nederlands mag in docs en user-facing tekst; code blijft Engels. |
| `claude/` als redeneerspoor | ADR's, geen sessielogboek | Wat de map is, wat leidend is, en dat hij getrackt meekomt met de review. |
| Gate-architectuur G0–G5 bovenop CI | CI + testdekking | Waarom de G-lagen bestaan en hoe ze zich tot `pnpm turbo run test` verhouden. |
| Drempels als vloer, nooit verlaagd | Drempels bijstellen op waarneming | Dat een vloer niet zakt om groen te worden; demotie tot trend is de ontsnapping. |

Nieuwe afwijkingen die de auditor tegenkomt, horen in dezelfde tabel, met pad
of `ontbreekt`.
