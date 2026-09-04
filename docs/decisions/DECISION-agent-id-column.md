# DECISION — Keep physical column `agent_id` (JS field `agentKey`)

**Status:** besloten · **Datum:** 2026-09-04 · **Hoort bij:** F1-02 remediatie (fase 0/1)

## Besluit

The fund-schema column `interaction_events.agent_id` stays. The TypeScript / Zod contract uses
`agentKey` (same values as `profile.agentKey` / `groundedAgentKeySchema`). Drizzle maps
`agentKey: text("agent_id")`.

## Why not rename the column

- Existing dumps, Scalingo data, and SQL indexes name `agent_id`.
- A rename needs a coordinated migration across every fund schema — cost without product gain.
- The confusion was the **JS name** (`agentId`) next to catalog/`agentKey`, not the storage name.

## Catalog

`listAgents()` still exposes `id: profile.agentKey` so dashboard/marketing routes that key on
`agent.id` keep working. Renaming catalog `id` → `agentKey` is a separate, app-facing change.

## Retentie / other open items

Unrelated. See `DECISION-analytics-retention.md` for the 90-day policy (not automated in v1).
