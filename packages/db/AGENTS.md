# packages/db

**Wat dit is:** Drizzle-schema + client (enige DB-toegang, `400-data-rag`).

## Twee schema's (ADR-multitenant-database, tak B)

- `src/schema/control/` — dashboard, `agent_instances`, `agent_config`, `funds`, `users`,
  `eval_cases`, `audit_events`, `roleplay_scenarios`, `lti11_consumers` / `_nonces` / `_launches`.
- `src/schema/fund/` — `documents`, `chunks`, `interaction_events`, `roleplay_sessions`,
  `roleplay_messages`, `roleplay_reviews`, `roleplay_result_deliveries` in `fund_<key>`
  (unqualified names; `search_path` kiest het fysieke schema). Geen `CREATE ROLE` (tak B).
  Isolatie is D15, niet de rol. Promotie is **niet live**: `connection_key` is opaque (CHECK
  weigert `://`); DSN alleen via `resolveConnection` uit env. Geen extra pool op het request-pad.

Rollenspel staat aan beide kanten van die grens: het **scenario** is configuratie (control), de
**sessie** is fondsdata. Daarom is `scenario_slug` een gewone kolom en geen FK — een foreign key over
schema's heen zou de scheiding juist opheffen. Zie `docs/decisions/DECISION-roleplay-agent.md`.

Een beurt claim je met `fund_<key>.claim_roleplay_turn(session_id)`, nooit met lezen-dan-schrijven:
die functie verhoogt de teller en controleert `turns_used < max_turns` in hetzelfde statement.

LTI 1.1-consumers schrijft het dashboard via `getWriterDb()`. Nonces en launches schrijft de runtime
op `DATABASE_URL` tijdens de launch-POST — dat is control-plane, geen fondsschema.

## Connecties

| Functie | Env | Rol |
|---------|-----|-----|
| `getDb()` | `DATABASE_URL` | Default read (deploy: reader) |
| `getWriterDb()` | `TENANT_CONFIG_WRITER_DATABASE_URL` ?? `DATABASE_URL` | `agent_instances` + `roleplay_scenarios` + `lti11_consumers` updates |
| `getProvisionerDb()` | `PROVISIONER_DATABASE_URL` (**geen** fallback) | `createFundEnvironment` (DDL + control.*), dump-audit, soft-delete |

Fonds aanmaken: `createFundEnvironment` in `src/fund-environment.ts` — één atomaire transactie
(funds + schema + grants + instances + user + audit). Geen half fonds. Beheer: `src/fund-lifecycle.ts`
(dump via `pg_dump`, soft-delete `status=inactive`, geen `DROP SCHEMA`).

Twee migratiesporen. `packages/db/migrations/*.sql` (drizzle-journal) is **alleen** `control` en
`public`. Fondsschema's krijgen hun DDL uit `src/fund-ddl.ts` en houden hun eigen ledger in
`fund_<key>.schema_migrations` (`0001_provision`, `0002_roleplay`); bestaande fondsen bijwerken met
`pnpm db:migrate-fund-schemas`. Alle fonds-DDL is `IF NOT EXISTS`, dus dat commando is idempotent.
Let op: `pnpm db:generate` levert al sinds 0013 niets op (stale snapshots), dus control-migraties
schrijf je met de hand plus een `_journal.json`-regel.

Apps importeren geen `schema/fund` (CI: `no-apps-to-fund-schema`). Retrieval via `@wunderstack/rag`;
corpus-overzicht via `@wunderstack/analytics`.

Isolatie is D15 (één runtime-proces = één fonds). Geen `SET LOCAL ROLE` tot CREATE ROLE op de addon
bestaat. Cross-fonds-aggregatie alleen op control-tellers, nooit SQL over fondsschema's.
`GRANT TO PUBLIC` is verboden (`scripts/check-grants.sh`). Reader-login: `scripts/db/grant-reader.ts`.

Resolver: `resolveInstanceByPublicKey` / `resolveInstanceByFundAgent` in `src/resolve-instance.ts`.
Client-`fund` / `data-agent` valideren tegen de instance, nooit overrulen. `withFundContext` is
alleen `search_path` (organisatie), geen beveiligingsgrens.
