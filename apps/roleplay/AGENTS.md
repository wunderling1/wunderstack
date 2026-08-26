# apps/roleplay

**Wat dit is:** de leerling-UI voor het rollenspel — een **UI-only** Next-app. De deelnemer leest
de briefing, speelt de tekstbeurt, en ziet de beoordeling. LTI 1.1-launch landt op dezelfde pagina
in een LMS-iframe (`?ltiToken=`, daarna `sessionStorage` + `x-lti-token`). Geen cookie-sessie.

## Regels
- **Geen agent-/businesslogica.** Importeer nooit `@wunderstack/agents` (CI: `no-roleplay-to-agents`),
  en ook niet `db` / `rag` / `ai` / `analytics`. Alle `/api/*`-calls worden via `next.config.mjs`
  `rewrites()` naar de runtime geproxyd (`RUNTIME_URL`, lokaal `:3000`).
- **Geen fondsschema.** Sessies leven in het fondsschema; deze app ziet ze alleen via HTTP.
- **UI uit `@wunderstack/ui`.** Semantische tokens; geen rauwe hex. Beurtenteller en doelstrip zijn
  app-lokaal (regel van drie / D16: één consumer). Fetch-logica blijft hier.
- **Open toegang.** Geen auth-gate in v1; de runtime rate-limitt. De tenant-key is een publieke
  identifier (`NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY`), hetzelfde model als playground/embed.
- **CSP + frame-ancestors** staan in `proxy.ts`. Default `frame-ancestors 'self'`; LMS-origins via
  `ROLEPLAY_ALLOWED_ORIGINS`. Geen `X-Frame-Options: DENY`. `Referrer-Policy: no-referrer` zodat een
  LTI-token in de URL niet via `Referer` lekt. CSP niet soepeler maken voor LTI
  (`docs/lti11-token-sessie.md`).
- Draait lokaal op `:3004`.

## Starten
`pnpm --filter roleplay dev`. Runtime op `:3000`. Scenario via
`http://localhost:3004/?scenario=<slug>` of het startformulier. Alleen `published` scenario's
starten een sessie.
