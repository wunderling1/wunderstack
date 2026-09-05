# DECISION — Kennisgaten

**Status:** besloten · **Datum:** 4 september 2026 · **Vervangt:** concept-beslisnotitie v2
(3 september 2026). Amendeert S18 in `DECISION-dashboard-indeling.md`.
**Geamendeerd:** 5 september 2026 — D2 → A3' door
[DECISION-weigeringstypen.md](./DECISION-weigeringstypen.md); van kracht bij Fase 1.

**Scope:** de pagina Signalen (`/signals`, sectie Kennisgaten) en het Acties-blok op Overzicht,
fondsgezicht.

## Besluiten

| # | Vraag | Besluit |
|---|---|---|
| **D1** | Telt het hoofdgetal vragen of gaten? | **Vragen** — exact af te leiden; schuift niet mee met groepering. |
| **D2** | Ziet het fonds guard-afvangsten? | **Nee.** `guard_*` blijft admin-only. Fondslijst toont alleen `out_of_domain`, `out_of_scope` en `partial_evidence` (ook bij sterke retrieval). `no_coverage` volgt de oude regel: sterk → admin, zwak of nul hits → fonds. Geen `adversarial`-reason. *(A3', 5 september 2026 avond; van kracht bij weigeringstypen Fase 1.)* |
| **D4** | Letterlijke vraag of parafrase? | **Letterlijk** (meest voorkomende variant in de groep). |
| **D8** | Eenheid van "meest gesteld"? | Bijna-letterlijke groep, gelabeld als *meest gestelde vragen*. |
| **D9** | Sortering | **Frequentie, dan recentheid.** |
| **D10** | Paginering | **Ja** — `?page=`, 50 groepen per pagina. |

Vervallen uit eerdere versies: drempel van 3 (S18-oude), inbox/statussen/wegklikken, thema-classifier.

## Classificatie (beslisboom per beurt)

```
outcome = 'refused'?
├─ nee  → niet op deze pagina
└─ ja   → outcome_reason
          ├─ guard_*  → NIET op de fondslijst (admin: verdachte weigering)
          ├─ out_of_domain | out_of_scope | partial_evidence
          │     → OP DE PAGINA (ook bij sterke retrieval; kolom: weigertype)
          └─ no_coverage (en overige rest)
                retrieval sterk (retrieved_count > 0 én top_score ≥ 0.6)?
                ├─ ja  → NIET op de fondslijst (admin)
                └─ nee → OP DE PAGINA
                         retrieved_count = 0 → "geen enkele bron geraakt"
                         anders             → "raakt bronnen, maar te zwak"
```

Van kracht sinds weigeringstypen Fase 1 (5 september 2026): de kennisgaten-WHERE
volgt A3'. `out_of_domain` en `partial_evidence` zijn in Fase 1 nog niet
uitgezonden; de fondslijst toont dan `out_of_scope` plus zwakke `no_coverage`.

`RETRIEVAL_STRONG_MIN_SCORE = 0.6` heeft één bron:
`packages/analytics/src/retrieval-strength.ts`. Dat is **niet** agent-`minScore`
(CAO 0,48 / arbo 0,35). De kennisgaten-WHERE is **niet** meer de negatie van
sterke retrieval. A3': `out_of_domain` / `out_of_scope` / `partial_evidence`
altijd op de fondslijst; `no_coverage` blijft de negatie van sterke retrieval;
`guard_*` nooit op de fondslijst.

**Venster-implicatie (Fase 0, 5 september 2026):** live L3–L8
(`no_coverage`, top 0,424–0,592) blijven op de fondslijst als zwakke rest;
L9 (0,731) is admin. Fase 1 verplaatst alleen zwakke `guard_*` (L1/L2) van de
fondslijst. Dat was al waar onder oude D2; A3' parkeert injectie/meta bewust
in zwakke `no_coverage`. Bron:
[FASE-0-weigeringstypen-2026-09-05.md](../eval/FASE-0-weigeringstypen-2026-09-05.md) §2.

## Groepering en telling

- Groepssleutel = genormaliseerde vraag (lowercase, interpunctie eruit, whitespace
  samengetrokken) + `agent_id`.
- Weergavetekst = `mode()` van de originele vraagtekst.
- Distinct-gebruikers: threaded kanalen op `session_id`; `mcp`/`api` per event-id
  (`UNTHREADED_CHANNELS`). Prefixen `e:` / `s:` houden de sleutelruimtes gescheiden.
- Hoofdgetal = losse `count(*)` over de kennisgaten-WHERE — niet de som van groepen.

## Corpusaanwijzing

Twee vormen, **zonder** document-/hoofdstuknaam. Hits met titel en chapter bestaan in het
geheugen van retrieval, maar `interaction_events` bewaart alleen `retrieved_count` +
`top_score`. Een leesbare bron per beurt vraagt een schrijfkant + AVG-afweging — eigen latere
PR.

## Verificatie (§8 — gehouden tegen de code, 4 september 2026)

| Aanname | Uitkomst |
|---|---|
| `retrieved_count` / `top_score` op elke geweigerde beurt, ook MCP/API | **Bevestigd.** |
| Retrieval geeft top-k terug óók onder de drempel; `retrieved_count` telt ná filtering | **Gedeeltelijk.** Telling is ná agent-`minScore` (CAO 0.48 / arbo 0.35). Hits daaronder zijn niet gelogd; "te dun" bestaat alleen in de band agentvloer → 0.6. |
| Geraakte chunks herleidbaar tot document + hoofdstuk | **Onjuist** voor het event-log. Vandaar de corpusvorm zonder bronnaam. |
| `session_id` is `null` op MCP/API | **Onjuist.** Kolom is `NOT NULL`; MCP maakt per call een UUID. Distinct-actors gebruikt kanaal, niet null-coalesce. |
| `countKnowledgeGaps` en `listSignals` delen één WHERE | **Bevestigd.** |
| Overview gebruikt dezelfde opbouw als `/signals` | **Bevestigd** (`loadKnowledgeGapCount`). |
| Grondslag / lezersrol / bewaartermijn (R6) | Contractvraag — parallel; 90-dagenclaim is beleidsafspraak, nog geen job. |

## Implementatie

Query en model: `packages/analytics/src/signals.ts`. UI: `apps/dashboard/components/fund/signals.tsx`
en Acties in `overview.tsx`. Navigatielabel blijft "Signalen"; de sectiekop is "Kennisgaten".
Oefenadoptie blijft op dezelfde pagina (S17).
