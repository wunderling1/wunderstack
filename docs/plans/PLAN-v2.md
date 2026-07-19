# PLAN.md — vervolg: kwaliteit & vertrouwen (Wunderstack, Fase 9–12)

> **Vervolg op v1.** De infrastructuur staat (Fase 0–8). Deze fasen schaven de CAO-agent
> van *werkend* naar *referentie-waardig* voor OOMT — betrouwbaar, herleidbaar, insluitbaar.
> Doel is niet "meer features" maar: **elk antwoord verwijst naar het juiste CAO-artikel,
> verzint niets, en dat is zichtbaar voor de gebruiker.** Voor een CAO-agent zíjn
> betrouwbaarheid en traceerbaarheid het product.
> Leidend blijft: `docs/PRODUCT_SPEC.md` (wat) en `.cursor/rules/*.mdc` (hoe).

## Zo voer je dit uit
- **Eén fase tegelijk.** In Cursor: *"Refer to `@docs/plans/PLAN.md` en `@docs/plans/PLAN-v2.md`. Ik ben klaar
  voor Fase X. Bouw alleen deze fase, volg de `.cursor/rules`, en ga niet door naar de volgende."*
- **Meet vóór je schaaft.** Fase 9 bouwt het meetinstrument; elke latere DoD is een
  *gemeten* winst t.o.v. de Fase 9-baseline, niet een gevoel.
- **Verifieer versies + provider-beschikbaarheid** vóór elke install (web search aan) — zie `100-stack.mdc`.
- **Alle code, namen en commits in het Engels**; packages onder `@wunderstack/*` (zie `000-core.mdc`).
- **Groen afsluiten:** elke fase eindigt met `typecheck + lint + test` groen en een commit.
- Ga pas door als de DoD van de vorige fase gehaald is.

---

## Fase 9 — Eval naar antwoordniveau + reranker aan  *← meetinstrument eerst*
**Doel:** meten wat de klant écht raakt (hallucinatie, foute bronvermelding, terecht "niet
gevonden") in plaats van alleen retrieval-hit-rate. Zonder dit is "kwaliteit verbeteren" giswerk.
Meteen de goedkoopste kwaliteitssprong meenemen: de reranker die al als pass-through klaarstaat.

**Maken/wijzigen:**
- `packages/agents/src/evals/fixtures/golden-set.jsonl` — echte OOMT-branche-CAO-vragen met
  verwacht artikel/lid + kernantwoord. Start vanuit de gelabelde set van Fase 3, uitbreiden
  richting ~40–60 cases. *Laat dit valideren door een domeinexpert bij OOMT* — dat is meteen
  een sales-asset én de kiem van de datamoat.
- `packages/agents/src/evals/cao.eval.ts` — uitbreiden met vier scores:
  **faithfulness** (antwoord volgt uit de context, geen verzinsel), **citation-correctness**
  (genoemd artikel + lid komt écht in de bron voor), **completeness**, en
  **refusal-calibration** (terecht doorverwijzen onder de drempel). LLM-as-judge via
  `packages/ai` (Mistral), soeverein pad.
- `packages/ai/src/rerank.ts` — model-naad voor `bge-reranker-v2-m3` (EU-provider; verifieer
  beschikbaarheid bij Scaleway, anders self-host — géén niet-EU default).
- `packages/rag/src/rerank.ts` — pass-through vervangen door echte call naar `packages/ai`.
- `packages/rag/src/retrieve.ts` — breed ophalen (top-20) → rerank → top-5.
- `.github/workflows/ci.yml` — eval-poort uitbreiden: faalt óók bij regressie op faithfulness
  en citation-correctness, niet alleen hit-rate.
- `.env.example` — reranker-config toevoegen.

**DoD:** `cao.eval.ts` draait de golden set en rapporteert alle vier scores; de reranker is
actief en zijn effect is **meetbaar** vastgelegd als nieuwe baseline in de eval-output; CI
blokkeert een prompt-/retrieval-/modelwijziging die faithfulness of citations verlaagt.

---

## Fase 10 — CAO-specifieke retrieval  *← grootste inhoudelijke hefboom*
**Doel:** de matige output aan de bron aanpakken. CAO's zijn hiërarchisch (hoofdstuk→artikel→lid)
en zitten vol loonschalen; platte-tekst-chunking verminkt beide. Drie ingrepen, op volgorde van impact.

**Maken/wijzigen:**
- `scripts/ingest/chunk.ts` — **(a) structuurbewuste chunking**: chunk op artikel/lid-grens en
  bewaar `chapter`, `article`, `lid`, `source_ref` als metadata. Dit verbetert retrieval én
  levert citations gratis.
- `scripts/ingest/parse.ts` — **(b) tabellen apart**: loonschalen/functiegroep-trede-tabellen
  detecteren en als eigen chunk-type (`table`) bewaren met leesbare serialisatie, zodat
  "wat verdient functiegroep X, trede Y" niet verminkt raakt. Waarschijnlijk je grootste
  enkele bron van slechte antwoorden.
- `packages/db/src/schema.ts` + `packages/db/migrations/0002_add_structure_metadata.sql` —
  structuurkolommen + `chunk_type` op `chunks`.
- `packages/rag/src/rewrite.ts` — **(c) query-rewriting**: jargon/afkortingen normaliseren en
  onderspecificeerde vragen verrijken vóór het embedden.
- `packages/rag/src/index.ts` — `rewrite → retrieve → rerank → assemble` bedraden.
- `scripts/ingest/run.ts` — herdraaien op de nieuwe chunk-structuur (idempotent).

**DoD:** heringest levert chunks mét structuur- en tabelmetadata; op de Fase 9-golden set is
er **gemeten winst** op citation-correctness en op de loonschaal-vragen specifiek; query-rewrite
is aantoonbaar niet-schadelijk (geen regressie) op de overige cases.

---

## Fase 11 — Grounding & agent-gedrag  *← van "kaal" naar "competent"*
**Doel:** de kaalheid verdwijnt door beter *gedrag*, niet door meer tools. Strak
antwoordcontract, doorvragen bij onderspecificatie, en nette scope-/transparantiegrenzen
(tegelijk UX en AI-Act-hygiëne, wat fondsen juist geruststelt).

**Maken/wijzigen:**
- `packages/agents/src/cao/prompt.ts` — antwoordcontract: **altijd artikel + lid citeren**,
  bronsnippet meegeven, en onder de retrieval-drempel netjes doorverwijzen ("dit staat niet
  in de CAO die ik ken") i.p.v. gokken. Expliciet: informatief, **geen individueel of
  juridisch advies**.
- `packages/agents/src/cao/agent.ts` — clarify-gedrag: bij onderspecificeerde vraag één
  gerichte tegenvraag ("in welke functiegroep val je?", "fulltime of parttime?") vóór het
  antwoord. CAO-vragen zijn bijna altijd onderspecificeerd; doorvragen voelt tienmaal competenter.
- `packages/agents/src/cao/tools.ts` — retrieval-tool output uitbreiden met de
  structuur-/bronmetadata uit Fase 10 (Zod-contract bijwerken).
- `packages/agents/src/types.ts` — agent-interface uitbreiden: gestructureerde `citations[]`
  en een `needs_clarification`-state (de app rendert dit later; Mastra blijft verstopt).
- Langfuse: clarify-turns, drempel-refusals en citation-count als tags/scores meetraceren.

**DoD:** de agent citeert consequent artikel + lid, stelt bij onderspecificatie eerst een
tegenvraag, weigert netjes onder de drempel, en blijft binnen scope; alles zichtbaar in
Langfuse. Op de golden set: **hogere completeness en refusal-calibration** dan de Fase 10-baseline.

---

## Fase 12 — UI die vertrouwen tóónt + feedbackloop
**Doel:** betrouwbaarheid zichtbaar maken en gebruikersoordelen terugvoeren als eigen
eval-data. Dit is tegelijk UX, bewijs richting fonds #2, en het aanzwengelen van de datamoat.

**Maken/wijzigen:**
- `apps/demo/components/chat/Citation.tsx` — inline bronvermelding die uitklapt naar de échte
  CAO-tekst (artikel + lid), gevoed door `citations[]` uit Fase 11.
- `apps/demo/components/chat/Feedback.tsx` — duim omhoog/omlaag + reden per antwoord.
- `apps/demo/app/api/feedback/route.ts` — POST, Zod-gevalideerd → Langfuse-score op de trace.
- `apps/demo/components/chat/Starters.tsx` + `apps/demo/app/(demo)/page.tsx` — starter-vragen
  zodat de lege chat niet kaal aanvoelt en de scope meteen duidelijk is.
- `apps/demo/public/widget/` + `apps/demo/app/api/chat/route.ts` — **white-label theming per
  fonds** (kleur/logo/starters via config), zodat de widget per klant insluitbaar is. Dit is
  de enige productization die nu al de moeite waard is — precies wat fonds #2 tastbaar maakt.
- `scripts/eval/harvest-feedback.ts` — negatieve feedback uit Langfuse oogsten als kandidaat-
  cases voor de golden set (menselijke review vóór opname). Zo worden gebruikersoordelen
  proprietary eval-data.

**DoD:** antwoorden tonen uitklapbare, kloppende citations; feedback landt als score op de
Langfuse-trace; de widget is per fonds te themen en insluitbaar op een externe testpagina;
`harvest-feedback.ts` produceert reviewbare kandidaat-cases → de loop (gebruik → data → eval →
betere agent) is dicht.

---

## Nog steeds buiten scope (naden staan klaar, niet bouwen)
Multi-tenancy / data-plane per fonds · tweede agent + Supervisor-pattern · per-klant
auth-middleware & deploys · fine-tuning van embeddings of LLM. Rerank + CAO-chunking +
query-rewriting halen het leeuwendeel van de kwaliteitswinst tegen een fractie van de
complexiteit; de rest is een latere PLAN-uitbreiding, niet nu.
