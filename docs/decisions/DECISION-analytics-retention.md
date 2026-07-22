# DECISION — Analytics event-log: retentie, privacy & observability (Fase 1)

**Status:** besloten · **Datum:** 2026-07-22 · **Hoort bij:** `docs/plans/PLAN-ui-ecosystem.md` Fase 1
**Raakt:** `packages/analytics`, `packages/db` (`interaction_events`, migraties 0005/0006),
`apps/runtime` (chat/feedback), `packages/agents/src/observability/*`

## Context

Fase 1 legt het event-log-fundament: elke agent-interactie landt met volledige dimensies in de
fondsdatabase, los van Langfuse (Langfuse = per-trace debugging; dit = duurzame product-metriek). Het
dashboard (Fase 3) leest hieruit. Dit document legt de privacy- en toegangsbeslissingen vast.

## Beslissingen

1. **Querytekst wordt gelogd, retentie 90 dagen.** `interaction_events.question` bevat de ruwe
   gebruikersvraag. Reden: het "onbeantwoorde vragen"-signaal is de corpus-roadmap (welke vragen kan
   de agent nog niet beantwoorden). De vraag is potentieel gevoelig, daarom een harde retentiegrens
   van **90 dagen**. De opschoning is nog niet geautomatiseerd (v1); tot dat er is, is dit een
   beleidsafspraak — implementeer een nightly `DELETE FROM interaction_events WHERE occurred_at < now() - interval '90 days'`
   zodra er productieverkeer is.

2. **Geen user-identificatie in embed v1.** `user_id` is nullable en blijft leeg voor embed-/publieke
   demo-gebruikers. Zij zijn pseudoniem; `session_id` (client-gegenereerd, per browser-sessie) is de
   enige koppeling en bevat geen identiteit.

3. **Één identiteitsmodel.** `session_id` is gedeeld tussen het event-log en de Langfuse-trace, zodat
   een rij in het dashboard en een trace in Langfuse aan elkaar te knopen zijn. `tenant_id` (D15) is
   de technische sleutel, `fund` het domeinwoord; 1-op-1 in v1.

4. **Read-only toegang via RLS + table-grants (D4) — géén eigen rol op managed Postgres.**
   *Herzien 2026-07-22 na live-test.* Scalingo's managed Postgres staat de app-rol **geen `CREATE ROLE`**
   toe (`permission denied to create role`), dus de oorspronkelijke `analytics_reader`-rol uit migratie
   `0006` past niet op het platform (die migratie is `insufficient_privilege`-tolerant en slaat de
   rolcreatie netjes over). De werkende aanpak (migratie `0007`, owner-runnable + idempotent):
   - **RLS aan** op `interaction_events` + een **SELECT-only policy `TO PUBLIC`**. Geen write-policy,
     dus elke niet-owner-rol wordt door RLS geweigerd voor INSERT/UPDATE/DELETE. De tabel-eigenaar
     (app/writer-rol, gebruikt door de runtime) omzeilt RLS en schrijft normaal.
   - De **dashboard-lezer is een door Scalingo geprovisionde read-only user**, niet een SQL-`CREATE ROLE`:
     `scalingo --app <app> --addon postgresql database-users-create --read-only <naam>`. Scalingo zet de
     SELECT-grants automatisch. Toegang = de SELECT-table-grant; de RLS-policy laat het lezen toe.
   - **Live-status (OOMT-DB, 2026-07-22) — bewezen.** Migraties `0005`–`0007` toegepast; RLS staat aan.
     Read-only user `testadmin` aangemaakt (niet-eigenaar; tabel-eigenaar = `wunderstack_8322`). Proef als
     `testadmin`: een door de eigenaar geschreven rij is **zichtbaar via `SELECT`** (RLS `TO PUBLIC`-policy
     geeft rijen vrij) en **`INSERT` wordt geweigerd** (`42501 permission denied for table`). De runtime
     (eigenaar) schrijft ongehinderd. Read-only-toegang is daarmee end-to-end aangetoond.

## Observability-status (Langfuse-gaten uit het plan)

- **LLM-kosten ≠ 0:** de generator-modellen (`mistral-large-2512` default, `mistral-small-2603`) staan
  al in `@wunderstack/ai`'s prijstabel; `pnpm --filter @wunderstack/agents sync-model-prices` duwt ze
  naar Langfuse. Geen codewijziging nodig — al aanwezig.
- **Embedding-latency om de echte HTTP-call:** al geïnstrumenteerd — `retrieveValidatedTimed` meet
  `embedMs` rond de Scaleway-`embed()`-call en zet dat op de retrieval-span. Geen wijziging nodig.
- **`session_id` / `user_id` / environment-tag / fund-metadata:** toegevoegd op de root-span
  (`startCaoTrace`) — metadata `{ sessionId, userId, environment, fund }` + tags `[cao-agent, fund, environment]`.
- **Embedding-kosten (`qwen3-embedding`): BEWUST UITGESTELD.** Langfuse berekent kosten uit
  token-usage × prijs; de query-embedding wordt nu als event-span zonder token-usage vastgelegd, dus
  een prijsdefinitie alléén levert geen kosten op. De embeddingkosten zijn bovendien verwaarloosbaar
  t.o.v. de LLM-kosten. Toevoegen vergt (a) input-tokens tellen + als generation-usage emitteren en
  (b) een aparte embedding-prijs-seam (niet in de soevereine chat-`MODEL_REGISTRY`, die guard-getest
  is). Follow-up wanneer embeddingkosten materieel worden.

## Niet in scope (v1)

- Geautomatiseerde retentie-opschoning (beleidsafspraak tot productieverkeer).
- Thema-classificatie (`theme` blijft null tot een classifier hem vult — regel van drie).
- PII-detectie/redactie op querytekst (90-dagen-retentie is de v1-mitigatie).
