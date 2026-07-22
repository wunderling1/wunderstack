# apps/runtime

**Wat dit is:** de Wunderstack-runtime — een **API-only** Next-app (D14). Dit is het productoppervlak
dat naar elke fondsinstance én naar tenant zero deployt.

## Regels
- **Geen UI.** Alleen `app/api/*` (route handlers), `lib/*` (perimeter/agent-seam), `proxy.ts` en een
  minimale health-page. Voeg hier geen pagina's, componenten of styling toe — die horen in `apps/playground`.
- **Fonds-agnostisch.** Geen hardcoded fondsreferenties. Tenant-/fund-identiteit komt uit
  `@wunderstack/tenant` (leest `TENANT` uit env, D15). Fund-autorisatie via `lib/fund-scope.ts` (`CAO_FUNDS`).
- **Agent-logica achter de seam.** Praat met agents uitsluitend via `@wunderstack/agents`; geen retrieval-
  of modellogica in route-handlers (dunne controllers: Zod-validatie → delegeren → streamen).
- Draait lokaal op `:3000`. De playground proxyt hierheen (`RUNTIME_URL`).
