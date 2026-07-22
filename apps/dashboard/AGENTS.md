# apps/dashboard

**Wat dit is:** `dashboard.wunderling.nl` — één Next-app met twee gezichten (Fase 3):
- **`(fund)`** (root `/`): een fonds ziet zijn eigen KPI's, query-log, onbeantwoorde vragen en een
  read-only corpuspaneel — uitsluitend voor de eigen tenant.
- **`(admin)`** (`/admin`): Wunderling ziet het agent-overzicht per instance + detail met het
  release-manifest. Hier landt later ook het console-beheer (embed/keys/theming, Fase 4, D12).

## Regels
- **Read-only op data.** Het dashboard leest KPI's via `@wunderstack/analytics` (D4). In deployment
  draait het op de **read-only** DB-user; het schrijft nooit interaction-events of corpus. De enige
  schrijver is het `create-user`-seed-script (met de read-write `DATABASE_URL`, out-of-band).
- **Nooit `@wunderstack/agents` importeren** (CI: `no-dashboard-to-agents`). Agent-identiteit komt uit
  de app-lokale release-manifest-naad (`lib/release-manifest.ts`), zodat de Mastra-runtime nooit in dit
  read-only oppervlak belandt. Vervang de naad door de echte manifest-bron als het gate-restructure-
  spoor (PLAN-ui-ecosystem §7) landt.
- **Auth = Auth.js (NextAuth v5), Credentials + eigen `users`-tabel.** Rollen `admin` | `fund`;
  fund-users zijn tenant-scoped (D15). Route-toegang loopt via `decideAccess` (`lib/authz.ts`), server-
  side in elke area-layout — pure functie, unit-getest (`lib/authz.test.ts`). Zie
  `docs/decisions/DECISION-dashboard-auth.md`.
- **UI uit `@wunderstack/ui`.** Trust-patterns (KpiTile, AgentStatusBadge) + primitives (Table, Card,
  Field, Button, Chip). Alleen semantische tokens; geen agent-/model-scores in de fund-view.
- **Eerlijke metriek.** "Beantwoord met geverifieerde citaties" is de v1-maat; copy claimt niet meer.
  Ontbrekende manifest-velden tonen **n.n.b.** — geen verzonnen groene gate (§1).

## Draaien
`AUTH_SECRET` + `DATABASE_URL` in de root `.env`. User aanmaken:
`pnpm --filter dashboard create-user --email=... --password=... --role=admin`
(of `--role=fund --tenant=<id>`). Dan `pnpm --filter dashboard dev` (poort 3002).
