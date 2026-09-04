# Backlog — inventaris (niet sturend)

Peildatum: 4 september 2026. Bronnen: fase-0-audit, fase-1-audit, toets F1-01.

**Rangschikking:** `docs/plans/PLAN-q4-gereedheid.md`. Dit bestand is de
id-inventaris. De eerdere volgorde (B1 README → B2 tree → B3 AGENTS.md) was
reviewgericht en is ingetrokken.

Ids botsen niet herschrijven: **F0-04** is de eval die `PASSED` print terwijl
G2/G3 skippen (in het Q4-plan de hoog-risicopost die daar B1 heette). **B1**
in de tabel hieronder blijft de README, nu `laag`.

---

## Hoog risico, vóór go-live

| Id | Wat | Ernst (audit) | Risico |
|---|---|---|---|
| **F1-06** | 90-dagenclaim waarmaken of schrappen. AVG-belofte zonder job. | `licht` | `hoog` |
| **F1-01** | Eén canonieke schemafunctie + identiteitstest. Tak A (2026-09-04): geen incident. Duur bij fonds twee. | `blokkerend` in het register | `hoog` |
| **F0-04** | `turbo test` / eval print `PASSED` terwijl G2/G3 skippen. | `zwaar` | `hoog` |
| **F1-13** | Unit-test die `sovereign: false` weigert. | `licht` | `hoog` |
| **F1-04** | Theme-schema op de leesgrens. Wit-label = fonds 2–5. | `zwaar` | `hoog` |

Spoor 1 (uitrol) en spoor 2 (verwerker, AI Act 50, incidentpad) staan in het
plan, niet als F-nummer.

---

## Midden, meenemen als het uitkomt

| Id | Wat |
|---|---|
| **F1-03** | `getTenantConfig` is de CAO-rij. |
| **F1-08** | `agentKey` op `RetrievalInput` uit `profile.agentKey`. |
| **F1-02** | `agentKey` / catalog `id` / event `agentId`. |
| **F0-13** | Bearer-token in `.env.example`. |
| **F0-03** | Geen root-`dev`/`test`; turbo kent geen `build`. |

---

## Laag, na go-live

README (was review-B1), schone tree / `claude/` (was B2), AGENTS.md-drift
(was B3), instapdocument (was B4 — de negen “hier moest ik raden”-punten
blijven de inhoudsopgave als het document er ooit komt), F1-05, F1-07,
F1-09 t/m F1-12, F1-14, `STATUS.md`, marketing-arbo-status, latency-dump.

De negen punten, voor als B4 later geschreven wordt:

1. Welke string is het schema (`tenant` / `fund` / `fundKey` / opgeslagen `schemaName`)?
2. Wie vult `AgentQuestion.fund`?
3. `agentKey` op retrieval: profile-veld of stringliteral in de wrapper?
4. `found` versus `turnOutcome`.
5. `hits` versus `chunks`.
6. Catalog `id` versus `agentKey` versus event `agentId`.
7. Wat `getTenantConfig` werkelijk teruggeeft.
8. Dubbele arbo-rewrite.
9. Waarom `packages/tenant` bestaat terwijl db/rag het niet importeren.

---

## Fase 2–4

Niet vooraan. Fase 2 (`apps/runtime`) ná spoor 1, herwogen op risico. Fase 3
(dashboard) en 4 (playground, marketing, roleplay) na go-live.
