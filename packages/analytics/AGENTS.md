# packages/analytics

**Wat dit is:** het event-log + de KPI-queries (Fase 1). Elke agent-interactie landt hier als één
duurzame rij in het **fondsschema** (tot de schema-verhuizing: dezelfde tabel in `public`) — los van
Langfuse (dat is per-trace debugging; dit is de product-metriek). Het dashboard leest hier via de
read-only Scalingo-user (D4). Cross-fonds-aggregatie alleen op control-tellers, nooit met SQL over
fondsschema’s ([ADR-multitenant-database.md](../../docs/architecture/ADR-multitenant-database.md)).

## Regels
- **DB-toegang alleen via `@wunderstack/db`** (400-data-rag): geen eigen `pg`-client. De tabel
  (`interaction_events`) leeft in `packages/db/schema.ts`; deze package schrijft/leest via de seam.
- **Identiteit (D15):** het fondsschema is de KPI-scope (`withFundSchema`). `tenant_id` op de rij
  is deployment-herkomst (welke runtime schreef), geen filter. `fund` = domeinwoord wiens corpus
  antwoordde. 1-op-1 **per runtime-proces** (tak B: D15 niet gecollapseerd). `sessionId` is gedeeld
  met de Langfuse-trace.
- **AVG:** `question` wordt gelogd voor de "onbeantwoorde vragen"-roadmapsignaal; retentie 90 dagen,
  geen user-identificatie in embed v1 (zie `docs/decisions/DECISION-analytics-retention.md`).
- **Best-effort schrijven:** een falende of niet-geconfigureerde DB mag nooit een antwoord breken;
  `recordInteractionEvent` degradeert naar `{ recorded: false }`.
- **Alleen grounded agents schrijven hier.** `agentId` in het event-contract is een
  `groundedAgentKeySchema`, geen vrije string. Een oefenagent heeft geen uitkomst maar een
  sessieverloop en leeft in `roleplay_sessions`; zijn volume lees je met `getExerciseActivity`.
  Twee tabellen, twee begrippen — zo hoeft geen enkele query de ander eruit te filteren
  (`DECISION-dashboard-indeling.md`, open eind 1).
- **Een query test je door hem te draaien.** Een `readFileSync` + regex op deze bronbestanden
  bewijst dat de query geschreven is, niet dat hij antwoordt — en blijft groen als het gedrag
  verandert. Gedragsclaims over `getOutcomeBreakdown`, `listConversations`, `listSignals`,
  `countKnowledgeGaps` en `measurementStartedAt` horen in
  `src/fund-environment.integration.test.ts` (echt schema). Broncodeguards mogen blijven voor
  claims *over de bron* (bv. "hier komt geen samenvatter binnen"), met dat verschil erbij genoteerd.
  **`SignalsQuery.theme` is dormant** — er is nog geen classifier; de dashboardfilter mag de param
  al tonen, maar analytics past geen theme-WHERE toe tot die classifier bestaat.
  Die integratietests draaien alleen met `DATABASE_URL` + `PROVISIONER_DATABASE_URL`; met
  `GATE_DB=true` en ontbrekende URL wordt de suite rood in plaats van overgeslagen (700-evals:
  skipped ≠ passed).
