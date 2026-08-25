# packages/db

**Wat dit is:** Drizzle-schema + client (enige DB-toegang, `400-data-rag`).

## Twee schema's (ADR-multitenant-database, tak B)

- `src/schema/control/` — dashboard, `agent_instances`, `agent_config`, `funds`, `users`,
  `eval_cases`, `audit_events`.
- `src/schema/fund/` — `documents`, `chunks`, `interaction_events` in `fund_<key>`
  (unqualified names; `search_path` kiest het fysieke schema). Geen `CREATE ROLE` (tak B).
  Isolatie is D15, niet de rol. Promotie is **niet live**: `connection_key` is opaque (CHECK
  weigert `://`); DSN alleen via `resolveConnection` uit env. Geen extra pool op het request-pad.

## Connecties

| Functie | Env | Rol |
|---------|-----|-----|
| `getDb()` | `DATABASE_URL` | Default read (deploy: reader) |
| `getWriterDb()` | `TENANT_CONFIG_WRITER_DATABASE_URL` ?? `DATABASE_URL` | `agent_instances` updates |
| `getProvisionerDb()` | `PROVISIONER_DATABASE_URL` (**geen** fallback) | `createFundEnvironment` (DDL + control.*), dump-audit, soft-delete |

Fonds aanmaken: `createFundEnvironment` in `src/fund-environment.ts` — één atomaire transactie
(funds + schema + grants + instances + user + audit). Geen half fonds. Beheer: `src/fund-lifecycle.ts`
(dump via `pg_dump`, soft-delete `status=inactive`, geen `DROP SCHEMA`).

Apps importeren geen `schema/fund` (CI: `no-apps-to-fund-schema`). Retrieval via `@wunderstack/rag`;
corpus-overzicht via `@wunderstack/analytics`.

Isolatie is D15 (één runtime-proces = één fonds). Geen `SET LOCAL ROLE` tot CREATE ROLE op de addon
bestaat. Cross-fonds-aggregatie alleen op control-tellers, nooit SQL over fondsschema's.
`GRANT TO PUBLIC` is verboden (`scripts/check-grants.sh`). Reader-login: `scripts/db/grant-reader.ts`.

Resolver: `resolveInstanceByPublicKey` / `resolveInstanceByFundAgent` in `src/resolve-instance.ts`.
Client-`fund` / `data-agent` valideren tegen de instance, nooit overrulen. `withFundContext` is
alleen `search_path` (organisatie), geen beveiligingsgrens.
