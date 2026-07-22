# packages/analytics

**Wat dit is:** het event-log + de KPI-queries (Fase 1). Elke agent-interactie landt hier als één
duurzame rij in de fondsdatabase — los van Langfuse (dat is per-trace debugging; dit is de
product-metriek). Het dashboard leest hier via de read-only `analytics_reader`-rol (D4).

## Regels
- **DB-toegang alleen via `@wunderstack/db`** (400-data-rag): geen eigen `pg`-client. De tabel
  (`interaction_events`) leeft in `packages/db/schema.ts`; deze package schrijft/leest via de seam.
- **Identiteit (D15):** `tenantId` = instance-sleutel, `fund` = domeinwoord. `sessionId` is gedeeld
  met de Langfuse-trace (één identiteitsmodel). `userId` is nullable — embed-gebruikers zijn pseudoniem.
- **AVG:** `question` wordt gelogd voor de "onbeantwoorde vragen"-roadmapsignaal; retentie 90 dagen,
  geen user-identificatie in embed v1 (zie `docs/decisions/DECISION-analytics-retention.md`).
- **Best-effort schrijven:** een falende of niet-geconfigureerde DB mag nooit een antwoord breken;
  `recordInteractionEvent` degradeert naar `{ recorded: false }`.
