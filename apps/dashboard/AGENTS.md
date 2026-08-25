# apps/dashboard

**Wat dit is:** `dashboard.wunderling.nl` — één Next-app met twee gezichten (Fase 3),
dezelfde routegrammatica, rechtenverschil (`canWrite` / tabs):

- **`(fund)`** (root `/`): fondsbeheerder ziet Overzicht en Agents voor de eigen tenant
  (`session.user.tenantId` — nooit uit de URL). Geen Distributie, Huisstijl, Teksten of Beheer.
- **`(admin)`** (`/admin`): platform — aandacht op `/admin`, agenttypes op `/admin/agents`,
  fondsen op `/admin/funds/[fundKey]` (Overzicht · Agents · Huisstijl · Accounts · Beheer) en
  per plaatsing `/admin/funds/[fundKey]/agents/[agentKey]` (Overzicht · Distributie · Teksten).

Laagindeling (welk gegeven waar): `docs/decisions/DECISION-dashboard-ia.md`.

## Database-connecties (drie)

| Connectie | Env | Mag |
|-----------|-----|-----|
| Reader (`getDb`) | `DATABASE_URL` | SELECT (login, KPI's, corpus). In deploy: read-only Scalingo-login. |
| Tenant-config writer (`getWriterDb`) | `TENANT_CONFIG_WRITER_DATABASE_URL` (fallback `DATABASE_URL`) | UPDATE op `control.agent_instances` (CORS, teksten, key-rotate). |
| Provisioner (`getProvisionerDb`) | `PROVISIONER_DATABASE_URL` (**geen** fallback) | `createFundEnvironment`, fund theme, dump-audit, soft-delete, wachtwoordwissel. |

## Regels
- **Read-only op corpus/events.** Interaction-events en corpus schrijft het dashboard nooit.
- **Nooit `@wunderstack/agents` importeren** (CI: `no-dashboard-to-agents`). Agent-identiteit komt uit
  `@wunderstack/shared` (`AGENT_KEYS`) + de app-lokale release-manifest-naad.
- **Auth = Auth.js (NextAuth v5), Credentials + eigen `users`-tabel.** Rollen `admin` | `fund`;
  fund-users zijn tenant-scoped (D15). `mustChangePassword` forceert `/password` via `decideAccess`.
  Zie `docs/decisions/DECISION-dashboard-auth.md`.
- **UI uit `@wunderstack/ui`.** Trust-patterns + primitives. Alleen semantische tokens; geen
  agent-/model-scores in de fund-view. Gedeelde panelen: `components/fund/`.
- **Eerlijke metriek.** "Beantwoord met geverifieerde citaties" is de v1-maat; copy claimt niet meer.
  Ontbrekende manifest-velden tonen **n.n.b.** — geen verzonnen groene gate (§1). Een fonds zonder
  events is "nog niet live", niet groen. KPI-scope = fondsschema, niet `tenant_id`.

## Draaien
`AUTH_SECRET` + `DATABASE_URL` + (lokaal) `PROVISIONER_DATABASE_URL` (= zelfde als `DATABASE_URL`) in
de root `.env`. User aanmaken:
`pnpm --filter dashboard create-user --email=... --password=... --role=admin`
(of `--role=fund --tenant=<id>`). Dan `pnpm --filter dashboard dev` (poort 3002).
