# DECISION — Kennisgaten

**Status:** besloten · **Datum:** 4 september 2026 · **Vervangt:** concept-beslisnotitie v2
(3 september 2026). Amendeert S18 in `DECISION-dashboard-indeling.md`.

**Scope:** de pagina Signalen (`/signals`, sectie Kennisgaten) en het Acties-blok op Overzicht,
fondsgezicht.

## Besluiten

| # | Vraag | Besluit |
|---|---|---|
| **D1** | Telt het hoofdgetal vragen of gaten? | **Vragen** — exact af te leiden; schuift niet mee met groepering. |
| **D2** | Ziet het fonds guard-afvangsten? | **Nee** — `refused` met sterke retrieval blijft admin-only ("Verdachte weigeringen"). |
| **D4** | Letterlijke vraag of parafrase? | **Letterlijk** (meest voorkomende variant in de groep). |
| **D8** | Eenheid van "meest gesteld"? | Bijna-letterlijke groep, gelabeld als *meest gestelde vragen*. |
| **D9** | Sortering | **Frequentie, dan recentheid.** |
| **D10** | Paginering | **Ja** — `?page=`, 50 groepen per pagina. |

Vervallen uit eerdere versies: drempel van 3 (S18-oude), inbox/statussen/wegklikken, thema-classifier.

## Classificatie (beslisboom per beurt)

```
outcome = 'refused'?
├─ nee  → niet op deze pagina
└─ ja   → retrieval sterk (retrieved_count > 0 én top_score ≥ 0.6)?
          ├─ ja  → NIET op de fondslijst (admin: verdachte weigering)
          └─ nee → OP DE PAGINA
                   retrieved_count = 0 → "geen enkele bron geraakt"
                   anders             → "raakt bronnen, maar te zwak"
```

`RETRIEVAL_STRONG_MIN_SCORE = 0.6` heeft één bron:
`packages/analytics/src/retrieval-strength.ts`. De kennisgaten-WHERE is de **negatie** van
sterke retrieval, zodat de twee filters niet kunnen driftten.

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
