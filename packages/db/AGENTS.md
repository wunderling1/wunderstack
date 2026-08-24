# packages/db

**Wat dit is:** Drizzle-schema + client (enige DB-toegang, `400-data-rag`).

## Twee schema's (ADR-multitenant-database, tak B)

- `src/schema/control/` — dashboard, `agent_instances`, `agent_config`, `funds`, `users`,
  `eval_cases`.
- `src/schema/fund/` — `documents`, `chunks`, `interaction_events` in `fund_<key>`
  (unqualified names; `search_path` kiest het fysieke schema). Geen `CREATE ROLE` (tak B).
  Isolatie is D15, niet de rol. Promotie is **niet live**: `connection_key` is opaque (CHECK
  weigert `://`); DSN alleen via `resolveConnection` uit env. Geen extra pool op het request-pad.

Apps importeren geen `schema/fund` (CI: `no-apps-to-fund-schema`). Retrieval via `@wunderstack/rag`;
corpus-overzicht via `@wunderstack/analytics`.

Isolatie is D15 (één runtime-proces = één fonds). Geen `SET LOCAL ROLE` tot CREATE ROLE op de addon
bestaat. Cross-fonds-aggregatie alleen op control-tellers, nooit SQL over fondsschema's.
`GRANT TO PUBLIC` is verboden (`scripts/check-grants.sh`). Reader-login: `scripts/db/grant-reader.ts`.

Resolver: `resolveInstanceByPublicKey` / `resolveInstanceByFundAgent` in `src/resolve-instance.ts`.
Client-`fund` / `data-agent` valideren tegen de instance, nooit overrulen. `withFundContext` is
alleen `search_path` (organisatie), geen beveiligingsgrens.
