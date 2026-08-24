# apps/runtime

**Wat dit is:** de Wunderstack-runtime — een **API-only** Next-app (D14). Dit is het productoppervlak
dat naar elke fondsinstance én naar tenant zero deployt (D14, track B: geen gedeelde runtime).

## Regels
- **Geen UI.** Alleen `app/api/*` (route handlers), `lib/*` (perimeter/agent-seam), `proxy.ts` en een
  minimale health-page. Voeg hier geen pagina's, componenten of styling toe — die horen in `apps/playground`.
- **Fonds-agnostisch.** Geen hardcoded fondsreferenties. Tenant-/fonds-identiteit komt uit
  `@wunderstack/tenant` (leest `TENANT` uit env, D15). Keyed requests: fund + `agent_key` uit
  `control.agent_instances` (`lib/instance-scope.ts`); client-`fund` / `data-agent` valideren,
  nooit overrulen. Unkeyed demo: `lib/fund-scope.ts` (`CAO_FUNDS`). D15-muur in `lib/embed-auth.ts`
  (`instanceBelongsToProcess`). Geen `SET LOCAL ROLE`.
- **Unconfigured-open blijft open, zonder stille agentkeuze.** Nul actieve instances + geen key →
  auth levert `config: null` (D1). De agent komt dan alleen uit `RUNTIME_UNCONFIGURED_AGENT`
  (`.env.example` zet `cao` voor lokale/dev). Ontbreekt die var → `400 no_agent_instance`, geen
  CAO-antwoord. `pickUnkeyedInstance` (0/1/2+) niet wijzigen.
- **Agent-logica achter de seam.** Praat met agents uitsluitend via `@wunderstack/agents`; geen retrieval-
  of modellogica in route-handlers (dunne controllers: Zod-validatie → delegeren → streamen).
- Draait lokaal op `:3000`. De playground proxyt hierheen (`RUNTIME_URL`).
