# DECISION — dashboard-auth & toegangsmodel (Fase 3)

**Status:** besloten (JW, 2026-07-22) · **Geamendeerd:** 25 augustus 2026 (fondsbeheer / provisioner) ·
**Gerelateerd:** `PLAN-ui-ecosystem.md` (Fase 3, D1/D2/D4), `DECISION-analytics-retention.md`

## Context
Het `apps/dashboard` heeft twee gezichten (fund + admin, D2) op één origin
(`dashboard.wunderling.nl`, D1). Het moet rollen kennen en per-fonds isoleren, en de fondsdata
read-only lezen (D4). Auth was nog geen concrete keuze; dit legt hem vast.

## Beslissingen

1. **Auth.js (NextAuth v5) + Credentials-provider + eigen `users`-tabel.** Soeverein: geen externe
   IdP, geen e-mail/SMTP-provider. Wachtwoorden gehasht met **node:crypto scrypt** (geen externe
   hashing-dependency), opgeslagen als `scrypt$<salt>$<hash>`. Rollen: `admin` (cross-tenant) en
   `fund` (tenant-scoped via `tenant_id`, D15-sleutel).
   - *Versie:* NextAuth **v5 (`5.0.0-beta.32`)** — de huidige Auth.js-lijn voor de App Router. Stabiel
     `latest` is nog v4 (clunky App-Router-ergonomie); v5-beta is jaren-volwassen en breed in productie,
     dus geen "dagenoude major" (100-stack). Herzien als v5 stable uitkomt (upgrade) of als een
     e-mail/SSO-eis binnenkomt.

2. **JWT-sessies (geen DB-adapter).** De sessie draagt `role` + `tenantId` + `mustChangePassword`,
   zodat route-gates en tenant-scoping geen DB-round-trip per request nodig hebben. Login doet één
   SELECT op `users`. Na een verplichte wachtwoordwissel wordt opnieuw `signIn` gedaan zodat de JWT
   de vlag `false` draagt.

3. **Toegang server-side per area-layout via een pure `decideAccess`-functie** (`lib/authz.ts`), niet
   via edge-middleware. Reden: robuuster met env (de DB/secret laadt in het node-proces via
   `next.config`), en de pure functie is **unit-testbaar** — dat is het DoD-bewijs "admin-routes
   aantoonbaar geweigerd" (`lib/authz.test.ts`). Een fund-sessie op `/admin` wordt geredirect naar `/`;
   anoniem → `/login`. Is `mustChangePassword` waar, dan is de enige toegestane route `/password`
   (ook voor admin).

4. **Tenant-isolatie op query-niveau (v1), procesgrens D15.** KPI-queries filteren op `tenant_id` uit
   de sessie (`@wunderstack/analytics`). Geamendeerd 21 augustus 2026: het control plane mag
   meerdere fondsen kennen; de runtime blijft 1-op-1 ([ADR-multitenant-database.md](../architecture/ADR-multitenant-database.md)
   tak B). DB-RLS-per-tenant / SET ROLE is geen vervanging in deze reeks; de read-only Scalingo-user
   + de bestaande RLS op `interaction_events` (zie DECISION-analytics-retention) blijven de basis.

5. **Drie database-connecties.**
   - **Reader** (`DATABASE_URL` → `getDb()`): SELECT voor login, KPI's, corpus. In deploy: read-only
     Scalingo-login (D4).
   - **Tenant-config writer** (`TENANT_CONFIG_WRITER_DATABASE_URL` → `getWriterDb()`, valt terug op
     `DATABASE_URL`): schrijven op `control.agent_instances` (embed-console).
   - **Provisioner** (`PROVISIONER_DATABASE_URL` → `getProvisionerDb()`, **geen** terugval):
     `createFundEnvironment` (CREATE SCHEMA + control.*) en wachtwoordwissel, dump-audit, soft-delete
     van `control.funds`. Lokaal: zelfde waarde als `DATABASE_URL`. Out-of-band blijft `create-user`
     het CLI-pad voor ad-hoc accounts (upsert toegestaan); de UI mag nooit stil andermans wachtwoord
     overschrijven. Extra fondsaccounts via `/admin/funds/<key>` (platform-admin).

6. **Admin-manifest via een getypte naad met eerlijke stub.** Release-tag, gate-status, goldenset-/
   corpus-/profiel-/invariantversie en threshold-afwijkingen komen uit het release-manifest dat het
   **gate-restructure-spoor (§7)** levert — dat bestaat nog niet. Tot dan retourneert
   `lib/release-manifest.ts` een stub (`gateStatus: "unknown"`, velden `null`) en toont de admin-view
   **n.n.b.** i.p.v. een verzonnen groene gate (§1). De getypte `ReleaseManifest`-vorm is het contract
   waartegen de view al rendert; alleen de provider hoeft te wisselen als §7 landt.

## Bewust niet nu
Wachtwoord-vergeten-flow · e-mail/SSO · uitnodigingstokens · DB-RLS-per-tenant · DNS/TLS-provisioning
(infra-actie, buiten de repo). Hard delete (`DROP SCHEMA`) en restore.
