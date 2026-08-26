# DECISION — dashboard information architecture

**Status:** accepted  
**Date:** 2026-08-25  
**Context:** Admin console and fund face mixed platform, fund, and agent concerns on flat
screens (`/admin/embed`, single scroll fund detail). KPI attribution filtered on `tenant_id`
inside the fund schema and double-counted across funds.

## Decision

Three levels. No screen edits two levels. Routes stay English; UI stays Dutch.

| Given | Level |
|---|---|
| Fund key, schema, display name | fund |
| `theme` (colour, accent, radius, logo) | fund |
| Accounts, password reset | fund |
| Schema dump, deactivate, audit | fund |
| Embed snippet, public key + rotation, CORS | agent (instance) |
| `texts` (tagline, intro, Article 50, starters) | agent |
| `roleplay_scenarios` (admin-only authoring) | agent (roleplay) |
| `lti11_consumers` (LMS-koppeling, opt-in cijferteruggave) | agent (roleplay) |
| Corpus / sources, persona / `agent_config` | agent (* later) |
| Release manifest, gates | platform (agent type) |
| KPIs | fund = sum, agent = detail |

### Settled rules (S1–S8)

1. **S1** — `theme` on the fund; `texts` on the agent. No per-agent colour override.
2. **S2** — `/admin/embed` removed (redirect → `/admin/funds`).
3. **S3** — `/admin/agents` is agent *types* (release/gates), not placements. Read-only.
4. **S4** — Fund and agent tabs are route segments, not client `Tabs`.
5. **S5** — One component set for admin and fund face; `canWrite` from `decideAccess`.
6. **S6** — No webhook URL on the agent page until `/api/webhook` is per-instance.
7. **S7** — Routes English (`/admin/funds`, `fundKey`); UI Dutch. Vocab: fonds, agent, sleutel.
8. **S8** — Status derived from activity. No column that says "live".

### KPI attribution

The fund schema is the scope (`withFundSchema`). `tenant_id` on `interaction_events` is
deployment provenance (which runtime wrote the row) and must not filter KPIs. Cross-fund
rollup uses `getAgentActivity` and attributes rows via `fundKey` (= schema source).

### Defaults deferred

- **D1** Fund role cannot edit branding in this slice.
- **D2** `agent_instances.theme` kept unused until a later drop PR.
- **D3** Conversations tab after A–E.
- **D4** Per-instance webhook is a separate slice.

## Consequences

- Admin navigates platform → fund → agent. Distribution and texts live on the agent page.
- Fund face mirrors Overzicht + Agents only; `tenantId` from session, never URL.
- Shared panels live in `apps/dashboard/components/fund/`.
