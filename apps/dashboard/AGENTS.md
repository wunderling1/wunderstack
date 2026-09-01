# apps/dashboard

**Wat dit is:** `dashboard.wunderling.nl` — één Next-app met twee gezichten (Fase 3),
dezelfde routegrammatica, rechtenverschil (`canWrite` / tabs):

- **`(fund)`** (root `/`): fondsbeheerder ziet Overzicht, Gesprekken, Signalen, Agents en
  Instellingen voor de eigen tenant (`session.user.tenantId` — nooit uit de URL). Schrijven is
  admin-only (`canWrite={false}` + `assertAdmin` op elke action).
- **`(admin)`** (`/admin`): platform — aandacht op `/admin`, agenttypes op `/admin/agents`,
  fondsen op `/admin/funds/[fundKey]` (zelfde vijf sidebar-items) en per plaatsing
  `/admin/funds/[fundKey]/agents/[agentKey]` (Overzicht · Corpus|Scenario's · Publicatie).
  Oude paden `/branding`, `/accounts`, `/manage`, `/distribution`, `/texts` en `/lti` redirecten.

Laagindeling (welk gegeven waar): `docs/decisions/DECISION-dashboard-ia.md`.

## Database-connecties (drie)

| Connectie | Env | Mag |
|-----------|-----|-----|
| Reader (`getDb`) | `DATABASE_URL` | SELECT (login, KPI's, corpus). In deploy: read-only Scalingo-login. |
| Tenant-config writer (`getWriterDb`) | `TENANT_CONFIG_WRITER_DATABASE_URL` (fallback `DATABASE_URL`) | UPDATE op `control.agent_instances` (CORS, teksten, key-rotate) en schrijven op `control.roleplay_scenarios` en `control.lti11_consumers`. |
| Provisioner (`getProvisionerDb`) | `PROVISIONER_DATABASE_URL` (**geen** fallback) | `createFundEnvironment`, fund theme, dump-audit, soft-delete, wachtwoordwissel. |

## Regels
- **Read-only op corpus/events.** Interaction-events en corpus schrijft het dashboard nooit.
- **Nooit `@wunderstack/agents` importeren** (CI: `no-dashboard-to-agents`). Agent-identiteit komt uit
  `@wunderstack/shared` + de app-lokale release-manifest-naad. Let op de twee lagen: `AGENT_KEYS` is
  elke instance-sleutel, `GROUNDED_AGENT_KEYS` de deelverzameling met een runtime-profiel.
  `/admin/agents` toont sinds fase 6 élke instance-sleutel, rollenspel incluis — zie
  `docs/decisions/DECISION-roleplay-agent.md` (R1). Auteurswerk op scenario's is admin-only; het
  fondsgezicht blijft alleen-lezen.
- **Auth = Auth.js (NextAuth v5), Credentials + eigen `users`-tabel.** Rollen `admin` | `fund`;
  fund-users zijn tenant-scoped (D15). `mustChangePassword` forceert `/password` via `decideAccess`.
  Zie `docs/decisions/DECISION-dashboard-auth.md`.
- **UI uit `@wunderstack/ui`.** Trust-patterns + primitives. Alleen semantische tokens; geen
  agent-/model-scores in de fund-view. Gedeelde panelen: `components/fund/`.
- **Eerlijke metriek.** "Beantwoord met geverifieerde citaties" is de v1-maat; copy claimt niet meer.
  Ontbrekende manifest-velden tonen **n.n.b.** — geen verzonnen groene gate (§1). Een fonds zonder
  events is "nog niet live", niet groen. KPI-scope = fondsschema, niet `tenant_id`.

## Dashboardindeling — Fase 0 (PR-1/PR-2)

Bron: `docs/decisions/DECISION-dashboard-indeling.md` (S9–S21) en
`docs/decisions/IMPLEMENTATIEPROMPT-dashboard-indeling.md` (PR-1 t/m PR-7). S1–S8 blijven gelden via
`docs/decisions/DECISION-dashboard-ia.md`.

| Bevestigd | Afwijking t.o.v. prompt |
|-----------|-------------------------|
| `TurnOutcome` in `@wunderstack/shared` incl. `unknown` (migratie) en `grounded` | Prompt miste `unknown` (PR-A2) en `grounded` |
| `retrievedCount` + `topScore` verplicht op event-input | — |
| `RETRIEVAL_STRONG_MIN_SCORE = 0.6` in analytics | — |
| Eerste echte meting via `measurementStartedAt(fundKey)` = `min(occurred_at) WHERE outcome_reason IS NOT NULL` | Live query 1 sept 2026 (na `0003_turn_outcome` op alle actieve fondsen): **null**. `demo` 5 events, `elektronische-detailhandel` 103, `eval-fixtures` 0, `oomt` 119 — allemaal `outcome_reason` leeg. `0003` zet historische rijen op `unknown`. D6-regel tot de eerste classificeerde turn: “meting nog niet gestart”, geen verzonnen datum. |
| KPI-scope = fondsschema (`fundKey`), niet `tenant_id` | — |

**PR-1 DoD — bestaande routes (ongeauth, 1 sept 2026, `:3002`):** `/login` 200; overige surfaces 307 naar login (geen 404). Lijst: `lib/existing-routes.test.ts`.

## PR-4 — Gesprekken

Fondsbrede lijst op `/gesprekken` en `/admin/funds/[key]/gesprekken`. Filters (agent, uitkomst, reden, periode) staan in de URL. Kaartvorm volgt het profieltype (`kind: grounded | exercise`), niet een `switch` op agentsleutel.

Het event-log heeft **geen antwoordtekst en geen citatiepayload** (D9: geen nieuwe kolommen). De grounded-kaart toont vraag, uitkomst, reden, citatietelling en permalink; het antwoordveld is bewust leeg i.p.v. verzonnen. Permalink: `/gesprekken/[uuid]` (event- of oefensessie-id), onafhankelijk van periodefilter en sessiecookie.

## PR-6 — Signalen

`/signalen` en `/admin/funds/[key]/signalen`. Drie blokken:

- **Kennisgaten:** `refused` + retrieval strength `none`, gegroepeerd op letterlijke vraag, gesorteerd op frequentie × recentheid.
- **Verdachte weigeringen:** dezelfde groepering voor `refused` + strength `strong`. Alleen op het admin-gezicht (werk voor ons).
- **Adoptie oefenagent:** `roleplay_sessions` per scenario (gekozen / afgebroken). Staat buiten de kennisgatlijst.

Aggregatiedrempel `SIGNAL_MIN_OCCURRENCES = 3` zit in de query (`packages/analytics/src/signals.ts`, `.having(count(*) >= …)`). Versmallen op agent/periode/thema is een WHERE vóór die HAVING: eronder is de uitkomst leeg, geen losse rijen. Geen clustering, geen gegenereerde thema’s. Elke rij permalinkt naar het gesprek (laatste event- of sessie-id).

## PR-5 — Agenttabs (S13)

Drie tabs, middelste volgt profieltype (`isGroundedAgentKey`): Corpus vs Scenario's. Publicatie bundelt teksten, snippet, CORS en (oefenagent) LTI. Sleutelrotatie staat in een eigen blok onderaan en vraagt de agentsleutel als bevestiging. Gate-drempels blijven op `/admin/agents/[id]`; de corpus-tab toont alleen wat de gate zei (uitslag, datum, artefact, zelfde corpusversie als de goedkeuring). Oefenagent: geen citatie- of weigerkolom.

## PR-7 — opruimen

Instellingen is huisstijl + accounts + fondsbeheer in één `SettingsView` (`canWrite`). Oude
`/branding`, `/accounts` en `/manage` redirecten daarheen. Gedeelde schermen leven één keer in
`components/fund/`. Elke schrijfactie begint met `await assertAdmin()` (niet alleen een verborgen
knop); de dump-POST geeft 403.

## Draaien
`AUTH_SECRET` + `DATABASE_URL` + (lokaal) `PROVISIONER_DATABASE_URL` (= zelfde als `DATABASE_URL`) in
de root `.env`. User aanmaken:
`pnpm --filter dashboard create-user --email=... --password=... --role=admin`
(of `--role=fund --tenant=<id>`). Dan `pnpm --filter dashboard dev` (poort 3002).
