# Deploy — PUBLIC-grants intrekken (PR-A)

Datum: 22 augustus 2026.  
Addon: Scalingo managed Postgres (zelfde als [NOTE-db-rollen-en-pooling.md](../architecture/NOTE-db-rollen-en-pooling.md)).  
Geen wachtwoorden of connection strings in dit document.

Migratie `0014_revoke_public_grants` trekt `GRANT … TO PUBLIC` op schema `control` in (uit `0013`). Het dashboard draait op de **named reader-login** (`testadmin` op deze addon). Die login leefde tot `0014` op de PUBLIC-grant. Draai je `0014` zónder eerst `grant-reader`, dan kan Credentials-login `control.users` niet meer lezen.

Bestaande `fund_*`-schema's kregen PUBLIC-grants uit de oude `fund-ddl.ts`. Nieuwe schema's niet meer; de eenmalige revoke raakt alleen wat al bestaat.

## Volgorde (hard)

1. **ACL-snapshot vóór** (`inspect-grants`).
2. **`grant-reader`** — named role krijgt SELECT op `control` + `fund_*` (inclusief `users.password_hash`; Credentials-login heeft die nodig).
3. **`db:migrate`** — past `0014` toe (en eventuele latere tags zoals `0015`).
4. **`revoke-public-fund-grants --confirm`** — PUBLIC van bestaande fondsschema's.
5. **ACL-snapshot ná.** `PUBLIC grants on listed tables: 0`. Reader-rol behoudt SELECT.

Owner (`wunderstack_8322`) blijft overal bij. Isolatie blijft D15, niet de database ([ADR §11](../architecture/ADR-multitenant-database.md)).

## Commando's

Draai als addon-owner (`DATABASE_URL` = read-write). `DB_READER_ROLE` is de bestaande Scalingo read-only login — geen `CREATE ROLE`.

```bash
# 1. Snapshot (psql \dp-equivalent; logt geen DSN)
pnpm db:inspect-grants

# 2. Named reader vóór 0014 (of in hetzelfde venster direct erna)
DB_READER_ROLE=testadmin pnpm db:grant-reader

# 3. Control-plane REVOKE
pnpm --filter @wunderstack/db db:migrate

# 4. Bestaande fund_* PUBLIC-grants
pnpm db:revoke-public-fund-grants              # dry-run, print BEFORE
pnpm db:revoke-public-fund-grants -- --confirm  # REVOKE + AFTER

# 5. Snapshot
pnpm db:inspect-grants
```

Dry-run van stap 4 is verplicht vóór `--confirm`. Weigeren als de schema-lijst niet de verwachte fondsen is.

## Guards

- `grant-reader` weigert als `DB_READER_ROLE` ontbreekt of de rol niet in `pg_roles` staat.
- `0014` is een nieuwe migratie; `0013` niet nabewerken (die is al gedraaid).
- `revoke-public-fund-grants` zonder `--confirm` schrijft niets.
- CI: `scripts/check-grants.sh` faalt op nieuwe `TO PUBLIC` in migraties en `fund-ddl.ts`.

## Uitkomst (deze addon, 22 augustus 2026)

Sessie: `wunderstack_8322` / db `wunderstack_8322`. Geen DSN gelogd.  
`control.audit_events` bestond al (DEFAULT PRIVILEGES uit `0013`); `0015` is `IF NOT EXISTS` zodat migrate niet faalt.

### 1. Snapshot vóór

`drizzle migrations applied: 14` (`0014`/`0015` nog niet). Schema-ACL's hadden PUBLIC USAGE (`=U/…`). 22 tabellen met PUBLIC SELECT, waaronder `control.users` en `control.agent_instances`. `testadmin` had al SELECT op een deel van `control`, niet op `funds` en niet op `fund_*`.

```
control
  agent_instances: {…,testadmin=r/…,=r/…} PUBLIC
  users:           {…,testadmin=r/…,=r/…} PUBLIC
fund_demo / fund_elektronische-detailhandel / fund_eval-fixtures / fund_oomt
  chunks, documents, interaction_events, schema_migrations: {…,=r/…} PUBLIC
PUBLIC grants on listed tables: 22
```

### 2–4. Uitgevoerd

```
Granted SELECT on control + fund_* schemas to testadmin (not PUBLIC).
[✓] migrations applied successfully!   # 0014 REVOKE + rename connection_key; 0015 skipped (exists)
revoke-public-fund-grants --confirm     # vier fund_*-schema's
```

Dry-run schema-lijst: `fund_demo, fund_elektronische-detailhandel, fund_eval-fixtures, fund_oomt`.

### 5. Snapshot ná

`drizzle migrations applied: 16`. Schema-ACL's: owner + `testadmin=U`, geen PUBLIC. Tabellen: owner + `testadmin=r`, geen `=r/` voor PUBLIC.

```
control: {wunderstack_8322=UC/…,testadmin=U/…}
fund_*:  {wunderstack_8322=UC/…,testadmin=U/…}

control.users / agent_instances / audit_events / … : {wunderstack_8322=arwdDxtm/…,testadmin=r/…}
fund_*.chunks / documents / interaction_events:      {wunderstack_8322=arwdDxtm/…,testadmin=r/…}

PUBLIC grants on listed tables: 0
```

## Follow-up op een andere addon

Zelfde volgorde. `DB_READER_ROLE` is de read-only login van **die** addon, niet per se `testadmin`. Snapshot in deze notitie bijwerken of een kopie per omgeving.
